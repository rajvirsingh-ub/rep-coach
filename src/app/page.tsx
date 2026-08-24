import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Dashboard } from "@/components/Dashboard";
import { LandingHero } from "@/components/LandingHero";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return <LandingHero />;
  }

  if (!session.user.isEmailVerified) {
    redirect("/verify-email");
  }

  return <Dashboard session={session} />;
}
