"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AdminUser {
  id: string;
  email: string;
  isEmailVerified: boolean;
  createdAt: number;
}

export function AdminPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load users.");
      setUsers(body.users);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, password: newPassword }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not create user.");

      setNewEmail("");
      setNewPassword("");
      await loadUsers();
    } catch (err: any) {
      setCreateError(err.message ?? "Something went wrong.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`Remove ${email}? This can't be undone.`)) return;

    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not remove user.");
      await loadUsers();
    } catch (err: any) {
      alert(err.message ?? "Something went wrong.");
    }
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-zinc-50 px-4 py-10 font-sans dark:bg-black">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            User Admin
          </h1>
          <Link href="/" className="text-sm font-medium text-zinc-600 underline dark:text-zinc-400">
            Back to dashboard
          </Link>
        </div>

        <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Add User
          </h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {creating ? "Adding..." : "Add"}
            </button>
          </form>
          {createError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{createError}</p>}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="border-b border-zinc-200 p-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Registered Users ({users.length})
          </h2>

          {loading ? (
            <p className="p-4 text-sm text-zinc-500 dark:text-zinc-500">Loading...</p>
          ) : error ? (
            <p className="p-4 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : users.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500 dark:text-zinc-500">No users yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {users.map((user) => (
                <li key={user.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {user.email}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
                      Joined {new Date(user.createdAt).toLocaleDateString()} ·{" "}
                      {user.isEmailVerified ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Verified</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Unverified</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(user.id, user.email)}
                    className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
