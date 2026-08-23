import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { isAdminEmail } from "@/lib/admin";
import { getUserByEmail, verifyCredentials } from "@/lib/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Running behind a reverse proxy (Caddy) in production — trust its
  // forwarded host/proto headers instead of requiring an exact AUTH_URL.
  trustHost: true,
  providers: [
    GitHub,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }
        return verifyCredentials(email, password);
      },
    }),
  ],
  // Credentials-based sign-in requires JWT sessions (NextAuth doesn't
  // support database sessions for the Credentials provider).
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user, account }) {
      if (user) {
        token.sub = user.id;
        // GitHub already verified this email as part of its own OAuth flow;
        // credentials accounts go through our own OTP verification. This is
        // just the initial value at sign-in — the session callback below
        // re-checks the DB on every read, so it's fine if this goes stale.
        token.isEmailVerified =
          account?.provider === "github" ? true : Boolean(user.isEmailVerified);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.isAdmin = isAdminEmail(session.user.email);

        // Re-derive verification status from the database on every session
        // read instead of trusting whatever was baked into the JWT at
        // sign-in time. This is what lets the verify-email page take effect
        // immediately on the very next page load, without depending on a
        // client-triggered JWT refresh. (This is a real network round-trip
        // against Turso in production, not a free local lookup — acceptable
        // for this app's scale, but worth knowing if session checks ever
        // feel slow.)
        const dbUser = token.email ? await getUserByEmail(token.email) : undefined;
        session.user.isEmailVerified = dbUser
          ? dbUser.isEmailVerified
          : Boolean(token.isEmailVerified);
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
});
