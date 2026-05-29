/**
 * Auth.js adapter for Azure Table Storage.
 *
 * Tables: Users, Accounts, Sessions, VerificationTokens
 * Partition keys use entity type for simplicity on a single-user-scale app.
 */

import { TableClient } from "@azure/data-tables";
import type { Adapter, AdapterUser, AdapterAccount, AdapterSession } from "next-auth/adapters";
import { randomUUID, randomBytes } from "crypto";

export function AzureTableStorageAdapter(
  connectionString: string
): Adapter {
  const opts = connectionString.includes("http://") ? { allowInsecureConnection: true } : {};
  const users = TableClient.fromConnectionString(connectionString, "Users", opts);
  const accounts = TableClient.fromConnectionString(connectionString, "Accounts", opts);
  const sessions = TableClient.fromConnectionString(connectionString, "Sessions", opts);
  const verificationTokens = TableClient.fromConnectionString(connectionString, "VerificationTokens", opts);

  const initPromise = Promise.all([
    users.createTable().catch(() => {}),
    accounts.createTable().catch(() => {}),
    sessions.createTable().catch(() => {}),
    verificationTokens.createTable().catch(() => {}),
  ]);

  function toUser(entity: Record<string, unknown>): AdapterUser {
    return {
      id: entity.rowKey as string,
      email: entity.email as string,
      emailVerified: entity.emailVerified ? new Date(entity.emailVerified as string) : null,
      name: (entity.name as string) ?? null,
      image: (entity.image as string) ?? null,
    };
  }

  return {
    async createUser(user) {
      await initPromise;
      const id = randomUUID();
      const encryptionKey = randomBytes(32).toString("hex");
      const entity = {
        partitionKey: "user",
        rowKey: id,
        email: user.email,
        emailVerified: user.emailVerified?.toISOString() ?? "",
        name: user.name ?? "",
        image: user.image ?? "",
        encryptionKey,
        stripeCustomerId: "",
        maxKeys: 100,
        freeUnits: 500,
        pricePerUnit: 0.003,
        notes: "",
      };
      await users.createEntity(entity);
      await users.createEntity({
        partitionKey: "email",
        rowKey: user.email,
        userId: id,
      });
      return { ...toUser(entity), id };
    },

    async getUser(id) {
      await initPromise;
      try {
        const entity = await users.getEntity("user", id);
        return toUser(entity);
      } catch {
        return null;
      }
    },

    async getUserByEmail(email) {
      await initPromise;
      try {
        const lookup = await users.getEntity("email", email);
        const userId = lookup.userId as string;
        const entity = await users.getEntity("user", userId);
        return toUser(entity);
      } catch {
        return null;
      }
    },

    async getUserByAccount({ providerAccountId, provider }) {
      await initPromise;
      try {
        const account = await accounts.getEntity(provider, providerAccountId);
        const userId = account.userId as string;
        const entity = await users.getEntity("user", userId);
        return toUser(entity);
      } catch {
        return null;
      }
    },

    async updateUser(user) {
      await initPromise;
      const existing = await users.getEntity("user", user.id!);
      const merged = {
        ...existing,
        ...(user.name !== undefined && { name: user.name }),
        ...(user.email !== undefined && { email: user.email }),
        ...(user.image !== undefined && { image: user.image }),
        ...(user.emailVerified !== undefined && {
          emailVerified: user.emailVerified?.toISOString() ?? "",
        }),
      };
      await users.updateEntity(merged as Record<string, unknown> & { partitionKey: string; rowKey: string }, "Merge");
      return toUser(merged as Record<string, unknown>);
    },

    async deleteUser(userId) {
      await initPromise;
      try {
        const entity = await users.getEntity("user", userId);
        await users.deleteEntity("user", userId);
        if (entity.email) {
          await users.deleteEntity("email", entity.email as string).catch(() => {});
        }
      } catch {
        // User may already be deleted
      }
    },

    async linkAccount(account) {
      await initPromise;
      await accounts.createEntity({
        partitionKey: account.provider,
        rowKey: account.providerAccountId,
        userId: account.userId,
        type: account.type,
        accessToken: account.access_token ?? "",
        refreshToken: account.refresh_token ?? "",
        expiresAt: account.expires_at ?? 0,
        tokenType: account.token_type ?? "",
        scope: account.scope ?? "",
        idToken: account.id_token ?? "",
      });
      return account as AdapterAccount;
    },

    async unlinkAccount({ providerAccountId, provider }) {
      await initPromise;
      await accounts.deleteEntity(provider, providerAccountId).catch(() => {});
    },

    async createSession(session) {
      await initPromise;
      await sessions.createEntity({
        partitionKey: "session",
        rowKey: session.sessionToken,
        userId: session.userId,
        expires: session.expires.toISOString(),
      });
      return session;
    },

    async getSessionAndUser(sessionToken) {
      await initPromise;
      try {
        const session = await sessions.getEntity("session", sessionToken);
        const user = await users.getEntity("user", session.userId as string);
        return {
          session: {
            sessionToken,
            userId: session.userId as string,
            expires: new Date(session.expires as string),
          },
          user: toUser(user),
        };
      } catch {
        return null;
      }
    },

    async updateSession(session) {
      await initPromise;
      try {
        const existing = await sessions.getEntity("session", session.sessionToken!);
        const merged = {
          ...existing,
          ...(session.expires && { expires: session.expires.toISOString() }),
          ...(session.userId && { userId: session.userId }),
        };
        await sessions.updateEntity(merged as Record<string, unknown> & { partitionKey: string; rowKey: string }, "Merge");
        return {
          sessionToken: session.sessionToken!,
          userId: (merged.userId as string) ?? "",
          expires: new Date((merged.expires as string) ?? ""),
        } satisfies AdapterSession;
      } catch {
        return null;
      }
    },

    async deleteSession(sessionToken) {
      await initPromise;
      await sessions.deleteEntity("session", sessionToken).catch(() => {});
    },

    async createVerificationToken(token) {
      await initPromise;
      await verificationTokens.upsertEntity({
        partitionKey: "token",
        rowKey: token.identifier,
        token: token.token,
        expires: token.expires.toISOString(),
      });
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      await initPromise;
      try {
        const entity = await verificationTokens.getEntity("token", identifier);
        if (entity.token !== token) return null;
        await verificationTokens.deleteEntity("token", identifier);
        return {
          identifier,
          token: entity.token as string,
          expires: new Date(entity.expires as string),
        };
      } catch {
        return null;
      }
    },
  };
}

/** Read user-specific fields from Table Storage (encryption key, Stripe ID, admin overrides). */
export async function getUserRecord(connectionString: string, userId: string) {
  const opts = connectionString.includes("http://") ? { allowInsecureConnection: true } : {};
  const client = TableClient.fromConnectionString(connectionString, "Users", opts);
  const entity = await client.getEntity("user", userId);
  return {
    id: entity.rowKey as string,
    email: entity.email as string,
    encryptionKey: entity.encryptionKey as string,
    stripeCustomerId: entity.stripeCustomerId as string,
    maxKeys: (entity.maxKeys as number) ?? 100,
    freeUnits: entity.freeUnits as number | null,
    pricePerUnit: (entity.pricePerUnit as number) ?? 0.003,
    notes: (entity.notes as string) ?? "",
  };
}

/** Update user record fields (e.g. after Stripe customer creation). */
export async function updateUserRecord(
  connectionString: string,
  userId: string,
  fields: Record<string, unknown>
) {
  const opts = connectionString.includes("http://") ? { allowInsecureConnection: true } : {};
  const client = TableClient.fromConnectionString(connectionString, "Users", opts);
  await client.updateEntity(
    { partitionKey: "user", rowKey: userId, ...fields },
    "Merge"
  );
}
