import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/email";
import { createAndStoreOtp } from "@/lib/otpStore";
import { getUserByEmail } from "@/lib/users";

const GENERIC_MESSAGE = "If an account exists for that email, a reset code has been sent.";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Always respond the same way regardless of whether the account exists,
  // so this endpoint can't be used to enumerate registered emails.
  const user = await getUserByEmail(email);
  if (user) {
    try {
      const code = await createAndStoreOtp(email);
      await sendPasswordResetEmail(email, code);
    } catch (err) {
      console.error("[forgot-password] Failed to send reset email:", err);
    }
  }

  return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
}
