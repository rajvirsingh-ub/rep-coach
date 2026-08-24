import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { isAdminEmail } from "@/lib/admin";
import { getUserByEmail, verifyCredentials } from "@/lib/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Running behind a reverse proxy (Caddy) in production — trust its
  // forwarded host/proto headers instead of requiring an exact AUTH_URL.
  trustHost: true,
  providers: [
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
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        // Just the initial value at sign-in — the session callback below
        // re-checks the DB on every read, so it's fine if this goes stale.
        token.isEmailVerified = Boolean(user.isEmailVerified);
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
        // client-triggered JWT refresh.
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
