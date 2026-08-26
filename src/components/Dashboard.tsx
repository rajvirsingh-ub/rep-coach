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
  optimizationTips: string[];
  annotatedImage: string | null;
}

type Status = "idle" | "loading" | "success" | "error";

const LOADING_PHRASES = [
  "Extracting joint landmarks...",
  "Analyzing biomechanics...",
  "Consulting your AI coach...",
  "Finalizing feedback...",
];

export function Dashboard({ session }: { session: Session }) {
  const { history, refresh } = useWorkoutHistory();

  const [exerciseName, setExerciseName] = useState("Back Squat");
  const [userContext, setUserContext] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showHistoryMobile, setShowHistoryMobile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
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

  useEffect(() => {
    if (status !== "loading") {
      setLoadingPhraseIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingPhraseIndex((i) => (i + 1) % LOADING_PHRASES.length);
    }, 1600);
    return () => clearInterval(interval);
  }, [status]);

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
      // /api/audit already persisted this entry server-side — just pull the
      // canonical updated list so it shows up in the sidebar.
      refresh();
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
      optimizationTips: entry.optimizationTips,
      annotatedImage: entry.annotatedImage,
    });
    setStatus("success");
    setShowHistoryMobile(false);
  }

  const totalSessions = history.length;
  const cleanCount = history.filter((h) => h.detectedFlaws.length === 0).length;
  const cleanRate = totalSessions > 0 ? Math.round((cleanCount / totalSessions) * 100) : 0;
  const lastSession = totalSessions > 0 ? new Date(history[0].createdAt) : null;

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
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Recent Sessions
            {totalSessions > 0 && (
              <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold normal-case text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {totalSessions}
              </span>
            )}
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
                    className="flex w-full items-start gap-2.5 rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:border-indigo-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-indigo-800 dark:hover:bg-zinc-900"
                  >
                    <DumbbellIcon className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {entry.exerciseName}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
                        {new Date(entry.createdAt).toLocaleString()}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs">
                        {entry.detectedFlaws.length === 0 ? (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircleIcon className="size-3" />
                            Clean rep
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertIcon className="size-3" />
                            {entry.detectedFlaws.length} flaw{entry.detectedFlaws.length > 1 ? "s" : ""} found
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="relative flex flex-1 flex-col items-center overflow-hidden px-4 py-10">
          <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/15" />

          <div className="relative w-full max-w-xl">
            {totalSessions > 0 && (
              <div className="mb-6 grid grid-cols-3 gap-3">
                <StatCard label="Sessions" value={String(totalSessions)} icon={<ChartBarIcon />} />
                <StatCard label="Clean Rate" value={`${cleanRate}%`} icon={<CheckCircleIcon />} />
                <StatCard
                  label="Last Set"
                  value={
                    lastSession
                      ? lastSession.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                      : "—"
                  }
                  icon={<CalendarIcon />}
                />
              </div>
            )}

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
                className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
                className="mb-4 w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="e.g., I have a bad knee so I am limiting my depth."
              />

              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Video
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (status !== "loading") setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (status === "loading") return;
                  const file = e.dataTransfer.files?.[0];
                  if (file) setVideoFile(file);
                }}
                className={`mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                  status === "loading" ? "pointer-events-none opacity-60" : ""
                } ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                    : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  disabled={status === "loading"}
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                {videoFile ? (
                  <>
                    <VideoIcon className="size-8 text-indigo-500" />
                    <p className="max-w-full truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {videoFile.name}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                      {formatBytes(videoFile.size)} · Click to change
                    </p>
                  </>
                ) : (
                  <>
                    <UploadIcon className="size-8 text-zinc-400" />
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">MP4 or MOV</p>
                  </>
                )}
              </div>

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
                    {LOADING_PHRASES[loadingPhraseIndex]}
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
                {result.annotatedImage && (
                  <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                    <h2 className="flex items-center gap-2 border-b border-zinc-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      <ImageIcon className="size-4" />
                      Visual Breakdown
                    </h2>
                    <div className="flex justify-center bg-zinc-100 p-4 dark:bg-zinc-900">
                      <img
                        src={result.annotatedImage}
                        alt="Pose overlay highlighting flagged form issues in red"
                        className="max-h-96 rounded-lg object-contain"
                      />
                    </div>
                    {result.detectedFlaws.length > 0 && (
                      <p className="flex items-center gap-1.5 px-5 py-3 text-xs text-zinc-500 dark:text-zinc-500">
                        <span className="size-2 shrink-0 rounded-full bg-red-500" />
                        Red markers show the joints/regions involved in the flaws below
                      </p>
                    )}
                  </div>
                )}

                {result.detectedFlaws.length === 0 && (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                    <CheckCircleIcon className="size-6 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                        Clean rep!
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        No form issues detected in this set.
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <ChatIcon className="size-4" />
                    Feedback
                  </h2>
                  <p className="text-base leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {result.feedback}
                  </p>
                </div>

                {result.detectedFlaws.length > 0 && (
                  <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      <AlertIcon className="size-4 text-amber-500" />
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
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
                      <ClipboardIcon className="size-4" />
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

                {result.optimizationTips.length > 0 && (
                  <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/50 p-5 shadow-sm dark:border-fuchsia-900/50 dark:bg-fuchsia-950/20">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-400">
                      <LightbulbIcon className="size-4" />
                      Optimization Tips
                    </h2>
                    <ul className="space-y-2">
                      {result.optimizationTips.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200"
                        >
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fuchsia-400" />
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

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-indigo-500">{icon}</div>
      <p className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-500">{label}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function DumbbellIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5 4 4M17.5 17.5 20 20M6.5 17.5 4 20M17.5 6.5 20 4" />
      <rect x="7" y="9" width="10" height="6" rx="1" />
    </svg>
  );
}

function CheckCircleIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function AlertIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z" />
    </svg>
  );
}

function ChatIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function ClipboardIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

function LightbulbIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2Z" />
    </svg>
  );
}

function UploadIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

function VideoIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

function ChartBarIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" />
      <rect x="12.5" y="8" width="3" height="10" />
      <rect x="18" y="5" width="3" height="13" />
    </svg>
  );
}

function CalendarIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function ImageIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}
