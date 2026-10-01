# Keyless release verification — 2026-10-01

- TypeScript regression tests: 36/36 passed.
- Python regression tests: 14/14 passed.
- Local Next.js → Python pipeline: 40/40 question checks passed.
- Portable Next.js engine: 40/40 question checks passed (`portable-evaluation.json`).
- Deployed Cloudflare API: 40/40 question checks passed (`production-evaluation.json`).
- TypeScript checking and Next.js/OpenNext production builds passed.
- Live malformed JSON, short question, wrong content type, oversized body and unsafe source-link requests returned the expected 400, 422, 415, 413 and 422 statuses.
- Live homepage, robots, sitemap, manifest and logo endpoints returned HTTP 200.

Deployment URL: https://sasta-ai.surajsinghrajput1812.workers.dev

Final Cloudflare Worker version: `9a8dc1bc-47ed-4db8-b8ca-f15de335273a` (application commit `99f7cdc`). The 40-question live evaluations preceded the final cosmetic-only UI edits; the evaluated research API is unchanged.

Browser verification covered mobile/desktop vertical welcome centering, inline welcome search, bottom-fixed conversation search, the Command-K shortcut, sequential follow-ups retaining older answers, uncropped source-linked images with blurred backdrops, and refresh clearing the conversation.

Evaluations exercise 40 fixed questions across multi-turn topic continuity, topic changes, session memory, citations, image/source provenance, conservative unsupported requests and basic arithmetic. Evidence-marker checks are intentionally limited; passing is not proof of perfect factual accuracy, broad reasoning or current knowledge. Optional model-generated and paid Google-provider responses were not evaluated. No API keys were configured.

Production runs the portable Next.js research backend. Python is tested locally but is not separately hosted by this deployment. Refresh clears the in-memory conversation; the latest 12 completed turns provide follow-up context.
