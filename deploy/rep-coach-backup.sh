#!/bin/bash
# Backs up data/app.db to S3. Run via rep-coach-backup.timer, not directly
# (needs REP_COACH_BACKUP_BUCKET from .env.production in its environment —
# the systemd service supplies that via EnvironmentFile=). See DEPLOY.md.
set -euo pipefail

APP_DIR="/home/ubuntu/rep-coach"
DB_PATH="$APP_DIR/data/app.db"

if [ -z "${REP_COACH_BACKUP_BUCKET:-}" ]; then
  echo "REP_COACH_BACKUP_BUCKET is not set — skipping backup." >&2
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo "No database found at $DB_PATH — nothing to back up yet."
  exit 0
fi

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
SNAPSHOT_PATH="/tmp/rep-coach-app-${TIMESTAMP}.db"

# VACUUM INTO (not a raw `cp`) takes a transactionally-consistent snapshot
# of the live database, safe to run while the app is actively reading/
# writing it, and produces a single compact file (no separate WAL/journal
# files to also copy).
sqlite3 "$DB_PATH" "VACUUM INTO '$SNAPSHOT_PATH'"

aws s3 cp "$SNAPSHOT_PATH" "s3://${REP_COACH_BACKUP_BUCKET}/app-db-backups/app-${TIMESTAMP}.db"

rm -f "$SNAPSHOT_PATH"
echo "Backed up to s3://${REP_COACH_BACKUP_BUCKET}/app-db-backups/app-${TIMESTAMP}.db"
