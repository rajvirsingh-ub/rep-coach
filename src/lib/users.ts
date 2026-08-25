import { randomUUID } from "node:crypto";
import { db, ensureMigrated } from "@/lib/db";
import { deleteHistoryForUser } from "@/lib/history";
import { hashPassword, verifyPassword } from "@/lib/password";

export interface AppUser {
  id: string;
  email: string;
  isEmailVerified: boolean;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified: number;
}

async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  await ensureMigrated();
  const result = await db.execute({
    sql: "SELECT id, email, password_hash, email_verified FROM users WHERE email = ?",
    args: [email.toLowerCase().trim()],
  });
  return result.rows[0] as unknown as UserRow | undefined;
}

export async function getUserByEmail(email: string): Promise<AppUser | undefined> {
  const user = await findUserByEmail(email);
  if (!user) return undefined;
  return { id: user.id, email: user.email, isEmailVerified: Boolean(user.email_verified) };
}

export async function markEmailVerified(email: string): Promise<void> {
  await ensureMigrated();
  await db.execute({
    sql: "UPDATE users SET email_verified = 1 WHERE email = ?",
    args: [email.toLowerCase().trim()],
  });
}

export async function createUser(email: string, password: string): Promise<AppUser> {
  const normalizedEmail = email.toLowerCase().trim();

  if (await findUserByEmail(normalizedEmail)) {
    throw new Error("An account with this email already exists.");
  }

  const id = randomUUID();
  const passwordHash = hashPassword(password);
  await db.execute({
    sql: "INSERT INTO users (id, email, password_hash, email_verified, created_at) VALUES (?, ?, ?, 0, ?)",
    args: [id, normalizedEmail, passwordHash, Date.now()],
  });

  return { id, email: normalizedEmail, isEmailVerified: false };
}

export async function verifyCredentials(email: string, password: string): Promise<AppUser | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  return { id: user.id, email: user.email, isEmailVerified: Boolean(user.email_verified) };
}

export interface AppUserSummary extends AppUser {
  createdAt: number;
}

export async function getAllUsers(): Promise<AppUserSummary[]> {
  await ensureMigrated();
  const result = await db.execute(
    "SELECT id, email, email_verified, created_at FROM users ORDER BY created_at DESC"
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    email: row.email as string,
    isEmailVerified: Boolean(row.email_verified),
    createdAt: Number(row.created_at),
  }));
}

export async function deleteUser(id: string): Promise<void> {
  await ensureMigrated();
  await deleteHistoryForUser(id);
  await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
}

export async function updatePassword(email: string, newPassword: string): Promise<void> {
  await ensureMigrated();
  const passwordHash = hashPassword(newPassword);
  await db.execute({
    sql: "UPDATE users SET password_hash = ? WHERE email = ?",
    args: [passwordHash, email.toLowerCase().trim()],
  });
}
