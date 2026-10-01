import { z } from "zod";
import { conversationAnswer, normalizeText, resolveQuestion } from "./research-context";
import type { ImageResult, SearchRequest, SearchResponse, SearchResult } from "./types";

const wikiPages = z.object({ pages: z.array(z.object({ key: z.string(), title: z.string(), excerpt: z.string().optional(), description: z.string().optional() })).default([]) });
const wikiSummary = z.object({ title: z.string().optional(), type: z.string().optional(), extract: z.string().optional(), description: z.string().optional(), content_urls: z.object({ desktop: z.object({ page: z.string().optional() }).optional() }).optional(), thumbnail: z.object({ source: z.string() }).optional(), originalimage: z.object({ source: z.string() }).optional() });
const USER_AGENT = "SastaAI/0.3 (source-linked research; https://github.com/Suraj1812/SastaAI)";
const publicCache = new Map<string, { expires: number; text: string }>();
const stopWords = new Set("a an the is are was were be been being of for to in on at by from with and or but what which who whom when where why how can could would should do does did tell me about explain describe define please it its this that those these they them their i you we my your our more also give example work works know using use used uses".split(" "));
const attributeGroups = [
  ["old", "age", "formed", "formation", "billion", "million", "years"],
  ["far", "distance", "away", "kilometer", "kilometres", "kilometers", "km", "miles"],
  ["big", "large", "size", "radius", "diameter", "mass", "area", "kilometers"],
  ["invented", "inventor", "created", "creator", "developed", "designed", "founded", "conceived"],
  ["built", "constructed", "commissioned", "builder"],
  ["born", "birth", "birthplace"],
  ["hot", "temperature", "kelvin", "celsius"],
  ["discovered", "discovery", "discoverer"],
  ["capital", "city", "tokyo", "delhi"],
  ["long", "period", "orbit", "days", "year", "hours"],
  ["benefits", "advantages", "applications", "uses"],
];

export function textTokens(value: string): string[] {
  return [...new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter((token) => token.length > 1 && !stopWords.has(token));
}

export function stripHtml(value: string): string {
  const withoutTags = value.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "").replace(/<[^>]*>/g, " ");
  return normalizeText(withoutTags.replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
    const number = code.startsWith("x") ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
  }).replace(/&(amp|quot|apos|lt|gt|nbsp|ndash|mdash);/g, (_, code: string) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—" })[code] ?? "")).replace(/\s+([,.;:!?\)])/g, "$1").replace(/\(\s+/g, "(");
}

async function fetchPublicText(url: string, timeout = 7000): Promise<string> {
  const cached = publicCache.get(url);
  if (cached && cached.expires > Date.now()) return cached.text;
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  const size = Number(response.headers.get("content-length") ?? "0");
  if (size > 2_000_000) throw new Error("Source was too large");
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error("Source was too large");
  if (publicCache.size >= 100) publicCache.delete(publicCache.keys().next().value!);
  if (text.length <= 200_000) publicCache.set(url, { expires: Date.now() + 300_000, text });
  return text;
}

export function sourceScore(title: string, query: string, topic = ""): number {
  const lowerTitle = title.toLowerCase();
  const tokens = textTokens(query);
  const titleTokens = textTokens(title);
  let score = tokens.filter((token) => titleTokens.includes(token)).length * 5;
  if (lowerTitle === topic.toLowerCase() || lowerTitle === query.toLowerCase()) score += 30;
  if (/\b(disambiguation|list of|surname)\b/i.test(title)) score -= 50;
  const queryTokens = new Set(textTokens(topic || query));
  score -= Math.max(0, titleTokens.filter((token) => !queryTokens.has(token)).length - 1) * 4;
  if (/programming|code|coding|software/.test(query.toLowerCase()) && /programming/.test(lowerTitle)) score += 15;
  return score;
}

function splitSentences(text: string): string[] {
  return normalizeText(text).split(/(?<=[.!?])\s+(?=[A-Z\d"“])/).filter((sentence) => sentence.length >= 35 && sentence.length <= 900 && !/\[citation needed\]/i.test(sentence));
}

export function extractAnswer(query: string, results: SearchResult[]): { answer: string; supported: boolean } {
  const tokens = textTokens(query);
  const attributeTokens = new Set<string>();
  for (const group of attributeGroups) if (tokens.some((token) => group.includes(token))) group.forEach((token) => attributeTokens.add(token));
  const general = /^(?:what (?:is|are)|who (?:is|was)|tell me about|explain|describe|define)\b/i.test(query) && attributeTokens.size === 0;
  // Match the requested relationship, not merely a loose synonym in a long article.
  const focus = /\b(?:hot|temperature)\b/i.test(query) ? /\btemperature\b.*\d|\d[\d,.]*\s*(?:K\b|°[CF]|kelvins?|degrees)/i
    : /\bwhere\b.*\bborn\b/i.test(query) ? /\bborn\s+(?:in|at)\b|\bbirthplace\b/i
    : /\bwho\b.*\b(?:created|invented|developed|designed)\b/i.test(query) ? /\b(?:conceived|created|designed|developed|invented)\b.{0,150}\bby\b|\bbegan (?:working|developing)\b/i
    : /\bwhen\b.*\bborn\b/i.test(query) ? /\bborn\b.*\b\d{4}\b|\(\d{1,2}\s+\w+\s+\d{4}\b/i : undefined;
  const candidates = results.slice(0, 1).flatMap((result, sourceIndex) => {
    const sentences = splitSentences(result.content || result.snippet);
    return sentences.map((text, index) => {
      const words = new Set(textTokens(text));
      const matching = tokens.filter((token) => words.has(token)).length;
      const attributeMatches = [...attributeTokens].filter((token) => words.has(token)).length;
      const creatorQuestion = /\bwho\b.*\b(?:created|invented|developed|designed)\b/i.test(query);
      const focused = (!focus || focus.test(text)) && (!creatorQuestion || /\bby\s+[A-Z][a-z]+|\b[A-Z][a-z]+(?:\s+[A-Za-z]+){0,3}\s+began (?:working|developing)\b/.test(text));
      const specificity = focus && focused ? 25 + (/\b(?:surface|core)\b/i.test(text) ? 5 : 0) : 0;
      return { text, sourceIndex, index, attributeMatches, focused, score: matching * 2 + attributeMatches * 5 + specificity + (sourceIndex === 0 ? 3 : 0) + (general && index < 2 ? 8 : 0) - index * .015 };
    });
  });
  let selected = candidates.sort((a, b) => b.score - a.score).filter((candidate) => candidate.focused && (attributeTokens.size === 0 || candidate.attributeMatches > 0)).slice(0, general ? 3 : 2);
  if (attributeTokens.size > 0 && !selected.length) return { answer: "I found relevant sources, but couldn't locate a passage that directly answers that detail. The sources below may help you refine the question.", supported: false };
  if (!selected.length) return { answer: "I couldn't find enough readable evidence to answer reliably. Please make your question more specific or try again.", supported: false };
  selected = selected.filter((candidate, index, all) => all.findIndex((other) => other.text === candidate.text) === index).sort((a, b) => a.sourceIndex - b.sourceIndex || a.index - b.index);
  return { answer: selected.map((candidate) => `${candidate.text} [${candidate.sourceIndex + 1}]`).join("\n\n"), supported: true };
}

function followUps(topic: string): string[] {
  return [`Tell me more about ${topic}`, `What are the key facts about ${topic}?`, `How does ${topic} work?`].filter((query) => query.length <= 280);
}

async function wikipediaResults(query: string, topic: string): Promise<{ results: SearchResult[]; images: ImageResult[] }> {
  const searchUrl = new URL("https://en.wikipedia.org/w/rest.php/v1/search/page");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("limit", "6");
  const payload = wikiPages.parse(JSON.parse(await fetchPublicText(searchUrl.toString())));
  const ranked = payload.pages.filter((page) => !/\(disambiguation\)/i.test(page.title)).sort((a, b) => sourceScore(b.title, query, topic) - sourceScore(a.title, query, topic)).slice(0, 4);
  const sources = await Promise.all(ranked.map(async (page) => {
    let summary: z.infer<typeof wikiSummary> | undefined;
    try { summary = wikiSummary.parse(JSON.parse(await fetchPublicText(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`))); } catch { /* Keep unverified search snippets separate from readable evidence. */ }
    const url = summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}`;
    const result: SearchResult = { title: summary?.title || page.title, url, source: "en.wikipedia.org", snippet: summary?.extract || stripHtml(page.excerpt || page.description || ""), content: summary?.extract, verified: Boolean(summary?.extract) };
    const thumbnail = summary?.thumbnail?.source;
    const image = thumbnail && /^https:\/\//.test(thumbnail) ? { title: result.title, thumbnail_url: thumbnail, image_url: summary?.originalimage?.source || thumbnail, source_url: url, source: "Wikipedia" } : undefined;
    return { result, image, key: page.key };
  }));
  // Read paragraph text for the leading reference, instead of blindly returning its intro.
  if (sources[0]) {
    try {
      const html = await fetchPublicText(`https://en.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(sources[0].key)}/html`);
      const paragraphs = [...html.matchAll(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi)].map((match) => stripHtml(match[0])).filter((text) => text.length >= 50);
      sources[0].result.content = normalizeText(paragraphs.join(" ")).slice(0, 30_000) || sources[0].result.content;
      sources[0].result.verified = Boolean(sources[0].result.content);
    } catch { /* A source summary remains useful when full-page reading fails. */ }
  }
  return { results: sources.map(({ result }) => result), images: sources.slice(0, 3).flatMap(({ image }) => image ? [image] : []) };
}

export async function research(request: SearchRequest): Promise<SearchResponse> {
  const started = Date.now();
  const query = normalizeText(request.query);
  const resolved = resolveQuestion(query, request.history);
  const base: SearchResponse = { query, search_query: resolved.query, topic: resolved.topic, context_used: resolved.context_used, answer: "", results: [], images: [], source_mode: "conversation", verified_sources: 0, duration_ms: 0, answer_mode: "conversation", followUps: [] };
  if (resolved.intent !== "search") {
    const previous = request.history.at(-1);
    return { ...base, answer: conversationAnswer(query, request.history, resolved.intent), answer_mode: resolved.intent === "clarify" ? "clarification" : "conversation", results: resolved.intent === "shorten" ? (previous?.sources || []).map((source) => ({ ...source, verified: false })) : [], duration_ms: Date.now() - started };
  }
  try {
    const retrievalQuery = resolved.context_used ? resolved.topic : topicFromSearch(resolved.query);
    let retrieved = await wikipediaResults(retrievalQuery, resolved.topic);
    if (!retrieved.results.length && retrievalQuery !== resolved.query) retrieved = await wikipediaResults(resolved.query, resolved.topic);
    if (!retrieved.results.length) return { ...base, answer: `I couldn't find a strong source match for “${query}”. Try naming the exact person, product, place, or concept.`, source_mode: "wikipedia", answer_mode: "unavailable", duration_ms: Date.now() - started };
    const topic = resolved.context_used ? resolved.topic : retrieved.results[0].title;
    const readable = retrieved.results.map((result) => ({ ...result, content: result.verified ? result.content : "" }));
    const answer = extractAnswer(resolved.query, readable.filter((result) => result.verified));
    // Keep citations aligned to the displayed order and never claim inaccessible snippets were verified.
    const results = readable.filter((result) => result.verified);
    const topicTokens = textTokens(topic);
    const allowedImages = new Set(results.filter((result) => result.title.toLowerCase() === topic.toLowerCase() || (topicTokens.length > 1 && result.title.toLowerCase().includes(topic.toLowerCase()))).map((result) => result.url));
    const images = retrieved.images.filter((image) => allowedImages.has(image.source_url));
    const currentQuestion = /\b(latest|current|today|right now|this week|price|weather|stock)\b/i.test(query);
    return { ...base, topic, answer: answer.answer, results: results.map(({ content: _content, ...result }) => result), images, source_mode: "wikipedia", answer_mode: answer.supported ? "extractive" : "unavailable", verified_sources: results.length, duration_ms: Date.now() - started, followUps: followUps(topic), warning: currentQuestion ? "Wikipedia excerpts may not reflect live updates. Confirm time-sensitive details with an official current source." : answer.supported ? undefined : "The retrieved evidence did not establish a direct answer. No answer was invented." };
  } catch {
    return { ...base, answer: "The source service is temporarily unavailable. Your earlier answers are still here; please try this question again in a moment.", source_mode: "wikipedia", answer_mode: "unavailable", warning: "Couldn't retrieve live evidence for this question.", duration_ms: Date.now() - started };
  }
}

function topicFromSearch(query: string): string {
  return normalizeText(query.replace(/^(?:what (?:is|are)|who (?:is|was)|tell me about|explain|describe|define|what about|and what about)\s+/i, "").replace(/^(?:the|a|an)\s+/i, "").replace(/[?!.]+$/, ""));
}
