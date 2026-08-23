import { db, ensureMigrated } from "@/lib/db";
import { generateOtp, hashOtp, otpMatches } from "@/lib/otp";

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function createAndStoreOtp(email: string): Promise<string> {
  await ensureMigrated();
  const normalizedEmail = email.toLowerCase().trim();
  const code = generateOtp();
  const codeHash = hashOtp(code);
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  await db.execute({
    sql: `INSERT INTO otp_codes (email, code_hash, expires_at, attempts)
          VALUES (?, ?, ?, 0)
          ON CONFLICT(email) DO UPDATE SET
            code_hash = excluded.code_hash,
            expires_at = excluded.expires_at,
            attempts = 0`,
    args: [normalizedEmail, codeHash, expiresAt],
  });

  return code;
}

export async function checkOtp(
  email: string,
  code: string
): Promise<{ ok: boolean; reason?: string }> {
  await ensureMigrated();
  const normalizedEmail = email.toLowerCase().trim();

  const result = await db.execute({
    sql: "SELECT code_hash, expires_at, attempts FROM otp_codes WHERE email = ?",
    args: [normalizedEmail],
  });
  const row = result.rows[0] as unknown as
    | { code_hash: string; expires_at: number; attempts: number }
    | undefined;

  if (!row) {
    return { ok: false, reason: "No verification code found for this email. Request a new one." };
  }
  if (Date.now() > Number(row.expires_at)) {
    return { ok: false, reason: "This code has expired. Request a new one." };
  }
  if (Number(row.attempts) >= MAX_ATTEMPTS) {
    return { ok: false, reason: "Too many incorrect attempts. Request a new code." };
  }

  if (!otpMatches(code, row.code_hash)) {
    await db.execute({
      sql: "UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ?",
      args: [normalizedEmail],
    });
    return { ok: false, reason: "Incorrect code." };
  }

  await db.execute({ sql: "DELETE FROM otp_codes WHERE email = ?", args: [normalizedEmail] });
  return { ok: true };
}
