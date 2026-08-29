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
                        # GMAIL_USER/APP_PASSWORD, ADMIN_EMAILS, GEMINI_API_KEY
```

### 7. systemd services

```bash
sudo cp deploy/rep-coach-web.service /etc/systemd/system/
sudo cp deploy/rep-coach-vision.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rep-coach-web rep-coach-vision
sudo systemctl status rep-coach-web rep-coach-vision
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

### 9. Daily DB backup to S3

`data/app.db` is a single flat file on this instance's own disk with no
automatic redundancy — if the instance/volume were lost, this data goes
with it. This sets up a daily snapshot uploaded to S3.

**In the AWS Console/CLI on your own machine** (not the EC2 instance):

```bash
# 1. Create the bucket (pick a globally-unique name)
aws s3api create-bucket --bucket rep-coach-backups-<something-unique> \
  --region <REGION> --create-bucket-configuration LocationConstraint=<REGION>

# 2. IAM policy scoped to just this bucket
cat > backup-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::REPLACE_BUCKET_NAME/app-db-backups/*" },
    { "Effect": "Allow", "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::REPLACE_BUCKET_NAME" }
  ]
}
EOF
# edit REPLACE_BUCKET_NAME in the file above to your real bucket name, then:
aws iam create-policy --policy-name rep-coach-backup-policy --policy-document file://backup-policy.json

# 3. IAM role for the EC2 instance, attach the policy
aws iam create-role --role-name rep-coach-backup-role --assume-role-policy-document '{
  "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow", "Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole" }]
}'
aws iam attach-role-policy --role-name rep-coach-backup-role \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/rep-coach-backup-policy
aws iam create-instance-profile --instance-profile-name rep-coach-backup-profile
aws iam add-role-to-instance-profile --instance-profile-name rep-coach-backup-profile --role-name rep-coach-backup-role

# 4. Attach it to the running instance (no restart needed)
aws ec2 associate-iam-instance-profile --instance-id <INSTANCE_ID> \
  --iam-instance-profile Name=rep-coach-backup-profile
```

This uses an IAM instance role rather than static AWS access keys stored
anywhere on the box — the same approach considered (though not ultimately
needed, since Docker/ECR was dropped in favor of direct systemd — see
`CHANGELOG.md`) earlier in this project.

**On the EC2 instance:**

```bash
# AWS CLI (not otherwise needed since dropping the Docker/ECR plan)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip awscliv2.zip
sudo ./aws/install
rm -rf awscliv2.zip aws/

# Add the bucket name to .env.production
echo "REP_COACH_BACKUP_BUCKET=rep-coach-backups-<something-unique>" >> ~/rep-coach/.env.production

cd ~/rep-coach
sudo cp deploy/rep-coach-backup.service deploy/rep-coach-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rep-coach-backup.timer

# Trigger one manually right away to confirm it actually works end-to-end
# rather than waiting until 3am to find out:
sudo systemctl start rep-coach-backup.service
sudo journalctl -u rep-coach-backup.service -n 20 --no-pager
aws s3 ls s3://rep-coach-backups-<something-unique>/app-db-backups/
```

Runs daily at 03:00 UTC via `rep-coach-backup.timer`
(`systemctl list-timers` to confirm it's scheduled). Uses `sqlite3
... VACUUM INTO` for a transactionally-consistent snapshot — safe to run
while the app is live, not a raw `cp` of a file that's actively being
written to. Consider adding an S3 lifecycle rule on the
`app-db-backups/` prefix if you want old backups to auto-expire after N
days.

**Restoring from a backup:**

```bash
sudo systemctl stop rep-coach-web rep-coach-vision
aws s3 cp s3://<bucket>/app-db-backups/app-<timestamp>.db ~/rep-coach/data/app.db
sudo systemctl start rep-coach-web rep-coach-vision
```

---

## Day-2: deploying an update later

```bash
ssh -i your-key.pem ubuntu@<ELASTIC_IP>
cd rep-coach
git pull
npm ci
npm run build
venv/bin/pip install -r requirements.txt   # only if requirements.txt changed
sudo systemctl restart rep-coach-web rep-coach-vision
```

`data/app.db` is untouched by any of this — it's just a file in the
working directory, not part of the deploy step at all.

### One-time: renaming an already-running instance's units

The systemd unit files were renamed from `form-auditor-*` to `rep-coach-*`
(see `CHANGELOG.md`). An instance deployed before that rename needs this
one-time cleanup after `git pull`:

```bash
sudo systemctl disable --now form-auditor-web form-auditor-vision
sudo rm /etc/systemd/system/form-auditor-web.service /etc/systemd/system/form-auditor-vision.service
sudo cp deploy/rep-coach-web.service deploy/rep-coach-vision.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rep-coach-web rep-coach-vision
sudo systemctl status rep-coach-web rep-coach-vision
```

## Useful commands

```bash
sudo systemctl status rep-coach-web
sudo systemctl status rep-coach-vision
sudo journalctl -u rep-coach-web -f      # tail logs
sudo journalctl -u rep-coach-vision -f
sudo systemctl restart rep-coach-web
```

---

Repo: `https://github.com/rajvirsingh-ub/rep-coach.git`.
