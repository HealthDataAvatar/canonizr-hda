import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { AzureTableStorageAdapter } from "./table-storage";

const connectionString = process.env.TABLE_STORAGE_CONNECTION_STRING!;

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: AzureTableStorageAdapter(connectionString),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth",
  },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Nodemailer({
      server: process.env.EMAIL_SERVER!,
      from: process.env.EMAIL_FROM!,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // On first sign-up: create Stripe customer + first APIM subscription
      // This runs server-side after the adapter creates the user record
      if (!user.email || !user.id) return;

      const { createCustomerWithSubscription } = await import("./stripe");
      const { createSubscription } = await import("./apim");
      const { updateUserRecord } = await import("./table-storage");

      const { customerId } = await createCustomerWithSubscription(
        user.email,
        user.name ?? undefined
      );

      await updateUserRecord(connectionString, user.id, {
        stripeCustomerId: customerId,
      });

      // Create the user's first API key
      await createSubscription(user.id, "default");
    },
  },
});
