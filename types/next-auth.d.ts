import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isEmailVerified: boolean;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    isEmailVerified?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isEmailVerified?: boolean;
  }
}
