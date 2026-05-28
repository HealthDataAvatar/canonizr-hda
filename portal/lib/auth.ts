import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { AzureTableStorageAdapter } from "./table-storage";
import { DEV_MODE, DEV_USER } from "./dev";
import type { Session } from "next-auth";

const connectionString = process.env.TABLE_STORAGE_CONNECTION_STRING!;

function createNextAuth() {
  return NextAuth({
    adapter: AzureTableStorageAdapter(connectionString),
    session: { strategy: "jwt" },
    pages: { signIn: "/auth" },
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

        await createSubscription(user.id, "default");
      },
    },
  });
}

// In dev mode, don't construct NextAuth at all — no providers to validate.
const nextAuth = DEV_MODE ? null : createNextAuth();

const devSession: Session = {
  user: DEV_USER,
  expires: new Date(Date.now() + 86400_000).toISOString(),
};

export const handlers = nextAuth?.handlers ?? {};
export const signIn = nextAuth?.signIn ?? (async () => {});
export const signOut = nextAuth?.signOut ?? (async () => {});

export async function auth(): Promise<Session | null> {
  if (DEV_MODE) return devSession;
  return nextAuth!.auth();
}
