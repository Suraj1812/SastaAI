export type SearchResult = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  content?: string;
};

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
  source_mode: "serpapi" | "duckduckgo" | "wikipedia" | "demo";
  verified_sources: number;
  duration_ms: number;
  warning?: string;
  followUps?: string[];
};
