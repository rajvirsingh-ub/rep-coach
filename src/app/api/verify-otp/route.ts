import { NextResponse } from "next/server";
import { sendVerifiedConfirmationEmail } from "@/lib/email";
import { checkOtp } from "@/lib/otpStore";
import { markEmailVerified } from "@/lib/users";

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json();

    if (typeof email !== "string" || typeof code !== "string") {
      return NextResponse.json({ error: "Missing email or code." }, { status: 400 });
    }

    const result = await checkOtp(email, code);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    await markEmailVerified(email);

    try {
      await sendVerifiedConfirmationEmail(email);
    } catch (sendError) {
      // Verification itself already succeeded — a failed confirmation email
      // shouldn't undo that or block the response.
      console.error("[verify-otp] Failed to send confirmation email:", sendError);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Could not verify code." },
      { status: 500 }
    );
  }
}
