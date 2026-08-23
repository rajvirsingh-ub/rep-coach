import { NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/email";
import { createAndStoreOtp } from "@/lib/otpStore";
import { getUserByEmail } from "@/lib/users";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "No account found for this email." }, { status: 404 });
    }
    if (user.isEmailVerified) {
      return NextResponse.json({ error: "This email is already verified." }, { status: 400 });
    }

    const code = await createAndStoreOtp(email);
    await sendOtpEmail(email, code);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Could not send verification code." },
      { status: 500 }
    );
  }
}
