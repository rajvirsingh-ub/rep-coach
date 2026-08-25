# Changelog

All notable changes to this project are logged here, newest first. This file
is maintained continuously — every change made to the codebase (by any
future session, not just this one) should be added here, not just described
in a passing conversation.

---

## Gemini retry + sibling-model fallback — 2026-08-26

Gemini overload/unavailability was previously an immediate 503 to the
user. Asked about adding a different free provider as a fallback — true
video-native multimodal APIs with a real free tier are essentially just
Gemini right now (OpenAI/Claude don't accept raw video uploads the way
Gemini's Files API does), so went with the higher-leverage, lower-risk
fix first: retry and fall back to sibling models within the same Google
account before giving up.

- New `_generate_content_with_fallback`: tries `GEMINI_MODEL` first, then
  each `GEMINI_FALLBACK_MODELS` entry in order. Retries a `ServerError`
  (overload) up to twice per model with a short backoff; a `ClientError`
  (rejected request) skips straight to the next model instead of
  retrying, since retrying an identical rejected request won't change
  the outcome. Only raises to the caller once every model/attempt is
  exhausted.
- `GEMINI_FALLBACK_MODELS` is env-overridable (comma-separated), default
  `gemini-flash-lite-latest,gemini-3.6-flash`.
- Verified live by deliberately forcing failure, not just reading the
  code: set `GEMINI_MODEL` to a nonexistent model name and confirmed via
  server logs the cascade worked exactly as designed — bogus model → 404
  → next candidate → **also 404** → next candidate → succeeded. That
  middle failure was a genuine, unplanned finding: `gemini-2.5-flash`
  (the fallback originally chosen) is *listed* as available via
  `client.models.list()` but actually returns "no longer available to
  new users" when called with this key — the exact same deprecation trap
  that broke the original hardcoded single-model setup. Confirmed
  `gemini-2.5-flash-lite` has the identical problem, so both were
  dropped from the fallback list in favor of directly-tested working
  models (`gemini-flash-lite-latest`, `gemini-3.6-flash`) — verified by
  actually calling them, not by trusting the model listing.

## Moved workout history from localStorage to a server-side table — 2026-08-26

Workout history (including the annotated images) previously lived only
in the browser's `localStorage`, so a user's sessions were invisible on
any other browser/device. Moved to a real `workout_history` table in the
same SQLite DB that already holds `users`/`otp_codes`.

- `src/lib/db.ts`: added `workout_history` (id, user_id, exercise_name,
  user_context, feedback, detected_flaws/form_corrections as JSON text,
  annotated_image, created_at) plus an index on `user_id`.
- New `src/lib/history.ts`: `createHistoryEntry`, `getHistoryForUser`,
  `deleteHistoryForUser`. Stores `annotated_image` as the exact same
  `data:image/jpeg;base64,...` string the vision engine already produces
  — simplest option (no encode/decode step, frontend `<img src>` usage is
  unchanged), at the cost of ~33% more storage than a raw BLOB would use.
  Prunes to the 50 most recent entries per user on insert, same cap the
  old localStorage hook used, since each entry can carry a ~30-50KB image.
- `src/lib/users.ts`'s `deleteUser` now cascades to
  `deleteHistoryForUser` so removing an account from the admin panel
  doesn't leave orphaned history rows behind.
- **`/api/audit` now requires authentication** (`401` if no session) —
  a real gap this change surfaced: the route had no auth check at all
  before, relying entirely on the frontend not exposing it to logged-out
  users. Needed anyway to know which user's history row to write.
  Persists the entry server-side automatically right after a successful
  analysis (best-effort — a failed save doesn't block the response the
  user is waiting on).
- New `GET /api/history` — returns the current session's history, `401`
  if unauthenticated.
- `useWorkoutHistory` rewritten: no longer takes a `userId` param or
  touches `localStorage` at all; fetches from `/api/history` on mount and
  exposes `refresh()` instead of `addEntry()` (entries are now created
  server-side by `/api/audit` itself, so the hook's job is just pulling
  the canonical list, not constructing entries).
- `Dashboard.tsx` updated accordingly: calls `refresh()` after a
  successful analysis instead of `addEntry(...)`; `entry.timestamp` field
  renamed to `entry.createdAt` to match the new server shape.
- **Known, unavoidable consequence, flagged rather than silently
  swallowed**: history that was sitting in a user's browser localStorage
  before this change has no migration path into the new table — there's
  no way for the server to read another origin's localStorage. Existing
  local entries simply stop being shown going forward; only new analyses
  are saved server-side from this point on.
- Verified live end-to-end: confirmed unauthenticated `POST /api/audit`
  now correctly 401s, ran a real video through the full flow, and
  inspected the raw `workout_history` row directly (correct `user_id`,
  full image payload) rather than trusting the API response alone.

## Custom favicon — 2026-08-26

`src/app/favicon.ico` was still the unedited default Next.js scaffold
icon (leftover from the initial `create-next-app` commit) — every open
tab showed the generic Next.js logo instead of anything identifying the
app. Replaced with `src/app/icon.svg`: a dumbbell mark (same motif as the
sidebar history icons) on the app's indigo→fuchsia gradient, picked up
automatically by Next.js's file-based icon convention (no metadata
config needed). Deleted the old `favicon.ico` so it can't take priority
over the new one in browsers that check it directly — verified the
rendered page head now emits `<link rel="icon" href="/icon.svg" ...>`
and `/favicon.ico` correctly 404s instead of serving the old icon.

## Anchored the annotated frame to when the flaw actually happened — 2026-08-25

Follow-up to the annotated-overlay feature above: the "clearest frame"
selection was a real limitation (asked directly: "why not the frame
where the mistake happened?") — Gemini reasons over the whole clip in
one pass and its structured output had no timing info at all, so there
was nothing to anchor to. Fixed by asking for it directly, since Gemini
does have genuine temporal understanding of the video (unlike the local
per-frame biomechanics data, which only has usable per-frame metrics for
2 of the many possible flaw types — knees and lean — and nothing for the
rest, e.g. footwear, elbow flare).

- `FlawHighlight` gained `approximate_timestamp_seconds: float | None` —
  Gemini's best-guess moment (seconds from clip start) each flaw is most
  visible, explicitly allowed to be null rather than guessing wildly.
- New `_extract_frame_at_timestamp`: seeks the video directly to that
  timestamp (`cv2.CAP_PROP_POS_MSEC`) and runs a fresh pose-estimation
  pass there (that exact instant generally isn't one of the ~30 already-
  sampled frames). Falls back to the existing clearest-frame selection if
  Gemini gave no timestamp, the timestamp is out of range, or pose
  detection fails at that exact instant (e.g. a blurry mid-motion frame)
  — the image is never silently missing because of this.
- `_sample_pose_frames` now also returns `duration_seconds` (computed
  from frame count ÷ fps, already had the file open — no extra I/O) used
  to sanity-check Gemini's timestamp before seeking to it.
- Deliberately scoped to keep the response contract identical (still one
  `annotated_image` string) rather than expanding to per-flaw images —
  the fix is entirely internal to `vision_engine.py`; no frontend files
  changed.
- Verified live, not just by reading the code: added temporary logging,
  confirmed in the server log that Gemini returned a real timestamp
  (`23.0s`) and the seek succeeded, then visually compared the resulting
  frame to the earlier clearest-frame test on the same video — the new
  one is anchored at the actual bottom of the squat (deep knee bend,
  torso pitched forward) instead of an arbitrary more-upright moment,
  a clearly more illustrative result for "excessive torso lean."

## Visual form breakdown: annotated skeleton overlay — 2026-08-25

Users find a picture more useful than a wall of text, so results now
include an actual annotated frame from the uploaded video — a skeleton
overlay with the specific joints/regions involved in each flaw drawn in
red, everything else in green/white — alongside the existing text
feedback.

- **`vision_engine.py`**: `GeminiFormAnalysis` gained a new
  `flaw_highlights` field — for each entry in `detected_flaws`, Gemini
  (which is already watching the video) names the 1-3 body regions most
  directly responsible, chosen from a fixed enum (`left_knee`,
  `right_hip`, `spine`, etc.) so the values map cleanly onto drawable
  landmarks. Chose this over a keyword-matching approach (e.g. `if "knee"
  in flaw.lower()`) because flaws are free-form 2-4 word tags from an LLM
  — brittle to match reliably by regex, whereas Gemini already has the
  actual visual context to make this judgment directly, and validated
  well in testing (e.g. a genuinely new flaw type, "improper footwear",
  correctly got mapped to `left_ankle`/`right_ankle`, and a forward-lean
  flaw pulled in `spine` + both hips — regions a naive keyword match on
  "lean" would have missed entirely).
- `_sample_pose_frames` now also tracks the single clearest sampled frame
  (highest average landmark visibility) and returns its raw pixels
  alongside its landmarks — kept in memory only for that one frame, not
  the whole clip, to avoid ballooning memory usage.
- New `_render_annotated_frame`: draws the skeleton (via OpenCV
  `cv2.line`/`cv2.circle`) on that clearest frame, red for
  bones/joints/spine/head tied to a flagged region, green/white
  otherwise. Downscaled to 480px width and JPEG-compressed (quality 60)
  before being base64-encoded into a `data:image/jpeg;base64,...` URI in
  the response — keeps payload size small (~30-50KB typical).
- Explicitly documented as best-effort: Gemini reasons over the whole
  clip holistically and doesn't report *when* a flaw occurred, so the
  overlay is drawn on the clearest available frame, not necessarily the
  exact moment the flaw happened.
- Threaded `annotatedImage` through the whole stack:
  `vision.ts` → `graph.ts` (`FormCorrectionState` gained the field) →
  `route.ts` → `Dashboard.tsx`. New "Visual Breakdown" card renders it
  above the text results, with a small legend explaining the red
  markers.
- `useWorkoutHistory`'s `WorkoutHistoryEntry` gained an optional
  `annotatedImage` field so past sessions in "Recent Sessions" retain
  their image too — optional (not required) since entries saved before
  this feature won't have it. Flagged as a real tradeoff: this is a
  base64 image (tens of KB) persisted per history entry in `localStorage`,
  which meaningfully raises per-entry storage use versus the previous
  all-text entries — mitigated by keeping the image small/compressed and
  by the existing `MAX_ENTRIES` cap and try/catch quota-exceeded fallback
  already in the hook.
- Validated with real videos end-to-end through the full production path
  (Next.js → LangGraph → `vision.ts` → `vision_engine.py`), not just unit
  tested — confirmed the primary-subject selection stays correct even in
  the multi-person "carried partner" case, and visually inspected the
  rendered overlay.

## Dashboard functional polish — 2026-08-25

The previous pass restyled the dashboard's header/buttons but left the
actual working area (upload form, results) visually unchanged — this
pass adds real interactive/visual substance on top of that, without
touching the `/api/audit` contract or the LangGraph pipeline.

- **Stats strip**: three cards (Sessions, Clean Rate %, Last Set) computed
  client-side from the existing `useWorkoutHistory` data — no backend
  change, only rendered once history is non-empty (avoids an empty/zeroed
  strip for brand-new accounts).
- **Drag-and-drop upload zone** replacing the plain `<input type="file">`:
  dashed-border dropzone with drag-over highlight, shows the selected
  filename + formatted size once chosen. The underlying `<input>` is now
  visually hidden but still the actual source of truth for the upload —
  drop handling just calls the same `setVideoFile` used by the click-to-
  browse path, so `handleSubmit`'s FormData logic is untouched.
- **Animated multi-phase loading state**: the analyze button cycles
  through "Extracting joint landmarks... / Analyzing biomechanics... /
  Consulting your AI coach... / Finalizing feedback..." every 1.6s while
  `status === "loading"`, instead of a single static "Analyzing form..."
  string — gives the AI-pipeline nature of the wait some texture.
- **Result cards** got icon headers (chat/alert/clipboard) and a new
  celebratory "Clean rep!" banner shown when `detectedFlaws` comes back
  empty (previously that state only got a small text label in the
  sidebar, nothing in the main result view).
- **Sidebar**: session count badge next to "Recent Sessions", a small
  dumbbell icon per entry, indigo hover-border accent, and check/alert
  icons next to the clean/flaw-count labels for faster scanning.
- Subtle blurred background glow behind the main content area, matching
  the landing/auth pages' visual language.

## Landing page + auth modal, dashboard restyle — 2026-08-25

The auth split-screen hero (previous entry) got scrapped in favor of a
different flow: a full marketing landing page at `/` for guests, with
sign-in/sign-up living in an overlay modal rather than dedicated
full-page heroes, and the plain sign-in card kept centered per feedback
that the split layout wasn't landing well.

- **New shared components**:
  - `BrandMark` — gradient-text "Rep Coach" wordmark, reused everywhere
    the brand name appears (landing, auth pages, dashboard header, admin
    header).
  - `AuthPageShell` — shared centered-card background (subtle radial glow)
    for the standalone auth-adjacent pages.
  - `PoseSkeleton` — extracted the animated pulsing-joint squat-skeleton
    SVG into its own component (previously inlined in the now-deleted
    `AuthHero.tsx`) so the landing page can reuse it at a larger size.
  - `SignInForm` / `SignUpForm` — the actual form logic (state, submit
    handlers, next-auth calls) extracted out of the page components so
    both the standalone `/signin` and `/signup` pages *and* the new
    `AuthModal` render the exact same forms — no duplicated logic.
  - `AuthModal` — tabbed (Sign In / Sign Up) overlay, backdrop-click
    closes it, click inside the card doesn't (event propagation stopped).
  - `LandingHero` — full-screen dark hero at `/` for unauthenticated
    visitors: "Want your form corrected?" headline, three feature chips,
    explicit "Get Started"/"Sign In" buttons, and a click-anywhere-on-the-
    page handler that opens the modal (buttons stop propagation so they
    open the specific tab rather than double-firing the generic handler).
- `page.tsx`: unauthenticated visitors now render `<LandingHero />`
  directly instead of a hard `redirect("/signin")` — `/signin` and
  `/signup` still exist as standalone routes (now centered, no side
  hero) for direct links and NextAuth's internal `pages.signIn` redirect
  target.
- `/verify-email`, `/forgot-password`, `/reset-password`: wrapped in
  `AuthPageShell`, added the `BrandMark` eyebrow, and switched primary
  buttons from the old flat zinc style to the same indigo→fuchsia
  gradient CTA used everywhere else, for visual consistency across every
  pre-dashboard surface.
- `Dashboard.tsx` header and the primary "Analyze Form" submit button,
  and `AdminPanel.tsx` header and its "Add" button: same `BrandMark` /
  gradient-CTA treatment, so the post-login app doesn't look like a
  visually disconnected product from the landing/auth pages anymore
  (this was the "dashboard and after pages are the same right now"
  complaint this whole pass addresses).
- Deleted `AuthHero.tsx` (superseded by `LandingHero` + `PoseSkeleton`).

## Rebranded "Form Auditor" → "Rep Coach" — 2026-08-24

The project outgrew its placeholder working name — "Form Auditor" was
still showing up in every user-facing surface even though the repo,
domain, and resume summary had already settled on "Rep Coach."

- User-facing text: sign-in page heading, dashboard header, `layout.tsx`
  metadata (`title`/`description` — previously still the unedited
  create-next-app defaults), all four email templates in `src/lib/email.ts`
  (sender name, subject lines, body copy for OTP/reset/changed/verified
  emails), `vision_engine.py`'s FastAPI `title`.
- Project identity: `package.json` `name` (`ai-project` → `rep-coach`,
  regenerated `package-lock.json` to match — `npm ci` validates the lockfile's
  embedded name against `package.json` and would otherwise fail), `CLAUDE.md`
  header.
- Renamed the systemd unit files themselves:
  `deploy/form-auditor-{web,vision}.service` →
  `deploy/rep-coach-{web,vision}.service` (via `git mv`), updated their
  `Description=` lines and every reference in `DEPLOY.md`. Since the old
  filenames were already registered as live systemd units on the deployed
  EC2 instance, added a one-time migration section to `DEPLOY.md`
  (disable/remove old units, install new ones) rather than just swapping
  the files — a plain `git pull` + `cp` would have left the old units
  orphaned and still running alongside the new ones.

## Removed GitHub sign-in — 2026-08-24

Email/password (with OTP verification) is now the only sign-in method.

- `src/auth.ts`: removed the `GitHub` provider entirely; `jwt` callback no
  longer needs the `account.provider === "github"` branch since every
  sign-in now goes through `authorize()`'s own `isEmailVerified` value.
- `/signin`: removed the "Sign in with GitHub" button, divider, and icon.
- Removed `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` from `.env.local` and
  `.env.production.example` (dead config), and the GitHub OAuth callback
  step from `DEPLOY.md`.
- Admin panel's "GitHub sign-ins aren't stored here" caveat removed —
  no longer applicable now that GitHub isn't a sign-in path at all.

## First live deployment + fixes — 2026-08-24

App successfully deployed and running at `repcoach.duckdns.org`. Real
issues hit and fixed along the way, beyond the mediapipe pin below:

- **Wrong AMI**: the EC2 instance launched on Ubuntu 26.04 (very new,
  ships Python 3.14 by default) instead of the 24.04 LTS `DEPLOY.md`
  assumed. `python3.11` wasn't in the default repos and deadsnakes hadn't
  built packages for 26.04 yet. Resolved by using `python3.13` (available
  via apt on this instance) instead of compiling 3.11 from source — worked
  once the missing native libraries below were installed.
- **`libGL.so.1` missing** (same root cause as the earlier Docker
  validation — mediapipe pulls in the full `opencv-contrib-python`
  regardless of the headless variant declared directly): fixed via
  `apt-get install libgl1 libglib2.0-0` directly on the instance.
- **`libGLESv2.so.2` missing**: a second, different native dependency —
  MediaPipe's own shared library links against GLES/EGL symbols at load
  time even when only the CPU delegate is used. Not caught by the earlier
  Docker validation (that used a different mediapipe wheel — cp311 vs.
  cp313 — which apparently has different dynamic library dependencies).
  Fixed via `apt-get install libgles2 libegl1`. `DEPLOY.md` step 4 updated
  to install all four (`libgl1 libglib2.0-0 libgles2 libegl1`) upfront.
- **Systemd paths pointed at `ai-project`, actual clone is `rep-coach`**:
  the unit files and `DEPLOY.md` assumed the clone directory would match
  the local dev folder name; fixed to match the real repo name throughout.
- **Admin login confusion**: `ADMIN_EMAILS` only grants `isAdmin: true` to
  an already-authenticated session — it doesn't create an account.
  Production's `data/app.db` is a fresh, empty database with no relation
  to the local dev one all earlier testing used, so the admin email had no
  row in the `users` table. Fixed by signing up normally through
  `/signup` with that email.
- **Sign-out redirected to `localhost` in production**: `trustHost: true`
  wasn't reliably resolving the real origin through Caddy for the
  `signOut()` redirect specifically (other auth flows were unaffected).
  Added an explicit `AUTH_URL` to `.env.production.example` — more
  reliable than header-based auto-detection when the domain is fixed and
  known ahead of time, which it is here.

## Fixed mediapipe pin for the real EC2 target — 2026-08-24

The per-platform `mediapipe` pin (0.10.35 macOS / 0.10.18 Linux) was
validated against a Docker `python:3.11-slim` (Debian) image, not the
actual deployment target. On the real EC2 instance (Ubuntu 24.04, once
Docker was dropped), `pip install` failed — `0.10.18` isn't available for
that glibc/manylinux combination at all; Ubuntu 24.04 resolves an entirely
different wheel set than Debian slim. Dropped the platform split, pinned
`mediapipe==0.10.35` everywhere (confirmed available on both, and it's the
version already known not to hit the macOS Metal-delegate crash).

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
