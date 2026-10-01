"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, CheckCircle2, Clock3, ExternalLink, Search } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { siteConfig } from "../lib/site";
import { MAX_HISTORY_TURNS, searchResponseSchema } from "../lib/search-contract";
import type { SearchRequest, SearchResponse } from "../lib/types";

const suggestions = ["Search the web…", "Find the latest AI research…", "Compare the best tools…", "Explain anything clearly…"];
const searchSchema = z.object({ query: z.string().trim().min(2, "Ask a little more so I can research it.").max(280, "Keep your question under 280 characters.") });
type SearchForm = z.infer<typeof searchSchema>;
type ConversationTurn = {
  id: string;
  question: string;
  status: "pending" | "complete" | "error";
  response?: SearchResponse;
  error?: string;
};

async function searchWeb(request: SearchRequest): Promise<SearchResponse> {
  const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(60_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail ?? payload?.error ?? "The research service is unavailable right now.");
  const parsed = searchResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error("The research service returned an invalid answer. Please try again.");
  return parsed.data;
}

function AnswerText({ data }: { data: SearchResponse }) {
  const [visibleAnswer, setVisibleAnswer] = useState("");

  useEffect(() => {
    const words = data.answer.match(/\S+\s*/g) ?? [];
    let wordIndex = 0;
    setVisibleAnswer("");
    const interval = window.setInterval(() => {
      wordIndex += 1;
      setVisibleAnswer(words.slice(0, wordIndex).join(""));
      if (wordIndex >= words.length) window.clearInterval(interval);
    }, 28);
    return () => window.clearInterval(interval);
  }, [data.answer]);

  return <div className="answer-text">{visibleAnswer.split(/(\[\d+\])/g).map((part, index) => {
    const reference = /^\[(\d+)\]$/.exec(part);
    const source = reference ? data.results[Number(reference[1]) - 1] : undefined;
    return source ? <a className="answer-citation" href={source.url} target="_blank" rel="noreferrer" title={source.title} aria-label={`Source ${reference![1]}: ${source.title}`} key={index}>{part}</a> : <span key={index}>{part}</span>;
  })}</div>;
}

function AnswerCard({ data, onFollowUp, isSearching }: { data: SearchResponse; onFollowUp: (query: string) => void; isSearching: boolean }) {
  return (
    <motion.section className="results-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }} aria-label="Sasta AI answer" aria-live="polite">
      <div className="result-meta"><span className="result-label"><Image className="result-logo" src="/brand-mark.svg" alt="" width={15} height={15} /> {data.answer_mode === "extractive" ? "Source excerpts" : "Answer"}</span>{data.verified_sources > 0 && <span className="verified"><CheckCircle2 size={15} /> {data.verified_sources} sources read</span>}</div>
      <AnswerText data={data} />
      <div className="result-footer"><span><Clock3 size={14} /> {(data.duration_ms / 1000).toFixed(1)}s{data.context_used && " · Uses conversation context"}</span><span className="mode-label">{data.source_mode === "serpapi" ? "Google results" : data.source_mode === "wikipedia" ? "Wikipedia sources" : data.source_mode === "conversation" ? "This conversation" : "Open web sources"}</span></div>
      {Boolean(data.followUps?.length) && <div className="related-searches"><div className="sources-heading"><span>Explore next</span><span>Related searches</span></div><div className="chip-grid">{data.followUps!.map((suggestion) => <button type="button" className="query-chip" key={suggestion} disabled={isSearching} onClick={() => onFollowUp(suggestion)}>{suggestion}<ArrowUpRight size={14} /></button>)}</div></div>}
      {data.results.length > 0 && <><div className="sources-heading"><span>Sources</span><span>{data.results.length} results</span></div>
      <div className="source-grid">{data.results.map((result) => <a className="source-card" href={result.url} target="_blank" rel="noreferrer" key={result.url}><div className="source-card-top"><span>{result.source}</span><ExternalLink size={14} /></div><strong>{result.title}</strong><p>{result.snippet}</p></a>)}</div></>}
      {data.images.length > 0 && <>
        <div className="sources-heading image-heading"><span>Images</span><span>Source-linked visuals</span></div>
        <div className="image-grid">{data.images.map((image) => (
          <a className="image-card" href={image.source_url} target="_blank" rel="noreferrer" key={`${image.source_url}-${image.thumbnail_url}`}>
            <div className="image-visual">
              <img className="image-backdrop" src={image.thumbnail_url} alt="" aria-hidden="true" loading="lazy" decoding="async" />
              <img className="image-foreground" src={image.thumbnail_url} alt={image.title} loading="lazy" decoding="async" />
            </div>
            <div className="image-caption"><strong>{image.title}</strong><span>{image.source}</span></div>
          </a>
        ))}</div>
      </>}
      {data.warning && <p className="warning">{data.warning}</p>}
    </motion.section>
  );
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const latestTurnRef = useRef<HTMLElement>(null);
  const nextTurnId = useRef(0);
  const searchInFlight = useRef(false);
  const [placeholder, setPlaceholder] = useState(suggestions[0]);
  // Deliberately kept in memory: refreshing the page starts a new conversation.
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const hasConversation = turns.length > 0;
  const { register, handleSubmit, formState: { errors }, setFocus, setValue, clearErrors } = useForm<SearchForm>({ resolver: zodResolver(searchSchema), defaultValues: { query: "" } });
  const queryField = register("query");
  const mutation = useMutation<SearchResponse, Error, SearchRequest>({ mutationFn: searchWeb, onError: (error) => toast.error(error.message) });

  useEffect(() => {
    const interval = window.setInterval(() => setPlaceholder((current) => suggestions[(suggestions.indexOf(current) + 1) % suggestions.length]), 3200);
    const focusSearch = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setFocus("query"); } };
    window.addEventListener("keydown", focusSearch);
    return () => { window.clearInterval(interval); window.removeEventListener("keydown", focusSearch); };
  }, [setFocus]);

  useEffect(() => {
    if (turns.length > 0) latestTurnRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [turns.length]);

  const runSearch = async (query: string) => {
    if (searchInFlight.current) return;
    const parsed = searchSchema.safeParse({ query });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Add a valid question."); return; }
    const question = parsed.data.query;
    const id = `turn-${++nextTurnId.current}`;
    searchInFlight.current = true;
    setTurns((current) => [...current, { id, question, status: "pending" }]);
    setValue("query", "");
    clearErrors("query");
    try {
      const history = turns.filter((turn) => turn.status === "complete" && turn.response).slice(-MAX_HISTORY_TURNS).map((turn) => ({ question: turn.question, answer: turn.response!.answer.slice(0, 6000), topic: turn.response!.topic, search_query: turn.response!.search_query, sources: turn.response!.results.slice(0, 5).map(({ content: _content, ...source }) => source) }));
      const response = await mutation.mutateAsync({ query: question, history });
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, status: "complete", response } : turn));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The research service is unavailable right now.";
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, status: "error", error: message } : turn));
    } finally {
      searchInFlight.current = false;
    }
  };
  const onSubmit = async ({ query }: SearchForm) => { await runSearch(query); };
  const structuredData = { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", name: siteConfig.name, url: siteConfig.url, logo: `${siteConfig.url}/brand-mark.svg`, slogan: siteConfig.tagline, description: siteConfig.description }, { "@type": "WebSite", name: siteConfig.name, url: siteConfig.url, description: siteConfig.description, potentialAction: { "@type": "SearchAction", target: `${siteConfig.url}/?question={search_term_string}`, "query-input": "required name=search_term_string" } }] };

  return (
    <main className={`app-shell ${hasConversation ? "has-conversation" : ""}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <motion.div className="ambient ambient-one" animate={{ x: [0, 24, 0], y: [0, -18, 0] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="ambient ambient-two" animate={{ x: [0, -18, 0], y: [0, 22, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
      <div className="app-content">
        {!hasConversation && <section className="hero-intro" aria-labelledby="hero-heading">
          <motion.div className="orb-scene" initial={{ opacity: 0, scale: .86 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .9, ease: [0.22, 1, .36, 1] }} aria-hidden="true">
            <motion.div className="orb-ring orb-ring-one" animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} />
            <motion.div className="orb-ring orb-ring-two" animate={{ rotate: -360 }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} />
            <div className="orb-halo" />
            <motion.div className="orb-core" animate={{ scale: [1, 1.06, 1], rotate: [0, 4, -4, 0] }} transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}>
              <Image className="orb-logo" src="/brand-symbol.svg" alt="Sasta AI logo" width={512} height={512} priority />
            </motion.div>
          </motion.div>
          <motion.div className="hero-copy" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .16, duration: .7 }}>
            <span className="status-badge"><span className="status-dot" /> Sasta AI is ready</span>
            <h1 id="hero-heading">Ask anything.<br /><em>Stay curious.</em></h1>
            <p>{siteConfig.tagline}</p>
          </motion.div>
        </section>}
        <div className={`search-dock${hasConversation ? "" : " search-dock--welcome"}`}>
          <motion.form className="search-box" onSubmit={handleSubmit(onSubmit)} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}>
            <label className="sr-only" htmlFor="question">Search the web</label>
            <span className="search-icon" aria-hidden="true"><Search size={21} strokeWidth={2.2} /></span>
            <input {...queryField} ref={(element) => { queryField.ref(element); inputRef.current = element; }} id="question" placeholder={hasConversation ? "Ask another question…" : placeholder} autoComplete="off" aria-invalid={Boolean(errors.query)} aria-describedby={errors.query ? "query-error" : undefined} />
            <kbd aria-label="Keyboard shortcut: Command K" title="Press ⌘ K or Ctrl K to focus search">
              <span className="shortcut-command">⌘</span><span>K</span>
            </kbd>
            <motion.button type="submit" aria-label="Search" disabled={mutation.isPending} whileHover={{ scale: 1.025 }} whileTap={{ scale: 0.98 }}>
              {mutation.isPending ? <span className="button-loader" /> : "Search"}
            </motion.button>
          </motion.form>
          <AnimatePresence>{errors.query && <motion.p id="query-error" className="field-error" role="alert" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{errors.query.message}</motion.p>}</AnimatePresence>
        </div>
        {hasConversation && <section className="conversation" aria-label="Questions and answers">
          <h1 className="sr-only">Sasta AI conversation</h1>
          {turns.map((turn, index) => (
            <motion.article className="conversation-turn" key={turn.id} ref={index === turns.length - 1 ? latestTurnRef : undefined} aria-labelledby={`${turn.id}-question`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
              <div className="user-question"><span className="question-label">You</span><h2 id={`${turn.id}-question`}>{turn.question}</h2></div>
              {turn.status === "pending" && <div className="loading-card thinking-card" role="status" aria-label="Thinking"><span className="thinking-label">Thinking<span className="thinking-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span><span>.</span></span></span></div>}
              {turn.status === "complete" && turn.response && <AnswerCard data={turn.response} onFollowUp={(query) => { void runSearch(query); }} isSearching={mutation.isPending} />}
              {turn.status === "error" && <div className="results-card search-error" role="alert"><p>{turn.error}</p><button type="button" className="query-chip" disabled={mutation.isPending} onClick={() => { void runSearch(turn.question); }}>Try again</button></div>}
            </motion.article>
          ))}
        </section>}
      </div>
    </main>
  );
}
