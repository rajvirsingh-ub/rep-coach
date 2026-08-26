import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

// libSQL's client talks to either a local SQLite file or a remote Turso
// database through the same API, just by changing the connection URL — so
// local dev needs no Turso account at all, and production just sets the
// two env vars above.
function createDbClient() {
  if (TURSO_DATABASE_URL) {
    return createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
  }

  const localPath = path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  return createClient({ url: `file:${localPath}` });
}

export const db = createDbClient();

async function migrate(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  // Migration guard: the users table may already exist from before
  // email_verified was introduced.
  const columns = await db.execute("PRAGMA table_info(users)");
  const hasEmailVerified = columns.rows.some((row) => row.name === "email_verified");
  if (!hasEmailVerified) {
    await db.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS workout_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      user_context TEXT NOT NULL,
      feedback TEXT NOT NULL,
      detected_flaws TEXT NOT NULL,
      form_corrections TEXT NOT NULL,
      annotated_image TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_workout_history_user_id ON workout_history(user_id)"
  );

  // Migration guard: workout_history may already exist from before
  // optimization_tips was introduced.
  const historyColumns = await db.execute("PRAGMA table_info(workout_history)");
  const hasOptimizationTips = historyColumns.rows.some((row) => row.name === "optimization_tips");
  if (!hasOptimizationTips) {
    await db.execute(
      "ALTER TABLE workout_history ADD COLUMN optimization_tips TEXT NOT NULL DEFAULT '[]'"
    );
  }
}

let migrated: Promise<void> | null = null;

export function ensureMigrated(): Promise<void> {
  if (!migrated) {
    migrated = migrate();
  }
  return migrated;
}
