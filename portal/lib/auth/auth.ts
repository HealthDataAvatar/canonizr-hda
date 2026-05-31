import NextAuth from "next-auth";
import { AzureTableStorageAdapter } from "@/lib/services/auth-adapter";
import { sendVerificationRequest } from "./email";
import { getServices } from "@/lib/services";
import { onCreateUser } from "./on-create-user";
import { appendConfig } from "@/lib/data/tables/user-config";
import { appendPermissions } from "@/lib/data/tables/user-permissions";

const nextAuth = NextAuth({
  adapter: AzureTableStorageAdapter(process.env.TABLE_STORAGE_CONNECTION_STRING!),
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
      await onCreateUser(
        user,
        getServices(),
        async (userId, changedBy) => {
          await appendConfig(userId, {
            freeUnits: 500,
            maxKeys: 100,
            pricePerUnit: 0.003,
            spendCapKB: null,
            changedBy,
          });
        },
        async (userId, stripeCustomerId, changedBy) => {
          await appendPermissions(userId, {
            isAdmin: false,
            blocked: false,
            stripeCustomerId,
            changedBy,
          });
        },
      );
    },
  },
});

export const { handlers, signIn, signOut, auth } = nextAuth;
