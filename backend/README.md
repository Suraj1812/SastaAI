# Sasta AI API

FastAPI service for searching, reading, validating, and answering from web sources.

The pipeline uses SerpApi for Google results when `SERPAPI_API_KEY` is present. Without it, it falls back to DuckDuckGo HTML results. Add `OPENAI_API_KEY` to synthesize a concise answer from the extracted source content; without it, the API returns source evidence directly.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Health check: `http://localhost:8000/health`

Search endpoint: `POST http://localhost:8000/search` with `{ "query": "your question" }`.
