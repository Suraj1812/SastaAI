from __future__ import annotations

import asyncio
import os
import re
import time
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import httpx
import trafilatura
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from openai import AsyncOpenAI
except ImportError:  # Optional until an OPENAI_API_KEY is configured.
    AsyncOpenAI = None  # type: ignore[assignment,misc]


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=280)


class SearchResult(BaseModel):
    title: str
    url: str
    source: str
    snippet: str


class ImageResult(BaseModel):
    title: str
    image_url: str
    thumbnail_url: str
    source_url: str
    source: str


class SearchResponse(BaseModel):
    query: str
    answer: str
    results: list[SearchResult]
    images: list[ImageResult]
    source_mode: str
    verified_sources: int
    duration_ms: int
    warning: str | None = None


app = FastAPI(
    title="Sasta AI API",
    description="Search, validate, and answer questions from the open web.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def source_name(url: str) -> str:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    return host.split(":")[0] or "web source"


def resolve_result_url(raw_url: str) -> str:
    if raw_url.startswith("/"):
        redirect_target = parse_qs(urlparse(raw_url).query).get("uddg", [""])[0]
        return unquote(redirect_target) if redirect_target else urljoin("https://duckduckgo.com", raw_url)
    return raw_url


def clean_text(value: str | None, limit: int = 500) -> str:
    return re.sub(r"\s+", " ", value or "").strip()[:limit]


async def search_serpapi(query: str, client: httpx.AsyncClient) -> tuple[list[SearchResult], list[ImageResult]]:
    response = await client.get(
        "https://serpapi.com/search.json",
        params={"engine": "google", "q": query, "api_key": os.getenv("SERPAPI_API_KEY"), "num": 6},
    )
    response.raise_for_status()
    payload = response.json()
    results = [
        SearchResult(title=item.get("title", "Untitled result"), url=item.get("link", ""), source=source_name(item.get("link", "")), snippet=clean_text(item.get("snippet")))
        for item in payload.get("organic_results", [])
        if item.get("link")
    ]
    image_response = await client.get("https://serpapi.com/search.json", params={"engine": "google_images", "q": query, "api_key": os.getenv("SERPAPI_API_KEY"), "ijn": "0"})
    image_response.raise_for_status()
    images = [
        ImageResult(title=clean_text(item.get("title"), 120), image_url=item.get("original", ""), thumbnail_url=item.get("thumbnail", ""), source_url=item.get("link", ""), source=source_name(item.get("source", item.get("link", ""))))
        for item in image_response.json().get("images_results", [])
        if item.get("original") and item.get("thumbnail") and item.get("link")
    ][:6]
    return results, images


async def search_wikimedia_images(query: str, client: httpx.AsyncClient) -> list[ImageResult]:
    response = await client.get("https://commons.wikimedia.org/w/api.php", params={"action": "query", "generator": "search", "gsrsearch": query, "gsrnamespace": 6, "gsrlimit": 6, "prop": "imageinfo", "iiprop": "url|mime", "iiurlwidth": 900, "format": "json"})
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", {}).values()
    images: list[ImageResult] = []
    for page in pages:
        info = (page.get("imageinfo") or [{}])[0]
        image_url = info.get("url", "")
        thumbnail_url = info.get("thumburl", image_url)
        source_url = info.get("descriptionurl", "https://commons.wikimedia.org")
        if image_url and thumbnail_url:
            images.append(ImageResult(title=clean_text(page.get("title", "Wikimedia image").removeprefix("File:"), 120), image_url=image_url, thumbnail_url=thumbnail_url, source_url=source_url, source="Wikimedia Commons"))
    return images


async def search_wikipedia(query: str, client: httpx.AsyncClient) -> tuple[list[SearchResult], list[ImageResult]]:
    response = await client.get("https://en.wikipedia.org/w/rest.php/v1/search/page", params={"q": query, "limit": 5})
    response.raise_for_status()
    pages = response.json().get("pages", [])[:5]
    results: list[SearchResult] = []
    images: list[ImageResult] = []
    for page in pages:
        key = page.get("key", "")
        if not key:
            continue
        url = f"https://en.wikipedia.org/wiki/{key.replace(' ', '_')}"
        snippet = BeautifulSoup(page.get("excerpt", ""), "html.parser").get_text(" ")
        results.append(SearchResult(title=clean_text(page.get("title", "Wikipedia reference"), 120), url=url, source="wikipedia.org", snippet=clean_text(snippet)))
    summaries = await asyncio.gather(*(client.get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{result.title.replace(' ', '_')}", timeout=8) for result in results), return_exceptions=True)
    for result, summary_response in zip(results, summaries):
        if not isinstance(summary_response, httpx.Response) or summary_response.status_code >= 400:
            continue
        summary = summary_response.json()
        original = (summary.get("originalimage") or {}).get("source")
        thumbnail = (summary.get("thumbnail") or {}).get("source") or original
        if original and thumbnail:
            images.append(ImageResult(title=result.title, image_url=original, thumbnail_url=thumbnail, source_url=result.url, source="Wikipedia"))
    return results, images


async def search_duckduckgo(query: str, client: httpx.AsyncClient) -> tuple[list[SearchResult], list[ImageResult]]:
    response = await client.get(
        "https://html.duckduckgo.com/html/",
        params={"q": query},
        headers={"User-Agent": "SastaAI/0.2 (+https://sasta.ai)"},
    )
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    results: list[SearchResult] = []
    for item in soup.select(".result")[:6]:
        link = item.select_one("a.result__a")
        if not link or not link.get("href"):
            continue
        url = resolve_result_url(link["href"])
        if not url.startswith(("http://", "https://")):
            continue
        snippet = item.select_one(".result__snippet")
        results.append(SearchResult(title=clean_text(link.get_text(" ")), url=url, source=source_name(url), snippet=clean_text(snippet.get_text(" ") if snippet else "")))
    return results, await search_wikimedia_images(query, client)


async def enrich_result(result: SearchResult, client: httpx.AsyncClient) -> tuple[SearchResult, str]:
    try:
        response = await client.get(result.url)
        extracted = trafilatura.extract(response.text, include_comments=False, include_tables=False) or ""
        return result, clean_text(extracted, 2400)
    except (httpx.HTTPError, UnicodeError):
        return result, ""


def fallback_answer(query: str, sources: list[tuple[SearchResult, str]]) -> str:
    evidence = [content for _, content in sources if content]
    if evidence:
        sentences = re.split(r"(?<=[.!?])\s+", evidence[0])
        summary = " ".join(sentences[:3]).strip()
        if summary:
            return summary
    if sources:
        return f"I found {len(sources)} relevant sources for “{query}”. Open the source cards below to review the evidence."
    return f"I couldn't find reliable results for “{query}”. Try a more specific question."


async def synthesize_answer(query: str, sources: list[tuple[SearchResult, str]]) -> tuple[str, str | None]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or AsyncOpenAI is None:
        return fallback_answer(query, sources), "Add OPENAI_API_KEY to generate a synthesized answer; the current answer uses extracted source text."

    evidence = "\n\n".join(
        f"SOURCE: {result.title}\nURL: {result.url}\nTEXT: {content or result.snippet}"
        for result, content in sources
    )
    try:
        client = AsyncOpenAI(api_key=api_key)
        completion = await client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            instructions="Answer only from the provided sources. Be direct, accurate, and mention uncertainty when sources disagree. Do not invent facts. Keep the answer under 120 words.",
            input=f"Question: {query}\n\nSources:\n{evidence}",
        )
        return completion.output_text.strip(), None
    except Exception as error:  # Keep search useful when an optional AI provider is unavailable.
        return fallback_answer(query, sources), f"AI synthesis was unavailable ({type(error).__name__}); showing extracted source evidence instead."


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "sasta-ai-api"}


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    return {"name": "Sasta AI API", "status": "ready"}


@app.post("/search", response_model=SearchResponse, tags=["search"])
async def search(request: SearchRequest) -> SearchResponse:
    started = time.perf_counter()
    query = request.query.strip()
    if len(query) < 2:
        raise HTTPException(status_code=422, detail="Ask a question with at least two characters.")

    timeout = httpx.Timeout(15.0, connect=8.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers={"User-Agent": "SastaAI/0.2 (research assistant; contact: hello@sasta.ai)", "Accept": "text/html,application/json"}) as client:
        mode = "serpapi" if os.getenv("SERPAPI_API_KEY") else "duckduckgo"
        try:
            results, images = await (search_serpapi(query, client) if mode == "serpapi" else search_duckduckgo(query, client))
        except (httpx.HTTPError, ValueError):
            results, images = [], []

        if not results:
            try:
                results, images = await search_wikipedia(query, client)
                mode = "wikipedia"
            except (httpx.HTTPError, ValueError):
                results, images = [], []

        enriched = await asyncio.gather(*(enrich_result(result, client) for result in results[:5]))
        answer, warning = await synthesize_answer(query, list(enriched))

    duration_ms = round((time.perf_counter() - started) * 1000)
    return SearchResponse(query=query, answer=answer, results=results[:5], images=images[:6], source_mode=mode if results else "demo", verified_sources=len(enriched), duration_ms=duration_ms, warning=warning)
