import nodemailer from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER ?? "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD ?? "";

const transporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: GMAIL_USER,
          pass: GMAIL_APP_PASSWORD,
        },
      })
    : null;

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (!transporter) {
    throw new Error(
      "GMAIL_USER / GMAIL_APP_PASSWORD are not set. Add them to .env.local and restart the server."
    );
  }

  await transporter.sendMail({
    from: `"Form Auditor" <${GMAIL_USER}>`,
    to: email,
    subject: "Your Form Auditor verification code",
    html: `
      <div style="font-family: sans-serif; padding: 24px;">
        <h2 style="margin-bottom: 8px;">Verify your email</h2>
        <p>Your verification code is:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px;">${code}</p>
        <p style="color: #666;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  if (!transporter) {
    throw new Error(
      "GMAIL_USER / GMAIL_APP_PASSWORD are not set. Add them to .env.local and restart the server."
    );
  }

  await transporter.sendMail({
    from: `"Form Auditor" <${GMAIL_USER}>`,
    to: email,
    subject: "Reset your Form Auditor password",
    html: `
      <div style="font-family: sans-serif; padding: 24px;">
        <h2 style="margin-bottom: 8px;">Reset your password</h2>
        <p>Your password reset code is:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px;">${code}</p>
        <p style="color: #666;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
      </div>
    `,
  });
}

export async function sendPasswordChangedNotificationEmail(email: string): Promise<void> {
  if (!transporter) {
    throw new Error(
      "GMAIL_USER / GMAIL_APP_PASSWORD are not set. Add them to .env.local and restart the server."
    );
  }

  await transporter.sendMail({
    from: `"Form Auditor" <${GMAIL_USER}>`,
    to: email,
    subject: "Your password was changed",
    html: `
      <div style="font-family: sans-serif; padding: 24px;">
        <h2 style="margin-bottom: 8px;">Password changed</h2>
        <p>The password for your Form Auditor account (${email}) was just changed.</p>
        <p style="color: #666;">If this was you, no action is needed. If you didn't make this change, someone else may have access to your email — reset your password again immediately.</p>
      </div>
    `,
  });
}

export async function sendVerifiedConfirmationEmail(email: string): Promise<void> {
  if (!transporter) {
    throw new Error(
      "GMAIL_USER / GMAIL_APP_PASSWORD are not set. Add them to .env.local and restart the server."
    );
  }

  await transporter.sendMail({
    from: `"Form Auditor" <${GMAIL_USER}>`,
    to: email,
    subject: "Your email is verified",
    html: `
      <div style="font-family: sans-serif; padding: 24px;">
        <h2 style="margin-bottom: 8px;">You're verified!</h2>
        <p>Your email address (${email}) has been successfully verified. Your Form Auditor account is now fully active.</p>
      </div>
    `,
  });
}
