import { NextResponse } from "next/server";
import { sendPasswordChangedNotificationEmail } from "@/lib/email";
import { checkOtp } from "@/lib/otpStore";
import { getUserByEmail, updatePassword } from "@/lib/users";

export async function POST(request: Request) {
  try {
    const { email, code, newPassword } = await request.json();

    if (
      typeof email !== "string" ||
      typeof code !== "string" ||
      typeof newPassword !== "string"
    ) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "Invalid code or email." }, { status: 400 });
    }

    const result = await checkOtp(email, code);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    await updatePassword(email, newPassword);

    try {
      await sendPasswordChangedNotificationEmail(email);
    } catch (sendError) {
      // The password change itself already succeeded — a failed
      // notification email shouldn't undo that or block the response.
      console.error("[reset-password] Failed to send change notification email:", sendError);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Could not reset password." },
      { status: 500 }
    );
  }
}
