"use client";

import { useCallback, useEffect, useState } from "react";

export interface WorkoutHistoryEntry {
  id: string;
  timestamp: number;
  exerciseName: string;
  userContext: string;
  feedback: string;
  detectedFlaws: string[];
  formCorrections: string[];
}

const MAX_ENTRIES = 50;

function storageKey(userId: string): string {
  return `history_${userId}`;
}

function readFromStorage(userId: string): WorkoutHistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as WorkoutHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

// Saves successful analysis results to localStorage, namespaced per signed-in
// user so history from different accounts on the same machine never mixes.
export function useWorkoutHistory(userId: string | undefined) {
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(userId ? readFromStorage(userId) : []);
  }, [userId]);

  const addEntry = useCallback(
    (entry: Omit<WorkoutHistoryEntry, "id" | "timestamp">) => {
      if (!userId) return;

      const newEntry: WorkoutHistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };

      setHistory((prev) => {
        const updated = [newEntry, ...prev].slice(0, MAX_ENTRIES);
        try {
          localStorage.setItem(storageKey(userId), JSON.stringify(updated));
        } catch {
          // localStorage may be full or unavailable (e.g. private browsing) —
          // keep the in-memory state regardless so the session isn't lost.
        }
        return updated;
      });
    },
    [userId]
  );

  return { history, addEntry };
}
