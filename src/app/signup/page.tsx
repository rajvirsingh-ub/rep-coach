import Link from "next/link";
import { AuthPageShell } from "@/components/AuthPageShell";
import { BrandMark } from "@/components/BrandMark";
import { SignUpForm } from "@/components/SignUpForm";

export default function SignUpPage() {
  return (
    <AuthPageShell>
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-center text-2xl">
          <BrandMark />
        </h1>
        <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Track your form analysis history over time.
        </p>

        <div className="mt-6">
          <SignUpForm />
        </div>

        <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/signin" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Sign in
          </Link>
        </p>
      </div>
    </AuthPageShell>
  );
}
