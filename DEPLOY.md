# Deployment

No containers — both services run directly on a single EC2 instance as
`systemd` services, the same way they run locally (just with production
builds instead of dev-mode/`--reload`), behind Caddy for automatic HTTPS
on a DuckDNS domain.

- `web` (Next.js, `npm run start`) — listens on `127.0.0.1:3000`, fronted
  by Caddy.
- `vision` (FastAPI/MediaPipe/Gemini, `uvicorn`) — listens on
  `127.0.0.1:8000` **only**. Never bound to the instance's public
  interface, never reachable from outside the machine at all — `web`
  reaches it via `VISION_ENGINE_URL=http://127.0.0.1:8000/analyze`. This
  is the same isolation property the earlier Docker plan got from having
  no `ports:` mapping, just achieved by binding to localhost instead.
- `data/app.db` — local SQLite file, same as local dev.

---

## One-time setup

### 1. EC2 instance

- AMI: Ubuntu 24.04 LTS, instance type: t3.medium (2 vCPU / 4GB RAM —
  Next.js + MediaPipe together need real headroom)
- Security group: **22** (SSH, your IP only), **80**, **443** (both
  `0.0.0.0/0`). Deliberately no 3000 or 8000 — nothing needs to reach
  those from outside the box.
- Allocate an **Elastic IP**, associate it with the instance (otherwise
  the public IP changes on every reboot and DuckDNS goes stale)

### 2. DuckDNS

Sign in at duckdns.org, claim a subdomain, point it at the Elastic IP.

### 3. Get the code onto the instance

```bash
ssh -i your-key.pem ubuntu@<ELASTIC_IP>
git clone https://github.com/rajvirsingh-ub/rep-coach.git
cd rep-coach
```

### 4. Install system dependencies

**Double-check the AMI is actually Ubuntu 24.04 LTS first** (`lsb_release -a`)
— pick it explicitly in the AMI search rather than trusting "latest
Ubuntu," which can resolve to a much newer non-LTS release. A first
deployment hit Ubuntu 26.04 this way, which ships Python 3.14 by default
and broke `python3.11` availability entirely (see `CHANGELOG.md`). If
you're stuck on a non-24.04 instance for some reason, `python3.13` (if
available via apt) is a confirmed-working fallback — just substitute it
for `python3.11` everywhere below.

```bash
sudo apt-get update
sudo apt-get install -y curl git unzip \
  libgl1 libglib2.0-0 libgles2 libegl1 \
  python3.11 python3.11-venv

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Caddy (reverse proxy + automatic HTTPS)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

Those four graphics libraries matter because of two separate issues:
- `libgl1`/`libglib2.0-0`: mediapipe pulls in the full
  `opencv-contrib-python` as a transitive dependency regardless of the
  `opencv-python-headless` declared directly in `requirements.txt`, and
  the full variant needs `libGL.so.1` at import time.
- `libgles2`/`libegl1`: MediaPipe's own native shared library links
  against GLES/EGL symbols at load time even when only the CPU delegate
  is actually used at runtime.

### 5. Build the app

```bash
cd ~/rep-coach

npm ci
npm run build

python3.11 -m venv venv
venv/bin/pip install -r requirements.txt
```

(`vision_engine.py` auto-downloads `pose_landmarker_full.task` on first
run if it isn't already present — no manual step needed here, unlike the
earlier Docker plan where it got baked into the image to avoid a runtime
network dependency.)

### 6. Environment variables

```bash
cp .env.production.example .env.production
nano .env.production   # fill in AUTH_URL (your real domain), AUTH_SECRET,
                        # AUTH_GITHUB_ID/SECRET, GMAIL_USER/APP_PASSWORD,
                        # ADMIN_EMAILS, GEMINI_API_KEY
```

### 7. systemd services

```bash
sudo cp deploy/form-auditor-web.service /etc/systemd/system/
sudo cp deploy/form-auditor-vision.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now form-auditor-web form-auditor-vision
sudo systemctl status form-auditor-web form-auditor-vision
```

Both units use `EnvironmentFile=/home/ubuntu/rep-coach/.env.production`
and `Restart=always` — if either process crashes or the instance reboots,
systemd brings it back automatically.

### 8. Caddy

```bash
sudo nano /etc/caddy/Caddyfile   # paste this repo's Caddyfile, replace
                                  # yourname.duckdns.org with your real domain
sudo systemctl reload caddy
```

Caddy requests a Let's Encrypt certificate automatically on first request —
needs 80/443 reachable from the internet (already covered above) and DNS
already pointing at this instance.

### 9. Update the GitHub OAuth app's callback URL

GitHub → Settings → Developer settings → OAuth Apps → your app →
Authorization callback URL → `https://<your-duckdns-domain>/api/auth/callback/github`

---

## Day-2: deploying an update later

```bash
ssh -i your-key.pem ubuntu@<ELASTIC_IP>
cd rep-coach
git pull
npm ci
npm run build
venv/bin/pip install -r requirements.txt   # only if requirements.txt changed
sudo systemctl restart form-auditor-web form-auditor-vision
```

`data/app.db` is untouched by any of this — it's just a file in the
working directory, not part of the deploy step at all.

## Useful commands

```bash
sudo systemctl status form-auditor-web
sudo systemctl status form-auditor-vision
sudo journalctl -u form-auditor-web -f      # tail logs
sudo journalctl -u form-auditor-vision -f
sudo systemctl restart form-auditor-web
```

---

Repo: `https://github.com/rajvirsingh-ub/rep-coach.git`.
