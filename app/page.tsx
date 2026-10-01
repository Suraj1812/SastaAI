"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CheckCircle2, Clock3, ExternalLink, ImageOff, Search } from "lucide-react";
import Image from "next/image";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { siteConfig } from "../lib/site";
import { MAX_HISTORY_TURNS, searchResponseSchema } from "../lib/search-contract";
import { answerRevealOffset, createAnswerRevealPlan } from "../lib/answer-reveal";
import { advanceConversationScroll, type ConversationScrollState } from "../lib/conversation-scroll";
import type { ImageResult, SearchRequest, SearchResponse } from "../lib/types";

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
  const reducedMotion = useReducedMotion();
  const plan = useMemo(() => createAnswerRevealPlan(data.answer), [data.answer]);
  const [revealedLength, setRevealedLength] = useState(0);

  useEffect(() => {
    if (reducedMotion || plan.endOffsets.length <= 1) return;
    setRevealedLength(0);
    const started = performance.now();
    let lastPaint = 0;
    let frame = 0;
    const reveal = (now: number) => {
      const elapsed = now - started;
      // At most 30 React updates per second, synchronized with browser frames.
      if (now - lastPaint >= 1000 / 30 || elapsed >= plan.durationMs) {
        setRevealedLength(answerRevealOffset(plan, elapsed));
        lastPaint = now;
      }
      if (elapsed < plan.durationMs) frame = window.requestAnimationFrame(reveal);
    };
    frame = window.requestAnimationFrame(reveal);
    return () => window.cancelAnimationFrame(frame);
  }, [plan, reducedMotion]);

  const visibleAnswer = reducedMotion || plan.endOffsets.length <= 1 ? data.answer : data.answer.slice(0, revealedLength);
  const renderAnswer = (answer: string) => answer.split(/(\[\d+\])/g).map((part, index) => {
    const reference = /^\[(\d+)\]$/.exec(part);
    const source = reference ? data.results[Number(reference[1]) - 1] : undefined;
    return source ? <a className="answer-citation" href={source.url} target="_blank" rel="noreferrer" title={source.title} aria-label={`Source ${reference![1]}: ${source.title}`} key={index}>{part}</a> : <span key={index}>{part}</span>;
  });
  return <div className="answer-text" aria-live="polite" aria-busy={visibleAnswer.length < data.answer.length}>
    <div className="answer-measure" aria-hidden="true">{renderAnswer(data.answer)}</div>
    <div className="answer-content">{renderAnswer(visibleAnswer)}</div>
  </div>;
}

const ImageVisual = memo(function ImageVisual({ image }: { image: ImageResult }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  return <div className="image-visual" data-state={state}>
    <img className="image-backdrop" src={image.thumbnail_url} alt="" aria-hidden="true" loading="lazy" decoding="async" />
    <img className="image-foreground" src={image.thumbnail_url} alt={image.title} loading="lazy" decoding="async" onLoad={() => setState("ready")} onError={() => setState("error")} />
    {state === "error" && <span className="image-unavailable"><ImageOff size={22} aria-hidden="true" />Image unavailable</span>}
  </div>;
});

const AnswerCard = memo(function AnswerCard({ data, onFollowUp, isSearching }: { data: SearchResponse; onFollowUp: (query: string) => void; isSearching: boolean }) {
  return (
    <motion.section className="results-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} aria-label="Sasta AI answer">
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
            <ImageVisual image={image} />
            <div className="image-caption"><strong>{image.title}</strong><span>{image.source}</span></div>
          </a>
        ))}</div>
      </>}
      {data.warning && <p className="warning">{data.warning}</p>}
    </motion.section>
  );
});

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const latestTurnRef = useRef<HTMLElement>(null);
  const conversationScrollRef = useRef<ConversationScrollState>({ turn: null, interrupted: false });
  const autoScrollPositionRef = useRef<number | null>(null);
  const nextTurnId = useRef(0);
  const searchInFlight = useRef(false);
  const reducedMotion = useReducedMotion();
  const [placeholder, setPlaceholder] = useState(suggestions[0]);
  // Deliberately kept in memory: refreshing the page starts a new conversation.
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const hasConversation = turns.length > 0;
  const latestTurn = turns.at(-1);
  const { register, handleSubmit, formState: { errors }, setFocus, setValue, clearErrors } = useForm<SearchForm>({ resolver: zodResolver(searchSchema), defaultValues: { query: "" } });
  const queryField = register("query");
  const { mutateAsync, isPending } = useMutation<SearchResponse, Error, SearchRequest>({ mutationFn: searchWeb, onError: (error) => toast.error(error.message) });

  useEffect(() => {
    if (hasConversation || reducedMotion) return;
    const interval = window.setInterval(() => {
      if (document.hidden || document.activeElement === inputRef.current || inputRef.current?.value) return;
      setPlaceholder((current) => suggestions[(suggestions.indexOf(current) + 1) % suggestions.length]);
    }, 4200);
    return () => window.clearInterval(interval);
  }, [hasConversation, reducedMotion]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setFocus("query"); } };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [setFocus]);

  useEffect(() => {
    const interrupt = () => {
      conversationScrollRef.current.interrupted = true;
    };
    const onScroll = () => {
      // Also catches keyboard scrolling and dragging the native scrollbar.
      const expected = autoScrollPositionRef.current;
      if (expected !== null && Math.abs(window.scrollY - expected) > 2) interrupt();
    };
    // Intent events arrive before scroll events, including at document edges.
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchmove", interrupt, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchmove", interrupt);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useLayoutEffect(() => {
    if (!latestTurn) return;
    const next = advanceConversationScroll(conversationScrollRef.current, latestTurn);
    conversationScrollRef.current = next.state;
    if (!next.shouldScroll) return;
    const turn = latestTurnRef.current;
    if (!turn) return;
    // The pending row may be too short to reach the top. Once its answer is in
    // the DOM, align again before paint, without adding an artificial end spacer.
    // Layout offsets ignore entrance transforms; instant scrolling cannot fight
    // subsequent wheel/touch input like an in-progress smooth animation can.
    let top = -24;
    let element: HTMLElement | null = turn;
    while (element) { top += element.offsetTop; element = element.offsetParent as HTMLElement | null; }
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    autoScrollPositionRef.current = window.scrollY;
  }, [latestTurn?.id, latestTurn?.status]);

  const runSearch = useCallback(async (query: string) => {
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
      const response = await mutateAsync({ query: question, history });
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, status: "complete", response } : turn));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The research service is unavailable right now.";
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, status: "error", error: message } : turn));
    } finally {
      searchInFlight.current = false;
    }
  }, [turns, mutateAsync, setValue, clearErrors]);
  const onSubmit = async ({ query }: SearchForm) => { await runSearch(query); };
  const structuredData = { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", name: siteConfig.name, url: siteConfig.url, logo: `${siteConfig.url}/brand-mark.svg`, slogan: siteConfig.tagline, description: siteConfig.description }, { "@type": "WebSite", name: siteConfig.name, url: siteConfig.url, description: siteConfig.description, potentialAction: { "@type": "SearchAction", target: `${siteConfig.url}/?question={search_term_string}`, "query-input": "required name=search_term_string" } }] };

  return (
    <main className={`app-shell ${hasConversation ? "has-conversation" : ""}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="app-content">
        {!hasConversation && <section className="hero-intro" aria-labelledby="hero-heading">
          <motion.div className="hero-emblem" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, ease: [0.22, 1, .36, 1] }} aria-hidden="true">
            <div className="emblem-aura" />
            <div className="emblem-bloom" />
            <div className="emblem-shadow" />
            <div className="emblem-float">
              <div className="emblem-tile">
                <Image className="emblem-logo" src="/brand-symbol.svg" alt="Sasta AI logo" width={512} height={512} priority />
              </div>
            </div>
          </motion.div>
          <motion.div className="hero-copy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08, duration: .4 }}>
            <span className="status-badge"><span className="status-dot" /> Sasta AI is ready</span>
            <h1 id="hero-heading">Ask anything.<br /><em>Stay curious.</em></h1>
            <p>{siteConfig.tagline}</p>
          </motion.div>
        </section>}
        <motion.div className={`search-dock${hasConversation ? "" : " search-dock--welcome"}`} layout="position" layoutDependency={hasConversation} transition={{ layout: { duration: .32, ease: [.22, 1, .36, 1] } }}>
          <motion.form className="search-box" onSubmit={handleSubmit(onSubmit)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .06, duration: .35 }}>
            <label className="sr-only" htmlFor="question">Search the web</label>
            <span className="search-icon" aria-hidden="true"><Search size={21} strokeWidth={2.2} /></span>
            <input {...queryField} ref={(element) => { queryField.ref(element); inputRef.current = element; }} id="question" placeholder={hasConversation ? "Ask another question…" : placeholder} autoComplete="off" aria-invalid={Boolean(errors.query)} aria-describedby={errors.query ? "query-error" : undefined} />
            <kbd aria-label="Keyboard shortcut: Command K" title="Press ⌘ K or Ctrl K to focus search">
              <span className="shortcut-command">⌘</span><span>K</span>
            </kbd>
            <motion.button type="submit" aria-label={isPending ? "Searching" : "Search"} disabled={isPending} whileHover={reducedMotion ? undefined : { scale: 1.02 }} whileTap={reducedMotion ? undefined : { scale: .97 }}>
              {isPending ? <span className="button-loader" /> : <><span className="search-button-label">Search</span><Search className="search-button-icon" size={20} strokeWidth={2.3} aria-hidden="true" /></>}
            </motion.button>
          </motion.form>
          <AnimatePresence>{errors.query && <motion.p id="query-error" className="field-error" role="alert" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{errors.query.message}</motion.p>}</AnimatePresence>
        </motion.div>
        {hasConversation && <section className="conversation" aria-label="Questions and answers">
          <h1 className="sr-only">Sasta AI conversation</h1>
          {turns.map((turn, index) => (
            <motion.article className="conversation-turn" key={turn.id} ref={index === turns.length - 1 ? latestTurnRef : undefined} aria-labelledby={`${turn.id}-question`} aria-busy={turn.status === "pending"} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
              <div className="user-question"><span className="question-label">You</span><h2 id={`${turn.id}-question`}>{turn.question}</h2></div>
              {turn.status === "pending" && <span className="sr-only" role="status">Searching for sources.</span>}
              {turn.status === "complete" && turn.response && <AnswerCard data={turn.response} onFollowUp={runSearch} isSearching={isPending} />}
              {turn.status === "error" && <div className="results-card search-error" role="alert"><p>{turn.error}</p><button type="button" className="query-chip" disabled={isPending} onClick={() => { void runSearch(turn.question); }}>Try again</button></div>}
            </motion.article>
          ))}
        </section>}
      </div>
    </main>
  );
}
