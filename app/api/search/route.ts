import { NextRequest } from "next/server";

type WikiSearchPage = {
  id: number;
  key: string;
  title: string;
  excerpt?: string;
  description?: string;
};

type WikiSummary = {
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
  description?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
};

export type SearchSource = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  verified: boolean;
};

export type SearchImage = {
  title: string;
  image_url: string;
  thumbnail_url: string;
  source_url: string;
  source: string;
};

export type SearchResponse = {
  query: string;
  answer: string;
  sources: SearchSource[];
  images: SearchImage[];
  followUps: string[];
  searchedAt: string;
  mode: "live" | "fallback";
};

const MAX_QUERY_LENGTH = 180;

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function makeFollowUps(query: string) {
  return [
    `What are the key takeaways from ${query}?`,
    `What are the pros and cons of ${query}?`,
    `Can you explain ${query} with an example?`,
  ];
}

function fallbackResponse(query: string): SearchResponse {
  const encodedQuery = encodeURIComponent(query);
  return {
    query,
    answer: `I couldn't reach the live index right now, but your search is ready to continue. Try again in a moment or open a broader search for “${query}” to explore the latest sources.`,
    sources: [
      { title: `Search results for “${query}”`, url: `https://www.google.com/search?q=${encodedQuery}`, domain: "google.com", snippet: "Open a broader web search while the live research index reconnects.", verified: false },
      { title: `Wikipedia search for “${query}”`, url: `https://en.wikipedia.org/w/index.php?search=${encodedQuery}`, domain: "wikipedia.org", snippet: "Browse encyclopedic context and related topics for this question.", verified: false },
    ],
    images: [],
    followUps: makeFollowUps(query),
    searchedAt: new Date().toISOString(),
    mode: "fallback",
  };
}

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!rawQuery) return Response.json({ error: "Add a question to start searching." }, { status: 400 });
  if (rawQuery.length > MAX_QUERY_LENGTH) return Response.json({ error: `Keep your question under ${MAX_QUERY_LENGTH} characters.` }, { status: 400 });

  const query = rawQuery.replace(/\s+/g, " ");

  try {
    const searchUrl = new URL("https://en.wikipedia.org/w/rest.php/v1/search/page");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("limit", "5");
    const searchResponse = await fetch(searchUrl, { cache: "no-store", headers: { "User-Agent": "SastaAI/1.0 (research assistant)" }, signal: AbortSignal.timeout(8000) });
    if (!searchResponse.ok) return Response.json(fallbackResponse(query));

    const searchData = (await searchResponse.json()) as { pages?: WikiSearchPage[] };
    const pages = (searchData.pages ?? []).slice(0, 4);
    if (!pages.length) return Response.json({ ...fallbackResponse(query), answer: `I couldn't find a strong match for “${query}”. Try adding a little more context, such as a location, timeframe, or specific goal.` });

    const summaries = await Promise.all(pages.map(async (page) => {
      try {
        const summaryResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`, { cache: "no-store", headers: { "User-Agent": "SastaAI/1.0 (research assistant)" }, signal: AbortSignal.timeout(5000) });
        if (!summaryResponse.ok) return null;
        return (await summaryResponse.json()) as WikiSummary;
      } catch { return null; }
    }));

    const sources = pages.map((page, index) => {
      const summary = summaries[index];
      const url = summary?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}`;
      return { title: summary?.title ?? page.title, url, domain: domainFromUrl(url), snippet: summary?.extract ?? stripHtml(page.excerpt ?? page.description ?? "A relevant reference for this question."), verified: Boolean(summary?.extract) } satisfies SearchSource;
    });
    const images = pages.flatMap((page, index) => {
      const summary = summaries[index];
      const thumbnail = summary?.thumbnail?.source;
      const original = summary?.originalimage?.source ?? thumbnail;
      if (!thumbnail || !original) return [];
      const url = summary?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}`;
      return [{ title: summary?.title ?? page.title, image_url: original, thumbnail_url: thumbnail, source_url: url, source: "Wikipedia" }];
    });
    const lead = sources[0];
    const answer = lead.verified ? `${lead.title} — ${lead.snippet}` : `I found ${sources.length} relevant references for “${query}”. Start with the sources below, then refine your question for a more focused answer.`;

    return Response.json({ query, answer, sources, images, followUps: makeFollowUps(query), searchedAt: new Date().toISOString(), mode: "live" } satisfies SearchResponse);
  } catch {
    return Response.json(fallbackResponse(query));
  }
}
