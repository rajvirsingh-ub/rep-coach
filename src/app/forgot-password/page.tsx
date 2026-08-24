"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthPageShell } from "@/components/AuthPageShell";
import { BrandMark } from "@/components/BrandMark";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Something went wrong.");
      }

      setSent(true);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell>
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="mb-1 text-center text-xs font-semibold uppercase tracking-widest">
          <BrandMark />
        </p>
        <h1 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Forgot password
        </h1>
        <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Enter your email and we&apos;ll send you a code to reset your password.
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <p className="text-center text-sm text-zinc-700 dark:text-zinc-300">
              If an account exists for <span className="font-medium">{email}</span>, a reset
              code is on its way.
            </p>
            <Link
              href={`/reset-password?email=${encodeURIComponent(email)}`}
              className="flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              I have a code
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="you@example.com"
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send Reset Code"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/signin" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthPageShell>
  );
}
