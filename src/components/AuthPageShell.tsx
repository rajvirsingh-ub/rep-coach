// Shared centered-card background for the standalone auth-adjacent pages
// (sign in, sign up, verify email, forgot/reset password) — consistent
// subtle brand glow behind the card, no hooks so it's usable from both
// server and client page components.
export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="pointer-events-none absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/20" />
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}
