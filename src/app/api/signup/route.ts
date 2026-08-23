import { NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/email";
import { createAndStoreOtp } from "@/lib/otpStore";
import { createUser } from "@/lib/users";

export async function POST(request: Request) {
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

    await createUser(email, password);

    const code = await createAndStoreOtp(email);
    let emailSent = true;
    try {
      await sendOtpEmail(email, code);
    } catch (sendError) {
      console.error("[Signup] Failed to send verification email:", sendError);
      emailSent = false;
    }

    return NextResponse.json({ success: true, emailSent });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Could not create account." },
      { status: 400 }
    );
  }
}
