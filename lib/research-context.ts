import type { ConversationContext } from "./types";

export type ResolvedQuestion = { query: string; topic: string; context_used: boolean; intent: "search" | "clarify" | "greeting" | "recall" | "shorten" | "sensitive" | "unsupported" | "calculate" };
export const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();
const reference = /\b(it|its|itself|this|that|these|those|they|them|their|he|she|his|her|uska|uske|iski|iske|iska|woh)\b/i;
const elliptical = /^(?:and\b|also\b|what about\b|how (?:old|big|large|far|long|tall|fast|much|many)(?:\s*\?|$)|why\s*\??$|tell me more\b|explain more\b|give (?:me )?an example\b|pros and cons\b)/i;
const arithmetic = /^(?:(?:what is|calculate|solve|compute)\s+)?(-?\d+(?:\.\d+)?)\s*([+*/×÷-])\s*(-?\d+(?:\.\d+)?)[?\s]*$/i;

export function topicFromQuestion(question: string): string {
  return normalizeText(question.replace(/^(?:what (?:is|are)|who (?:is|was)|tell me about|explain|describe|define|what about|and what about|how does)\s+/i, "").replace(/^(?:the|a|an)\s+/i, "").replace(/[?!.]+$/, "")).slice(0, 300);
}

export function resolveQuestion(query: string, history: ConversationContext[] = []): ResolvedQuestion {
  const question = normalizeText(query);
  const latest = history.at(-1);
  const previousTopic = latest?.topic || (latest ? topicFromQuestion(latest.question) : "");
  let intent: ResolvedQuestion["intent"] = "search";
  if (arithmetic.test(question)) intent = "calculate";
  else if (/^(?:hi|hello|hey|namaste|thanks|thank you)[!.\s]*$/i.test(question)) intent = "greeting";
  else if (/\b(?:my name|what did (?:i|we) (?:ask|discuss)|what was (?:my|our) (?:first|last|previous) question|remember (?:my|that i)|i (?:am called|am named)|my name is)\b/i.test(question)) intent = "recall";
  else if (/^(?:summari[sz]e(?: (?:it|that|this|the answer))?|make (?:it|that|this) shorter|shorter(?: please)?|in one sentence|bullet points)[.!?\s]*$/i.test(question)) intent = latest ? "shorten" : "clarify";
  else if (/\b(?:how much|what dose|dosage|should i take|can i take)\b.*\b(?:medicine|medication|drug|insulin|antibiotic|paracetamol|ibuprofen)\b/i.test(question)) intent = "sensitive";
  else if (/\b(?:ignore (?:all |previous )?instructions|system prompt|api key|password|access token)\b/i.test(question)) intent = "unsupported";
  const namedSubject = /^(?:tell me about|explain|describe|define|what (?:is|are)|who (?:is|was))\s+(.+)/i.exec(question)?.[1];
  const standaloneSubject = Boolean(namedSubject && !/^(?:it|its|this|that|these|those|they|them|their|he|she|his|her)\b/i.test(namedSubject));
  const usesReference = !standaloneSubject && (reference.test(question) || elliptical.test(question));
  // A named new topic is a topic switch, not an ambiguous continuation.
  const explicitNewTopic = /^(?:and )?what about\s+(.+)/i.exec(question)?.[1];
  const isNewTopic = Boolean(explicitNewTopic && !reference.test(explicitNewTopic));
  const context_used = Boolean(latest && !isNewTopic && (usesReference || intent === "shorten" || intent === "recall"));
  if (intent === "search" && usesReference && !latest && !isNewTopic) intent = "clarify";
  let resolved = question;
  let topic = isNewTopic ? topicFromQuestion(question) : context_used ? previousTopic : topicFromQuestion(question);
  if (context_used && intent === "search") {
    resolved = question.replace(/\bits\b/gi, `${previousTopic}'s`).replace(/\b(?:it|this|that|they|them|these|those|he|she|his|her|uska|uske|iski|iske|iska|woh)\b/gi, previousTopic);
    if (resolved === question || !resolved.toLowerCase().includes(previousTopic.toLowerCase())) resolved = `${previousTopic}: ${question}`;
  }
  if (!topic) topic = previousTopic;
  return { query: resolved.slice(0, 600), topic, context_used, intent };
}

export function conversationAnswer(query: string, history: ConversationContext[], intent: ResolvedQuestion["intent"]): string {
  if (intent === "calculate") {
    const match = arithmetic.exec(query)!;
    const a = Number(match[1]), b = Number(match[3]), operator = match[2];
    if ((operator === "/" || operator === "÷") && b === 0) return "Division by zero is undefined.";
    const value = operator === "+" ? a + b : operator === "-" ? a - b : operator === "*" || operator === "×" ? a * b : a / b;
    return Number.isFinite(value) ? `${a} ${operator} ${b} = ${Number(value.toPrecision(12))}` : "That calculation is outside the supported number range.";
  }
  if (intent === "greeting") return /thank/i.test(query) ? "You're welcome! Ask another question whenever you're ready." : "Hi! Ask me a question and I'll find relevant sources for you.";
  if (intent === "clarify") return "Which topic do you mean? Add its name, or ask a first question so I can understand your follow-up.";
  if (intent === "sensitive") return "I can't recommend a personal medicine dose from web excerpts. Please ask a qualified doctor or pharmacist who knows your circumstances.";
  if (intent === "unsupported") return "I can't reveal credentials or private system instructions. Ask a research question instead.";
  if (intent === "shorten") {
    const sentences = history.at(-1)?.answer.match(/[^.!?]+[.!?](?:\s*\[\d+\])?/g)?.slice(0, /one sentence/i.test(query) ? 1 : 2);
    return (sentences?.join(/bullet/i.test(query) ? "\n• " : " ") || history.at(-1)?.answer || "Please ask a first question.").replace(/^(?=.)/, /bullet/i.test(query) ? "• " : "").trim();
  }
  const namePattern = /(?:my name is|i am called|i am named)\s+([\p{L}\p{M}][\p{L}\p{M} '-]{0,60})/iu;
  const newName = namePattern.exec(query)?.[1]?.replace(/[.!?].*$/, "").trim();
  if (newName) return `Got it — I'll call you ${newName} during this conversation.`;
  if (/my name/i.test(query)) {
    const knownName = [...history].reverse().map((turn) => namePattern.exec(turn.question)?.[1]?.trim()).find(Boolean);
    return knownName ? `You told me your name is ${knownName}.` : "You haven't told me your name in this conversation yet.";
  }
  if (!history.length) return "We haven't discussed anything yet. Ask your first question to get started.";
  if (/first/i.test(query)) return `Your first available question was: “${history[0].question}”.`;
  if (/last|previous/i.test(query)) return `Your previous question was: “${history.at(-1)?.question}”.`;
  return `We've discussed:\n${history.map((turn, index) => `${index + 1}. ${turn.question}`).join("\n")}`;
}
