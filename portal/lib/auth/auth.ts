import NextAuth from "next-auth";
import { AzureTableStorageAdapter } from "../services/table-storage";
import { sendVerificationRequest } from "./email";
import { getServices } from "../services/services";

const connectionString = process.env.TABLE_STORAGE_CONNECTION_STRING!;

const nextAuth = NextAuth({
  adapter: AzureTableStorageAdapter(connectionString),
  session: { strategy: "jwt" },
  pages: { signIn: "/auth" },
  providers: [
    {
      id: "email",
      type: "email" as const,
      name: "Email",
      from: process.env.EMAIL_FROM!,
      maxAge: 24 * 60 * 60,
      sendVerificationRequest,
    },
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.email || !user.id) return;

      const { keys, billing } = getServices();
      const { updateUserRecord } = await import("../services/table-storage");

      const { customerId } = await billing.createCustomer(
        user.email,
        user.name ?? undefined,
      );

      await updateUserRecord(connectionString, user.id, {
        stripeCustomerId: customerId,
      });

      await keys.create(user.id, "my-first-key");
    },
  },
});

export const { handlers, signIn, signOut, auth } = nextAuth;
