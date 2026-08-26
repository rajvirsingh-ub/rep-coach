import { randomUUID } from "node:crypto";
import { db, ensureMigrated } from "@/lib/db";

const MAX_ENTRIES_PER_USER = 50;

export interface StoredHistoryEntry {
  id: string;
  exerciseName: string;
  userContext: string;
  feedback: string;
  detectedFlaws: string[];
  formCorrections: string[];
  optimizationTips: string[];
  annotatedImage: string | null;
  createdAt: number;
}

export async function createHistoryEntry(
  userId: string,
  entry: Omit<StoredHistoryEntry, "id" | "createdAt">
): Promise<StoredHistoryEntry> {
  await ensureMigrated();

  const id = randomUUID();
  const createdAt = Date.now();

  await db.execute({
    sql: `INSERT INTO workout_history
          (id, user_id, exercise_name, user_context, feedback, detected_flaws, form_corrections, optimization_tips, annotated_image, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      userId,
      entry.exerciseName,
      entry.userContext,
      entry.feedback,
      JSON.stringify(entry.detectedFlaws),
      JSON.stringify(entry.formCorrections),
      JSON.stringify(entry.optimizationTips),
      entry.annotatedImage,
      createdAt,
    ],
  });

  // Keep only the most recent MAX_ENTRIES_PER_USER rows for this user —
  // each entry can carry a ~30-50KB image, so unbounded growth isn't free.
  await db.execute({
    sql: `DELETE FROM workout_history
          WHERE user_id = ? AND id NOT IN (
            SELECT id FROM workout_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
          )`,
    args: [userId, userId, MAX_ENTRIES_PER_USER],
  });

  return { id, createdAt, ...entry };
}

export async function getHistoryForUser(userId: string): Promise<StoredHistoryEntry[]> {
  await ensureMigrated();

  const result = await db.execute({
    sql: `SELECT id, exercise_name, user_context, feedback, detected_flaws, form_corrections,
                 optimization_tips, annotated_image, created_at
          FROM workout_history WHERE user_id = ? ORDER BY created_at DESC`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    exerciseName: row.exercise_name as string,
    userContext: row.user_context as string,
    feedback: row.feedback as string,
    detectedFlaws: JSON.parse(row.detected_flaws as string),
    formCorrections: JSON.parse(row.form_corrections as string),
    optimizationTips: row.optimization_tips ? JSON.parse(row.optimization_tips as string) : [],
    annotatedImage: (row.annotated_image as string | null) ?? null,
    createdAt: Number(row.created_at),
  }));
}

export async function deleteHistoryForUser(userId: string): Promise<void> {
  await ensureMigrated();
  await db.execute({ sql: "DELETE FROM workout_history WHERE user_id = ?", args: [userId] });
}
