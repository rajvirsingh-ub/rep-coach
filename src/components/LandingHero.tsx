"use client";

import { useState } from "react";
import { AuthModal } from "@/components/AuthModal";
import { PoseSkeleton } from "@/components/PoseSkeleton";

export function LandingHero() {
  const [modalTab, setModalTab] = useState<"signin" | "signup" | null>(null);

  return (
    <>
      <div
        className="relative flex flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden bg-zinc-950 px-6 py-16 text-center"
        onClick={() => setModalTab("signup")}
      >
        <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 size-96 rounded-full bg-fuchsia-600/25 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative flex flex-col items-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-400">
            Rep Coach
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-7xl">
            Want your form
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
              corrected?
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-zinc-400">
            Upload a set and let AI break down your form joint by joint —
            catching what a mirror can&apos;t.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <FeatureChip icon={<BoltIcon />} text="Instant AI feedback" />
            <FeatureChip icon={<ChartIcon />} text="Track your history" />
            <FeatureChip icon={<TargetIcon />} text="Personalized corrections" />
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setModalTab("signup");
              }}
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Get Started
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setModalTab("signin");
              }}
              className="rounded-lg border border-zinc-700 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5"
            >
              Sign In
            </button>
          </div>

          <p className="mt-8 animate-pulse text-xs uppercase tracking-widest text-zinc-600">
            or tap anywhere to jump in
          </p>

          <div className="mt-12">
            <PoseSkeleton />
          </div>
        </div>
      </div>

      {modalTab && <AuthModal initialTab={modalTab} onClose={() => setModalTab(null)} />}
    </>
  );
}

function FeatureChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-white/5 px-3 py-1.5 text-xs text-zinc-300">
      {icon}
      {text}
    </span>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M17 7h4v4" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}
