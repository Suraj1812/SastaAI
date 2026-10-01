import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { searchRequestSchema, searchResponseSchema } from "../lib/search-contract";
import { research } from "../lib/research";
import { questionGroups } from "../tests/question-cases";
import type { ConversationContext, SearchResponse } from "../lib/types";

const portable = process.argv.includes("--portable");
const endpoint = process.env.SASTA_EVAL_URL || "http://localhost:3000/api/search";
const reportName = portable ? "portable" : ["localhost", "127.0.0.1", "::1"].includes(new URL(endpoint).hostname) ? "local" : "production";
const records: { id: string; query: string; pass: boolean; error?: string; response?: SearchResponse; duration_ms: number }[] = [];
let nextGroup = 0;

async function worker() {
  while (nextGroup < questionGroups.length) {
    const group = questionGroups[nextGroup++];
    const history: ConversationContext[] = [];
    for (const testCase of group) {
      const started = Date.now();
      let observed: SearchResponse | undefined;
      try {
        const payload = searchRequestSchema.parse({ query: testCase.query, history });
        let raw: unknown;
        if (portable) raw = await research(payload);
        else {
          const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000) });
          assert.equal(response.status, 200, `HTTP ${response.status}`);
          raw = await response.json();
        }
        const response = searchResponseSchema.parse(raw);
        observed = response;
        history.push({ question: testCase.query, answer: response.answer, topic: response.topic, search_query: response.search_query, sources: response.results });
        // Functional plus limited semantic checks, not an LLM-grade factual correctness score.
        assert.ok(response.answer.trim().length > 5, "Empty answer");
        if (testCase.topic) assert.equal(response.topic?.toLowerCase(), testCase.topic.toLowerCase(), "Wrong subject/topic");
        if (testCase.context !== undefined) assert.equal(response.context_used, testCase.context, "Incorrect context resolution");
        if (testCase.mode) assert.equal(response.answer_mode, testCase.mode, "Unexpected answer mode");
        if (testCase.answerIncludes) assert.ok(testCase.answerIncludes.some((part) => response.answer.toLowerCase().includes(part.toLowerCase())), "Expected evidence wasn't found in the answer");
        assert.equal(response.verified_sources, response.results.filter((result) => result.verified).length, "Inflated source-read count");
        for (const [, number] of response.answer.matchAll(/\[(\d+)\]/g)) assert.ok(response.results[Number(number) - 1], "Broken citation");
        for (const image of response.images) assert.ok(response.results.some((source) => source.url === image.source_url), "Image doesn't belong to a cited source");
        if (response.answer_mode === "extractive") assert.match(response.answer, /\[\d+\]/, "Source excerpt lacks a citation");
        records.push({ id: testCase.id, query: testCase.query, pass: true, response, duration_ms: Date.now() - started });
        console.log(`PASS ${testCase.id} (${response.answer_mode}, ${response.duration_ms}ms)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        records.push({ id: testCase.id, query: testCase.query, pass: false, error: message, response: observed, duration_ms: Date.now() - started });
        console.log(`FAIL ${testCase.id}: ${message}`);
      }
    }
  }
}

async function main() {
  await Promise.all([worker(), worker()]);
  await mkdir("reports", { recursive: true });
  const report = { generated_at: new Date().toISOString(), engine: portable ? "portable-next-engine" : endpoint, model_generated: false, scope: "40 real local questions; schema, topic continuity, citation bounds, source/image provenance and evidence markers. This is not proof of perfect factual correctness.", passed: records.filter((record) => record.pass).length, total: records.length, cases: records };
  await writeFile(`reports/${reportName}-evaluation.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(`\n${report.passed}/${report.total} passed. Model-generated answers were NOT evaluated (keyless mode).`);
  process.exitCode = report.passed === report.total ? 0 : 1;
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
