import { z } from "zod";

export const MAX_QUERY_LENGTH = 280;
export const MAX_HISTORY_TURNS = 12;
const httpUrl = z.string().url().max(2000).refine((url) => { try { const parsed = new URL(url); return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; } }, "Invalid source URL");
export const searchResultSchema = z.object({
  title: z.string().max(300),
  url: httpUrl,
  source: z.string().max(200),
  snippet: z.string().max(6000),
  verified: z.boolean().optional(),
});

export const searchRequestSchema = z.object({
  query: z.string().trim().min(2, "Ask a question with at least two characters.").max(MAX_QUERY_LENGTH, `Keep your question under ${MAX_QUERY_LENGTH} characters.`),
  history: z.array(z.object({
    question: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
    answer: z.string().max(6000),
    topic: z.string().max(300).optional(),
    search_query: z.string().max(600).optional(),
    sources: z.array(searchResultSchema).max(5).optional(),
  })).max(MAX_HISTORY_TURNS).default([]),
});

export const searchResponseSchema = z.object({
  query: z.string(), answer: z.string().min(1), results: z.array(searchResultSchema).max(5),
  images: z.array(z.object({ title: z.string(), image_url: httpUrl, thumbnail_url: httpUrl, source_url: httpUrl, source: z.string() })).max(6),
  source_mode: z.enum(["serpapi", "duckduckgo", "wikipedia", "demo", "conversation"]),
  verified_sources: z.number().int().nonnegative(), duration_ms: z.number().nonnegative(),
  warning: z.string().nullish().transform((value) => value || undefined), followUps: z.array(z.string()).optional(),
  topic: z.string().optional(), search_query: z.string().optional(), context_used: z.boolean().optional(),
  answer_mode: z.enum(["extractive", "conversation", "clarification", "unavailable", "ai"]).optional(),
});
