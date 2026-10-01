"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, CheckCircle2, Clock3, ExternalLink, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { siteConfig } from "../lib/site";
import type { SearchResponse } from "../lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const suggestions = ["Search the web…", "Find the latest AI research…", "Compare the best tools…", "Explain anything clearly…"];
const searchSchema = z.object({ query: z.string().trim().min(2, "Ask a little more so I can research it.").max(280, "Keep your question under 280 characters.") });
type SearchForm = z.infer<typeof searchSchema>;

async function searchWeb(query: string): Promise<SearchResponse> {
  const response = API_URL
    ? await fetch(`${API_URL}/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) })
    : await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail ?? "The research service is unavailable right now.");
  if (payload && typeof payload === "object" && "sources" in payload) {
    return {
      query: payload.query,
      answer: payload.answer,
      results: payload.sources.map((source: { title: string; url: string; domain: string; snippet: string }) => ({ title: source.title, url: source.url, source: source.domain, snippet: source.snippet })),
      images: payload.images ?? [],
      source_mode: "demo",
      verified_sources: payload.sources.filter((source: { verified?: boolean }) => source.verified).length,
      duration_ms: Math.max(1, Date.now() - (Date.parse(payload.searchedAt) || Date.now())),
      warning: payload.mode === "fallback" ? "Using the built-in web fallback. Configure the Python API for live source validation." : undefined,
      followUps: payload.followUps ?? [],
    };
  }
  return payload as SearchResponse;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [placeholder, setPlaceholder] = useState(suggestions[0]);
  const [lastQuery, setLastQuery] = useState("");
  const { register, handleSubmit, formState: { errors }, setFocus, setValue } = useForm<SearchForm>({ resolver: zodResolver(searchSchema), defaultValues: { query: "" } });
  const queryField = register("query");
  const mutation = useMutation<SearchResponse, Error, string>({ mutationFn: searchWeb, onSuccess: (data) => toast.success(`${data.verified_sources} sources checked`), onError: (error) => toast.error(error.message) });

  useEffect(() => {
    const interval = window.setInterval(() => setPlaceholder((current) => suggestions[(suggestions.indexOf(current) + 1) % suggestions.length]), 3200);
    const focusSearch = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setFocus("query"); } };
    window.addEventListener("keydown", focusSearch);
    return () => { window.clearInterval(interval); window.removeEventListener("keydown", focusSearch); };
  }, [setFocus]);

  const runSearch = async (query: string) => { setLastQuery(query); await mutation.mutateAsync(query); };
  const onSubmit = async ({ query }: SearchForm) => { await runSearch(query); };
  const structuredData = { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", name: siteConfig.name, url: siteConfig.url, logo: `${siteConfig.url}/brand-mark.svg`, slogan: siteConfig.tagline, description: siteConfig.description }, { "@type": "WebSite", name: siteConfig.name, url: siteConfig.url, description: siteConfig.description, potentialAction: { "@type": "SearchAction", target: `${siteConfig.url}/?question={search_term_string}`, "query-input": "required name=search_term_string" } }] };

  return (
    <main className={`app-shell ${mutation.data ? "has-results" : ""}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <motion.div className="ambient ambient-one" animate={{ x: [0, 24, 0], y: [0, -18, 0] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="ambient ambient-two" animate={{ x: [0, -18, 0], y: [0, 22, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
      <div className="app-content">
        <section className="hero-intro" aria-labelledby="hero-heading">
          <motion.div className="orb-scene" initial={{ opacity: 0, scale: .86 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .9, ease: [0.22, 1, .36, 1] }} aria-hidden="true">
            <motion.div className="orb-ring orb-ring-one" animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} />
            <motion.div className="orb-ring orb-ring-two" animate={{ rotate: -360 }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} />
            <div className="orb-halo" />
            <motion.div className="orb-core" animate={{ scale: [1, 1.06, 1], rotate: [0, 4, -4, 0] }} transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}>
              <span>S</span>
            </motion.div>
          </motion.div>
          <motion.div className="hero-copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .16, duration: .7 }}>
            <span className="status-badge"><span className="status-dot" /> Sasta AI is ready</span>
            <h1 id="hero-heading">Ask anything.<br /><em>Stay curious.</em></h1>
            <p>A calm, thinking search assistant for the whole internet.</p>
          </motion.div>
        </section>
        <motion.form className="search-box" onSubmit={handleSubmit(onSubmit)} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }} whileHover={{ y: -2 }}>
          <label className="sr-only" htmlFor="question">Search the web</label>
          <span className="search-icon" aria-hidden="true"><Search size={21} strokeWidth={2.2} /></span>
          <input {...queryField} ref={(element) => { queryField.ref(element); inputRef.current = element; }} id="question" placeholder={placeholder} autoComplete="off" />
          <kbd>⌘ K</kbd>
          <motion.button type="submit" disabled={mutation.isPending} whileHover={{ scale: 1.025 }} whileTap={{ scale: 0.98 }}>
            {mutation.isPending ? <span className="button-loader" /> : <>Search <ArrowUpRight size={19} strokeWidth={2.1} /></>}
          </motion.button>
        </motion.form>
        <AnimatePresence>{errors.query && <motion.p className="field-error" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{errors.query.message}</motion.p>}</AnimatePresence>
        <AnimatePresence mode="wait">
          {mutation.isPending && <motion.div className="loading-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><span className="loading-orb"><Sparkles size={18} /></span><div><strong>Researching “{lastQuery}”</strong><span>Searching, reading, and validating sources…</span></div></motion.div>}
          {mutation.data && !mutation.isPending && <motion.section className="results-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} aria-live="polite">
            <div className="result-meta"><span className="result-label"><Sparkles size={15} /> Answer</span><span className="verified"><CheckCircle2 size={15} /> {mutation.data.verified_sources} sources checked</span></div>
            <h1>{mutation.data.answer}</h1>
            <div className="result-footer"><span><Clock3 size={14} /> {mutation.data.duration_ms}ms</span><span className="mode-label">{mutation.data.source_mode === "serpapi" ? "Google results" : mutation.data.source_mode === "wikipedia" ? "Wikipedia results" : "Open web results"}</span></div>
            <div className="related-searches"><div className="sources-heading"><span>Explore next</span><span>Related searches</span></div><div className="chip-grid">{(mutation.data.followUps ?? [`What are the key takeaways from ${mutation.data.query}?`, `What are the pros and cons of ${mutation.data.query}?`, `Can you explain ${mutation.data.query} with an example?`]).map((suggestion) => <button type="button" className="query-chip" key={suggestion} onClick={() => { setValue("query", suggestion); void runSearch(suggestion); }}>{suggestion}<ArrowUpRight size={14} /></button>)}</div></div>
            <div className="sources-heading"><span>Sources</span><span>{mutation.data.results.length} results</span></div>
            <div className="source-grid">{mutation.data.results.map((result) => <a className="source-card" href={result.url} target="_blank" rel="noreferrer" key={result.url}><div className="source-card-top"><span>{result.source}</span><ExternalLink size={14} /></div><strong>{result.title}</strong><p>{result.snippet}</p></a>)}</div>
            {mutation.data.images.length > 0 && <><div className="sources-heading image-heading"><span>Images</span><span>Source-linked visuals</span></div><div className="image-grid">{mutation.data.images.map((image) => <a className="image-card" href={image.source_url} target="_blank" rel="noreferrer" key={`${image.source_url}-${image.thumbnail_url}`}><img src={image.thumbnail_url} alt={image.title} loading="lazy" /><div><strong>{image.title}</strong><span>{image.source}</span></div></a>)}</div></>}
            {mutation.data.warning && <p className="warning">{mutation.data.warning}</p>}
          </motion.section>}
        </AnimatePresence>
      </div>
    </main>
  );
}
