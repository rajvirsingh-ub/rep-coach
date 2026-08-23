# Changelog

All notable changes to this project are logged here, newest first. This file
is maintained continuously — every change made to the codebase (by any
future session, not just this one) should be added here, not just described
in a passing conversation.

---

## Deployment: dropped Docker, direct systemd on EC2 instead — 2026-08-24

Reversed the Docker/ECR plan below in favor of running both services
directly on the EC2 instance — one fewer layer (containers, cross-platform
image builds, a registry) for a single-VM deployment where the whole box
is already under one owner's control anyway. `DEPLOY.md` rewritten around
this.

- Removed `Dockerfile`, `Dockerfile.vision`, `docker-compose.yml`,
  `docker-compose.ec2.yml`, `.dockerignore`.
- `next.config.ts`: removed `output: "standalone"` (that was specifically
  for a minimal Docker runtime image; `next start` from a normal build
  works fine for a direct deploy).
- Added `deploy/form-auditor-web.service` and
  `deploy/form-auditor-vision.service` — `systemd` units with
  `Restart=always`, so both processes survive crashes and reboots the same
  way Docker's `restart: unless-stopped` did.
- Same network-isolation property as before, different mechanism: instead
  of Docker's "no `ports:` mapping," `vision` now binds to `127.0.0.1:8000`
  explicitly (not `0.0.0.0`) — never reachable from outside the instance
  either way.
- Caddy now installed directly via its official apt repo (systemd service)
  instead of running as a container.
- The `mediapipe`/`opencv-python-headless` platform-specific fixes from the
  Docker validation pass below are still fully relevant here (they were
  Linux-vs-macOS issues, not Docker-specific) — `libgl1`/`libglib2.0-0` now
  get installed directly on the instance via apt instead of inside an
  image.
- AWS ECR / IAM instance role / cross-platform `buildx` builds are no
  longer needed at all.

## Production deployment: Docker + ECR + EC2 + Caddy — 2026-08-24 (superseded, see above)

Deployment architecture for making the app reachable at a public URL. Full
runbook in `DEPLOY.md`.

- **Database**: swapped `better-sqlite3` (sync) for `@libsql/client`
  (async) throughout `db.ts`, `users.ts`, `otpStore.ts`, `auth.ts`
  callbacks, and every DB-touching API route. Chosen because libSQL's
  client speaks to either a local SQLite file or a remote Turso database
  through the identical API — Turso was considered and then deliberately
  dropped in favor of keeping the DB file on the EC2 instance itself (one
  fewer external dependency for a single-VM deployment); the async
  rewrite was kept regardless since it's fully backward-compatible with
  local-file mode and already done/working.
- **`next.config.ts`**: added `output: "standalone"` for a minimal
  self-contained Docker build.
- **`Dockerfile`** (Next.js, multi-stage, `node:22-slim`) and
  **`Dockerfile.vision`** (FastAPI/MediaPipe/Gemini, `python:3.11-slim`).
  Both validated locally for **both** `linux/arm64` and `linux/amd64`
  (build *and* actual container boot) before committing to the deployment
  plan — t3.medium on EC2 is x86_64, this Mac is arm64, so cross-platform
  correctness needed to be proven, not assumed.
- Real bugs caught by that validation, fixed in the same pass:
  - `mediapipe==0.10.35` (pinned earlier specifically for a macOS/Metal
    crash — see below) has no Linux wheel at all. Since that crash was
    Metal/macOS-specific and doesn't exist on Linux, `requirements.txt`
    now uses PEP 508 environment markers to pin different versions per
    platform (`0.10.35` on `darwin`, `0.10.18` on `linux`) instead of one
    version for both.
  - `opencv-python` → `opencv-python-headless` (the GUI variant doesn't
    belong in a headless server container) — but mediapipe itself pulls in
    the full `opencv-contrib-python` as a transitive dependency regardless
    of what's declared directly, which needs `libGL.so.1` at import time.
    Fixed by installing `libgl1`/`libglib2.0-0` via apt in
    `Dockerfile.vision`, rather than fighting mediapipe's own dependency
    chain.
- **Network topology**: `vision` is never exposed to the host or the
  public internet at all (no `ports:` mapping in compose, only `web`
  reaches it via the internal Docker network as `http://vision:8000`).
  Only `web` and `caddy` are reachable externally.
- **`docker-compose.yml`** (local build/test) vs. **`docker-compose.ec2.yml`**
  (production — pulls prebuilt images from ECR instead of building
  on-instance, so the EC2 box never needs the source tree, git, or a
  build toolchain at all).
- **`Caddyfile`**: automatic HTTPS via Let's Encrypt for the DuckDNS
  domain, pulled from an env var rather than hardcoded.
- **`src/auth.ts`**: added `trustHost: true` for running behind Caddy as a
  reverse proxy.
- Registry: **AWS ECR** chosen over Docker Hub specifically so the EC2
  instance can pull images via an attached IAM role — no static registry
  credentials stored on the box at all.
- Flagged separately (not yet resolved): this project has no git remote
  and hasn't been committed since the initial `create-next-app` scaffold —
  everything from this entire changelog only exists in one working
  directory right now.

## Moved GEMINI_API_KEY out of source — 2026-08-24

- `vision_engine.py` had `GEMINI_API_KEY` hardcoded directly in the file
  (a deliberate earlier choice, tradeoffs flagged at the time). Reverted
  that: now reads `os.environ.get("GEMINI_API_KEY", "")` like `GEMINI_MODEL`
  already did, with the actual key moved into `.env` (same file
  `vision_engine.py` loads via `load_dotenv()`). Consistent with how every
  other secret in this project is handled (`AUTH_GITHUB_ID`/`SECRET`,
  `GMAIL_USER`/`APP_PASSWORD`, `ADMIN_EMAILS` — all in `.env`/`.env.local`,
  none in source).

## Forgot / reset password flow — 2026-08-24

- `/forgot-password` — enter email, request a reset code. `POST
  /api/forgot-password` **always returns the same generic response**
  regardless of whether the account exists, so the endpoint can't be used to
  enumerate registered emails. Only actually sends a code if the account is
  real.
- `/reset-password` — enter the code + new password. `POST
  /api/reset-password` validates the code via the existing OTP store,
  re-hashes and updates the password (`src/lib/users.ts` →
  `updatePassword`), then signs the user in automatically.
- Reuses the *same* `otp_codes` table/mechanism as signup email
  verification — one generic "prove you control this inbox" primitive
  serving two purposes.
- New email: **"Your password was changed"** notification, sent after a
  successful reset (best-effort — a failed send doesn't undo the password
  change or block the response). Warns the recipient to reset again
  immediately if they didn't make the change themselves.
- "Forgot password?" link added to `/signin`.

## Admin panel — 2026-08-23

- `/admin`, gated by an `ADMIN_EMAILS` env-var allowlist (`src/lib/admin.ts`)
  rather than a DB role column — simplest option for a single-owner project.
  `isAdmin` computed fresh on every session read in `src/auth.ts`.
- Lists every email/password account (email, verified status, join date —
  **never** password hashes). Admin can add a user directly (bypasses OTP)
  or remove one (blocked from removing their own account, to avoid
  self-lockout).
- GitHub sign-ins never appear here — they're not persisted to the `users`
  table at all (NextAuth handles them statelessly via JWT).
- Conditional "Admin" link added to the dashboard header for admin sessions.
- New email: **"You're verified!"** confirmation, sent right after a
  successful OTP check in `/api/verify-otp` (best-effort, same non-blocking
  pattern as above).

## Session-freshness bug fix — 2026-08-23

- Root-caused a redirect loop: after verifying an OTP, the app kept bouncing
  back to `/verify-email` instead of the dashboard. Cause: JWT sessions bake
  in `isEmailVerified` at sign-in time, and the client-triggered refresh
  (`useSession().update()`) wasn't reliably landing before the next
  navigation checked it.
- Fix: `src/auth.ts`'s `session` callback now does a **live SQLite lookup**
  on every session read to re-derive `isEmailVerified`, instead of trusting
  a cached JWT claim. Verified this by directly flipping the DB flag
  out-of-band (no `update()` call, no re-login) and confirming the very
  next request to `/` immediately saw the change.
- Simplified `/verify-email` accordingly — dropped the `update()` call
  entirely, just does a hard `window.location.href` reload.

## Switched email delivery: Resend → Gmail SMTP — 2026-08-23

- Resend's shared test sender (`onboarding@resend.dev`) only delivers to the
  email address tied to the Resend account itself — not viable for
  arbitrary recipients without verifying a custom domain.
- Replaced with **Gmail SMTP via `nodemailer`**, authenticated with a Gmail
  **App Password** (not the real account password — Google requires 2FA +
  an app-specific credential for SMTP access). `resend` package removed;
  `nodemailer` (pinned to `9.0.5` to dodge a known CVE in the `raw` message
  option, which this app doesn't use) added.
- `.env.local`: `RESEND_API_KEY` / `RESEND_FROM_EMAIL` removed, replaced with
  `GMAIL_USER` / `GMAIL_APP_PASSWORD`.
- Confirmed working end-to-end to a real non-Gmail inbox (`@buffalo.edu`),
  not just the account's own address.

## Email/password auth + OTP email verification — 2026-08-23

- Added a proper user store: **SQLite** via `better-sqlite3`, file at
  `data/app.db` (gitignored — contains password hashes). See the "Database"
  section below for full schema details.
- `Credentials` provider added to `src/auth.ts` alongside GitHub. Credentials
  sign-in requires **JWT session strategy** (NextAuth doesn't support
  database-backed sessions for this provider).
- Passwords hashed with Node's built-in `crypto.scryptSync` (a slow,
  purpose-built password KDF), random 16-byte salt per user, stored as
  `salt:hash` hex. One-way — never recoverable.
- `/signup` and `/signin` (now client components) — signup creates the
  account, generates a 6-digit OTP, emails it, signs the user in
  immediately (so a session exists even though unverified), then redirects
  to `/verify-email`.
- `/verify-email` — 6-digit code entry + "Resend code." OTP mechanics
  (`src/lib/otp.ts`, `src/lib/otpStore.ts`): SHA-256-hashed codes (fast hash
  is fine here — short-lived, rate-limited, unlike passwords), 10-minute
  expiry, 5-attempt cap before requiring a fresh code.
- `page.tsx`'s server-side auth gate extended: no session → `/signin`;
  unverified → `/verify-email`; verified → dashboard.

## NextAuth (Auth.js v5) + GitHub OAuth — 2026-08-23

- `src/auth.ts` — NextAuth config, GitHub provider, `/api/auth/[...nextauth]`
  catch-all route handler.
- Route protection done at the **page level** (`page.tsx` server component
  calling `auth()` and redirecting), not via `middleware.ts` — Next.js 16
  renamed that mechanism to `proxy.ts`, and page-level checks are more
  robust regardless of that rename.
- `SessionProvider` wired into `layout.tsx` via a small `providers.tsx`
  client wrapper.
- `/signin` page, "Sign Out" button in the dashboard header.
- Existing dashboard UI (`page.tsx`) extracted into `src/components/
  Dashboard.tsx`, now receiving the session as a prop.

## Client-side workout history — 2026-08-23

- `src/hooks/useWorkoutHistory.ts` — saves successful analysis results to
  `localStorage` under `history_${userId}` (session `id`, falling back to
  `email`), so history is isolated per signed-in user on a shared machine.
  Capped at 50 entries, tolerant of storage errors (private browsing,
  quota).
- "Recent Sessions" sidebar in `Dashboard.tsx` — fixed column on desktop,
  toggleable panel on mobile. Shows exercise name, timestamp, and a
  clean/flaw-count summary. Clicking an entry loads that historical result
  into the main view without re-running analysis.

## User-provided context/constraints — 2026-08-16

- "Context or Constraints (Optional)" `<textarea>` on the dashboard (e.g.
  "I have a bad knee, limiting my depth").
- Threaded end-to-end: `page.tsx` → `route.ts` → `graph.ts` (LangGraph
  state) → `vision.ts` → `vision_engine.py` → Gemini prompt, with an
  explicit instruction not to flag deviations that are explained by a
  stated constraint.

## Vision pipeline v2: MediaPipe + Gemini multimodal — 2026-08-16

- Replaced YOLOv8 pose estimation with **MediaPipe Pose Landmarker**
  (33-point 3D world landmarks vs. YOLO's 17-point 2D COCO keypoints).
- Replaced hand-coded geometric flaw-detection thresholds with a **Gemini
  multimodal call**: the actual video is uploaded to Gemini, alongside a
  biomechanics summary (joint-angle statistics, self-calibrated torso lean,
  knee/ankle ratio, multi-person load detection) computed locally from the
  MediaPipe landmarks as grounding context. Structured JSON output via
  Pydantic `response_schema` (`activity_mismatch`, `detected_flaws`,
  `form_analysis_feedback`, `form_corrections`).
- Multi-person handling and the "carrying extra load" heuristic re-built on
  MediaPipe landmark bounding boxes (largest-area heuristic for primary
  subject) instead of YOLO's detection boxes.
- Fixed a real MediaPipe/macOS Metal-delegate crash (`graph_service.h`
  check failure) by pinning `mediapipe==0.10.35` (the `1.0.x` line has a
  regression on this platform) and forcing `Delegate.CPU` explicitly.
- Fixed a Gemini model deprecation: `gemini-2.5-flash` returned 404 for new
  API keys; switched to the floating alias `gemini-flash-latest` (queried
  `client.models.list()` directly rather than guessing a model name from
  stale docs).
- Added explicit error handling for Gemini `ServerError` (503, "temporarily
  overloaded") and `ClientError` (502) so failures surface as clean
  messages instead of raw 500 stack traces.
- `GEMINI_API_KEY` is hardcoded directly in `vision_engine.py` (not an env
  var) — an explicit, deliberate choice made after being asked to do it
  that way, with the tradeoff (secret sits in plain text in a file that
  could get shared/committed later) flagged at the time.

## Re-architecture: robustness + honesty pass — 2026-07-28 to 2026-07-31

- **Frontend bug fix**: the "Try Again" / reset button was previously only
  shown on the success path — a failed analysis could strand the user with
  no way to retry without a manual page refresh. Now always shown on error
  too.
- **Renamed "Mobility Protocol" → "Form Corrections & Technical
  Suggestions"** end-to-end: `graph.ts` state field, `vectorStore.ts`
  (`queryFormCorrections` / `FORM_CORRECTIONS_DATABASE`), `route.ts`
  response shape, `page.tsx` UI section.
- Removed the three named brittle boolean helpers (`_is_knee_valgus`,
  `_is_forward_lean`, `_is_elbow_flare`) in favor of body-relative,
  orientation-invariant geometry: a per-frame rotation basis derived from
  the athlete's own torso vector (instead of assuming the camera is level),
  and a self-calibrated "upright" reference taken from the athlete's own
  tallest frame in the clip (instead of an absolute vertical assumption).
- Multi-person handling: primary subject selected by bounding-box area ×
  confidence (previously just whichever person YOLO listed first); a second
  person's box staying stacked on the primary's shoulders across the clip
  triggers a "carrying extra load" flag that swaps in general stabilization
  guidance instead of strict unweighted-bodyweight flaw thresholds.
- Coarse **activity-mismatch detector**: compares claimed exercise category
  against an observed knee-dominant-vs-elbow-dominant + torso-orientation
  signature, catching gross confusion (e.g. squat labeled as push-up).
  Deliberately conservative — flagged as a heuristic sanity check, not real
  action recognition, and explicitly does not claim to detect environmental
  context (surfaces, equipment).
- Ingress validation loosened (confidence/detection-ratio thresholds) and
  reworded to make clear that inverted/unusual stances (e.g. hanging
  calisthenics) are expected to be fine.
- Frame-count/ratio language stripped from user-facing feedback text
  (`_frequency_phrase` helper) — kept degree-based coaching language since
  that's legitimate feedback, not pipeline internals.

## Dynamic exercise mapping — 2026-07-29

- `vision_engine.py` classification expanded beyond squat-only: lower-body
  vs. upper-body vs. `general_movement` keyword-based dispatch, with
  movement-specific analyzers for squat, push-up, lateral raise, and tricep
  pushdown (distinct keypoint requirements and flaw logic per movement).
- `vectorStore.ts` extended with corrections for the new flaw types (`elbow
  flare`, `incomplete range of motion`, `hips sagging`, `shoulder drift`).

## Initial build — 2026-07-26 to 2026-07-28

- LangGraph agent workflow (`src/lib/ai/graph.ts`): `analyzeForm` →
  `fetchMobility` pipeline via `StateGraph`.
- `src/lib/ai/vectorStore.ts`: local flaw → mobility-fix lookup table
  (stand-in for the Supabase pgvector / ChromaDB mentioned in the project
  docs).
- `src/app/api/audit/route.ts` wired up to the graph (previously a 501
  placeholder), accepting multipart video upload, writing to a temp file,
  invoking the graph, cleaning up.
- **Vision engine v1**: standalone Python FastAPI service
  (`vision_engine.py`) using **YOLOv8 pose** (Ultralytics) for keypoint
  extraction, chosen explicitly for being fully local/free (no external API
  costs) — the constraint that later got revisited when the project moved
  to Gemini.
- Frontend (`src/app/page.tsx`): upload form (exercise name, video file),
  loading/error/success states, results display. Fixed a `useEffect`
  cleanup bug where `URL.createObjectURL` was being called on every render
  instead of only when the file changed, leaking blob URLs.

---

## Database reference

**`data/app.db`** — SQLite (gitignored — contains password hashes).

### `users` table
| column | contents |
|---|---|
| `id` | UUID, generated at signup |
| `email` | unique, lowercased/trimmed |
| `password_hash` | `salt:hash` (scrypt, hex) — never the real password |
| `email_verified` | 0 / 1 |
| `created_at` | epoch ms |

### `otp_codes` table
| column | contents |
|---|---|
| `email` | primary key — one active code per email at a time |
| `code_hash` | SHA-256 of the 6-digit code |
| `expires_at` | 10 minutes from issue |
| `attempts` | caps at 5 before a fresh code is required |

Shared by both signup email verification and password-reset codes — same
underlying "prove you control this inbox right now" mechanism, two call
sites.

GitHub OAuth accounts are **not** stored in either table — NextAuth handles
them statelessly via JWT, so they never appear in the admin panel and don't
have a row here at all.
