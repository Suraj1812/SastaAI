# Sasta AI API

FastAPI service for source-linked research and conservative conversation follow-ups.

The default keyless pipeline searches Wikipedia, reads the leading article plus secondary summaries, and selects passages relevant to the question. Images must belong to a returned source and match the resolved subject. It does not independently validate every factual claim or behave like a large language model.

Conversation context is supplied with each request; no server-side conversation store is used. At most 12 previous turns are accepted. Follow-up pronouns and a limited set of elliptical questions use the previous topic, while explicitly named subjects start a new topic. Clarifications and session-memory responses require no external search.

`OPENAI_API_KEY` enables optional model synthesis from supplied evidence with previous user/assistant messages. Keys must be exported in the Python process environment (a Next.js `.env.local` file is not automatically loaded by Uvicorn). The synthesis path follows [OpenAI's conversation-state guidance](https://developers.openai.com/api/docs/guides/conversation-state); optional paid-provider responses have not been live-tested in the keyless release. Existing SerpApi support is optional and not covered by keyless evaluations. Non-Wikipedia URLs are not fetched, to avoid arbitrary server-side URL access.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Health check: `http://localhost:8000/health`

Search endpoint: `POST http://localhost:8000/search`:

```json
{
  "query": "How old is it?",
  "history": [{ "question": "What is Earth?", "answer": "Earth is a planet.", "topic": "Earth", "sources": [] }]
}
```

Responses include `topic`, `search_query`, `context_used`, `answer_mode`, source links and relevant images. `extractive` means selected source passages, not generated prose. A source being read does not mean its claims have been independently verified. Shortened history preserves citations without claiming sources were fetched again.

Run Python regression tests from the repository root:

```bash
backend/.venv/bin/python -m unittest discover -s backend/tests -v
```

The public Next.js gateway bounds JSON bodies, validates source/image URLs and applies a basic process-local request limit. If separately exposing Python publicly, put it behind equivalent body/rate limits and an authenticated gateway. Cloudflare deployment in this repository serves the portable Next.js API, not a Python process.
