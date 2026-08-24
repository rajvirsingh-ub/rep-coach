"use client";

import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { SignInForm } from "@/components/SignInForm";
import { SignUpForm } from "@/components/SignUpForm";

export function AuthModal({
  initialTab,
  onClose,
}: {
  initialTab: "signin" | "signup";
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"signin" | "signup">(initialTab);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <BrandMark className="text-xl" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-6 flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
          <button
            onClick={() => setTab("signin")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              tab === "signin"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setTab("signup")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              tab === "signup"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            Sign Up
          </button>
        </div>

        {tab === "signin" ? <SignInForm /> : <SignUpForm />}
      </div>
    </div>
  );
}
