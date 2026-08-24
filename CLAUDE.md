@AGENTS.md

# Rep Coach — Multi-Agent Biomechanical Form Auditor

Agentic logic lives under `src/lib/ai/`:
- `graph.ts` — LangGraph workflow: `analyzeForm` (calls `vision.ts`) → `fetchFormCorrections` (uses corrections Gemini already generated; falls back to the local lookup in `vectorStore.ts` only if Gemini returned flaws with no corrections).
- `vectorStore.ts` — local flaw → correction lookup table, used as a fallback only. (Not Supabase/ChromaDB — that was the original plan but was never built; this is a plain in-memory `Record`.)
- `vision.ts` — bridges to the standalone Python vision service (`vision_engine.py` at the repo root) over HTTP, sending the video + exercise name + user context and returning the parsed analysis.

`src/app/api/audit/route.ts` is fully wired up: accepts a multipart video upload plus `exerciseName`/`userContext`, writes the video to a temp file, invokes the graph, cleans up.

## Vision service

`vision_engine.py` (FastAPI, run separately via `uvicorn vision_engine:app --reload --port 8000`) does the actual pose/video analysis: MediaPipe Pose Landmarker extracts joint landmarks locally, then the video + a biomechanics summary derived from those landmarks are sent to Gemini for the real form-quality reasoning. See `CHANGELOG.md` for the history of how this pipeline evolved (it started as local-only YOLOv8 geometry, no LLM involved).

## Auth & data

NextAuth (Auth.js v5) handles sign-in — email/password only (Credentials provider; GitHub OAuth was removed, see `CHANGELOG.md`). Accounts live in `data/app.db` (SQLite via `@libsql/client`, gitignored), along with OTP codes used for both signup verification and password reset. The DB layer is async (`@libsql/client`, not `better-sqlite3`) so it can point at either a local file or a remote Turso database through the same API — currently always local file, no Turso account in use. `src/auth.ts` re-derives verification/admin status live from the database on every session read rather than trusting a cached JWT claim. Full schema and rationale in `CHANGELOG.md`'s "Database reference" section.

## Deployment

`DEPLOY.md` has the full runbook for deploying to a public URL: no containers — both services run directly on a single EC2 instance as `systemd` services (`deploy/*.service`), behind Caddy (installed via apt, automatic HTTPS) on a DuckDNS domain. `vision_engine.py` binds to `127.0.0.1` only, never reachable from outside the instance.

## Changelog

`CHANGELOG.md` at the repo root is the running history of every change made to this project. Whenever you make a change to the codebase — new feature, bug fix, architecture change, dependency swap, anything — add an entry to it. Newest entries go at the top.
