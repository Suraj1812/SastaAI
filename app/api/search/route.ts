import { NextRequest } from "next/server";
import { research } from "../../../lib/research";
import { searchRequestSchema, searchResponseSchema } from "../../../lib/search-contract";
import type { SearchRequest } from "../../../lib/types";

const BODY_LIMIT = 120_000;
const clients = new Map<string, { count: number; expires: number }>();
const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function allowed(request: NextRequest): boolean {
  const id = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const now = Date.now();
  let bucket = clients.get(id);
  if (!bucket || bucket.expires <= now) {
    if (clients.size >= 1000) clients.delete(clients.keys().next().value!);
    bucket = { count: 0, expires: now + 60_000 };
    clients.set(id, bucket);
  }
  return ++bucket.count <= 80;
}

async function run(payload: SearchRequest) {
  const configured = process.env.SASTA_PYTHON_API_URL || process.env.NEXT_PUBLIC_API_URL;
  const pythonUrl = configured || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "");
  if (pythonUrl) {
    try {
      const response = await fetch(`${pythonUrl.replace(/\/$/, "")}/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(35_000) });
      if (response.ok) return searchResponseSchema.parse(await response.json());
    } catch { /* The portable engine also works without a running Python service. */ }
  }
  return research(payload);
}

export async function POST(request: NextRequest) {
  if (!allowed(request)) return Response.json({ error: "Too many questions. Please wait a minute." }, { status: 429, headers: { ...responseHeaders, "Retry-After": "60" } });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Send a JSON request." }, { status: 415, headers: responseHeaders });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Add a question to start searching." }, { status: 400, headers: responseHeaders });
  let size = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > BODY_LIMIT) { await reader.cancel(); return Response.json({ error: "Conversation request is too large." }, { status: 413, headers: responseHeaders }); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const parsed = searchRequestSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid question or conversation history." }, { status: 422, headers: responseHeaders });
    return Response.json(await run(parsed.data), { headers: responseHeaders });
  } catch {
    return Response.json({ error: "Couldn't read this request. Send valid JSON and try again." }, { status: 400, headers: responseHeaders });
  }
}

export async function GET(request: NextRequest) {
  if (!allowed(request)) return Response.json({ error: "Too many questions. Please wait a minute." }, { status: 429, headers: { ...responseHeaders, "Retry-After": "60" } });
  const parsed = searchRequestSchema.safeParse({ query: request.nextUrl.searchParams.get("q") || "", history: [] });
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 422, headers: responseHeaders });
  return Response.json(await run(parsed.data), { headers: responseHeaders });
}
