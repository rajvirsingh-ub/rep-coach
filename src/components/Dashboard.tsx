"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { useWorkoutHistory, type WorkoutHistoryEntry } from "@/hooks/useWorkoutHistory";
import { BrandMark } from "@/components/BrandMark";

interface AuditResult {
  detectedFlaws: string[];
  feedback: string;
  formCorrections: string[];
}

type Status = "idle" | "loading" | "success" | "error";

export function Dashboard({ session }: { session: Session }) {
  const userId = session.user.id ?? session.user.email ?? undefined;
  const { history, addEntry } = useWorkoutHistory(userId);

  const [exerciseName, setExerciseName] = useState("Back Squat");
  const [userContext, setUserContext] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showHistoryMobile, setShowHistoryMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!videoFile) return;

    setStatus("loading");
    setErrorMessage("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("exerciseName", exerciseName);
      formData.append("userContext", userContext);
      formData.append("video", videoFile);

      const res = await fetch("/api/audit", {
        method: "POST",
        body: formData,
      });

      const body = await res.json();

      if (!res.ok || !body.success) {
        throw new Error(body.details || body.error || "Something went wrong during analysis.");
      }

      const auditResult: AuditResult = body.data;
      setResult(auditResult);
      setStatus("success");
      addEntry({
        exerciseName,
        userContext,
        feedback: auditResult.feedback,
        detectedFlaws: auditResult.detectedFlaws,
        formCorrections: auditResult.formCorrections,
      });
    } catch (err: any) {
      setErrorMessage(err.message ?? "Unknown error");
      setStatus("error");
    }
  }

  function resetForm() {
    setVideoFile(null);
    setResult(null);
    setStatus("idle");
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function viewHistoryEntry(entry: WorkoutHistoryEntry) {
    setExerciseName(entry.exerciseName);
    setUserContext(entry.userContext);
    setVideoFile(null);
    setErrorMessage("");
    setResult({
      detectedFlaws: entry.detectedFlaws,
      feedback: entry.feedback,
      formCorrections: entry.formCorrections,
    });
    setStatus("success");
    setShowHistoryMobile(false);
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg">
            <BrandMark />
          </h1>
          <button
            onClick={() => setShowHistoryMobile((v) => !v)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300 md:hidden"
          >
            History
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-zinc-600 dark:text-zinc-400 sm:inline">
            {session.user.email ?? session.user.name}
          </span>
          {session.user.isAdmin && (
            <Link
              href="/admin"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Admin
            </Link>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside
          className={`${
            showHistoryMobile ? "block" : "hidden"
          } w-full shrink-0 border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:block md:w-72 md:border-b-0 md:border-r md:p-5`}
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Recent Sessions
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              Your analyzed sets will show up here.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => (
                <li key={entry.id}>
                  <button
                    onClick={() => viewHistoryEntry(entry)}
                    className="w-full rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {entry.exerciseName}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs">
                      {entry.detectedFlaws.length === 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Clean rep</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">
                          {entry.detectedFlaws.length} flaw{entry.detectedFlaws.length > 1 ? "s" : ""} found
                        </span>
                      )}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex flex-1 flex-col items-center px-4 py-10">
          <div className="w-full max-w-xl">
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Exercise
              </label>
              <input
                type="text"
                value={exerciseName}
                onChange={(e) => setExerciseName(e.target.value)}
                disabled={status === "loading"}
                className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="e.g. Back Squat"
              />

              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Context or Constraints (Optional)
              </label>
              <textarea
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                disabled={status === "loading"}
                rows={3}
                className="mb-4 w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="e.g., I have a bad knee so I am limiting my depth."
              />

              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Video
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                disabled={status === "loading"}
                onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                className="mb-4 block w-full text-sm text-zinc-700 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700 disabled:opacity-60 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900"
              />

              {videoPreviewUrl && (
                <video
                  src={videoPreviewUrl}
                  controls
                  className="mb-4 max-h-64 w-full rounded-lg bg-black"
                />
              )}

              <button
                type="submit"
                disabled={!videoFile || status === "loading"}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "loading" ? (
                  <>
                    <Spinner />
                    Analyzing form...
                  </>
                ) : (
                  "Analyze Form"
                )}
              </button>
            </form>

            {status === "error" && (
              <div className="mt-6 space-y-3">
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  <p className="font-medium">Analysis failed</p>
                  <p className="mt-1 text-red-700 dark:text-red-400">{errorMessage}</p>
                </div>
                <button
                  onClick={resetForm}
                  className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Try Again
                </button>
              </div>
            )}

            {status === "success" && result && (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Feedback
                  </h2>
                  <p className="text-base leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {result.feedback}
                  </p>
                </div>

                {result.detectedFlaws.length > 0 && (
                  <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Detected Flaws
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {result.detectedFlaws.map((flaw) => (
                        <span
                          key={flaw}
                          className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-300"
                        >
                          {flaw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.formCorrections.length > 0 && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm dark:border-indigo-900/50 dark:bg-indigo-950/20">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
                      Form Corrections &amp; Technical Suggestions
                    </h2>
                    <ul className="space-y-2">
                      {result.formCorrections.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200"
                        >
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={resetForm}
                  className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Analyze another set
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
