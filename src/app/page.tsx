import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Dashboard } from "@/components/Dashboard";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  if (!session.user.isEmailVerified) {
    redirect("/verify-email");
  }

  return <Dashboard session={session} />;
}
