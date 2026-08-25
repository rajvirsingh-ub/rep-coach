import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getHistoryForUser } from "@/lib/history";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const history = await getHistoryForUser(session.user.id);
  return NextResponse.json({ history });
}
