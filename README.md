# Sasta AI

The internet, but without the tab hoarding.

Sasta AI is an AI-powered web research tool that finds information, validates it, and turns it into clear answers with sources.

## Stack

- Next.js App Router + TypeScript frontend
- FastAPI + Python backend scaffold

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
uvicorn backend.main:app --reload --port 8000
```

See [`backend/README.md`](backend/README.md) for the search-provider and optional AI setup.

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
