# Sasta AI

The internet, but without the tab hoarding.

Sasta AI is a source-linked research assistant with conversation follow-ups and relevant images. The default **keyless mode returns selected Wikipedia source excerpts, not model-generated reasoning**. Sources read are not independent fact-checks, and answers are not guaranteed correct.

## Stack

- Next.js App Router + TypeScript frontend
- FastAPI + Python research backend for local use or an independently hosted service
- Portable Next.js research API for Cloudflare Workers (no Python runtime or paid keys needed)
- Zod validation, React Query, React Hook Form, Framer Motion, Lucide, Sonner

## Run the frontend

```bash
npm install
npm run dev
```

## Run the API

```bash
cp .env.example .env.local
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

See [`backend/README.md`](backend/README.md) for the search-provider and optional AI setup.

The browser always calls the same-origin `/api/search` endpoint. Local development tries Python on port 8000 and falls back to the portable engine if unavailable. Production uses the portable engine unless the server-only `SASTA_PYTHON_API_URL` points to a separately deployed Python API. Cloudflare does not deploy the Python service with this Worker.

The welcome screen is vertically centered with the search bar below it; after the first question, the composer becomes bottom-fixed. Answers append to the conversation, which clears on refresh. The most recent 12 completed turns are sent for context. History is not saved to local storage or a database. Resolved factual questions are sent to the source provider; avoid entering sensitive information.

## Verification

```bash
npm test
backend/.venv/bin/python -m unittest discover -s backend/tests -v
npm run lint
npm run build
# With the local Next.js dev server running:
npm run test:questions
# Test the Worker-compatible engine directly:
npm run test:portable
```

The 40-question evaluations include topic changes, follow-ups, source citations, image provenance, simple arithmetic, session memory and unsupported requests. Reports are saved in `reports/`. These functional and evidence-marker checks are not a comprehensive factual accuracy benchmark. Live source availability can change results.

Keyless mode does not support open-ended reasoning, guaranteed real-time information, reliable complex comparisons or full natural-language understanding. Ambiguous follow-ups may need an explicit subject. Personal medical dosing is not inferred. Optional paid-provider synthesis is not covered by keyless test results. The process-local request limiter is a basic guard, not distributed abuse protection; production-scale traffic needs a Cloudflare rate-limit/WAF rule.

Set `NEXT_PUBLIC_SITE_URL` before deploying if you connect a custom domain such as `https://sasta.ai`.

## Cloudflare deployment

The Next.js app is configured for Cloudflare Workers through OpenNext. Check the production Worker build locally with:

```bash
npm run preview
```

Deploy after logging in with Wrangler:

```bash
npm run deploy
```
