export type SearchResult = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  content?: string;
  verified?: boolean;
};

export type ConversationContext = {
  question: string;
  answer: string;
  topic?: string;
  search_query?: string;
  sources?: SearchResult[];
};

export type SearchRequest = { query: string; history: ConversationContext[] };

export type ImageResult = {
  title: string;
  image_url: string;
  thumbnail_url: string;
  source_url: string;
  source: string;
};

export type SearchResponse = {
  query: string;
  answer: string;
  results: SearchResult[];
  images: ImageResult[];
  source_mode: "serpapi" | "duckduckgo" | "wikipedia" | "demo" | "conversation";
  verified_sources: number;
  duration_ms: number;
  warning?: string;
  followUps?: string[];
  topic?: string;
  search_query?: string;
  context_used?: boolean;
  answer_mode?: "extractive" | "conversation" | "clarification" | "unavailable" | "ai";
};
