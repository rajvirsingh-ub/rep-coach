import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { createUser, getAllUsers } from "@/lib/users";

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user || !isAdminEmail(session.user.email)) {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ users: await getAllUsers() });
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email, password } = await request.json();

    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const user = await createUser(email, password);
    return NextResponse.json({ user });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Could not create user." },
      { status: 400 }
    );
  }
}
