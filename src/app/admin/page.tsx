import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { AdminPanel } from "@/components/AdminPanel";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/");
  }

  return <AdminPanel />;
}
