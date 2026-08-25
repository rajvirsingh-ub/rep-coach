"use client";

import { useCallback, useEffect, useState } from "react";

export interface WorkoutHistoryEntry {
  id: string;
  createdAt: number;
  exerciseName: string;
  userContext: string;
  feedback: string;
  detectedFlaws: string[];
  formCorrections: string[];
  annotatedImage: string | null;
}

// Reads workout history from the server (workout_history table, scoped to
// the logged-in user via their session) instead of localStorage, so
// sessions are visible from any browser/device, not just the one that
// created them. New entries are created server-side by /api/audit itself
// — refresh() just re-fetches the canonical list after an analysis
// completes.
export function useWorkoutHistory() {
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/history");
      if (!res.ok) return;
      const body = await res.json();
      setHistory(body.history ?? []);
    } catch {
      // Leave existing history state as-is on a transient fetch failure.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { history, loading, refresh };
}
