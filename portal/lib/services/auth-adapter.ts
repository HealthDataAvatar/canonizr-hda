/**
 * Auth.js adapter for Azure Table Storage.
 *
 * Tables: Users, VerificationTokens
 * Partition keys use entity type for simplicity on a single-user-scale app.
 *
 * Session + Account methods are intentionally absent: the portal uses the JWT
 * session strategy (`session.strategy: "jwt"`) with a single email provider, so
 * Auth.js never invokes createSession/getSessionAndUser/updateSession/
 * deleteSession or linkAccount/unlinkAccount/getUserByAccount.
 *
 * Uses getTableClient() for all table access — credential handling is
 * centralised in table-client.ts.
 */

import type { Adapter, AdapterUser } from "next-auth/adapters";
import { randomUUID, randomBytes } from "crypto";
import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-interface";

function makeClients() {
  return {
    users: getTableClient(TableName.USERS),
    verificationTokens: getTableClient(TableName.VERIFICATION_TOKENS),
    gwEncryptionKeys: getTableClient(TableName.GW_ENCRYPTION_KEYS),
  };
}

function toUser(entity: Record<string, unknown>): AdapterUser {
  return {
    id: entity.rowKey as string,
    email: entity.email as string,
    emailVerified: entity.emailVerified ? new Date(entity.emailVerified as string) : null,
    name: null,
    image: null,
  };
}

export function AzureTableStorageAdapter(): Adapter {
  const { users, verificationTokens, gwEncryptionKeys } = makeClients();

  return {
    async createUser(user) {
      const id = randomUUID();
      const encryptionKey = randomBytes(32).toString("hex");
      const entity = {
        partitionKey: "user",
        rowKey: id,
        email: user.email,
        emailVerified: user.emailVerified?.toISOString() ?? "",
        createdAt: new Date().toISOString(),
      };
      await users.upsertEntity(entity);
      await users.upsertEntity({
        partitionKey: "email",
        rowKey: user.email,
        userId: id,
      });
      await gwEncryptionKeys.upsertEntity({
        partitionKey: "key",
        rowKey: id,
        key_hex: encryptionKey,
      });
      return { ...toUser(entity), id };
    },

    async getUser(id) {
      try {
        const entity = await users.getEntity("user", id);
        return toUser(entity);
      } catch {
        return null;
      }
    },

    async getUserByEmail(email) {
      try {
        const lookup = await users.getEntity("email", email);
        const userId = lookup.userId as string;
        const entity = await users.getEntity("user", userId);
        return toUser(entity);
      } catch {
        return null;
      }
    },

    async updateUser(user) {
      const existing = await users.getEntity("user", user.id!);
      const merged = {
        ...existing,
        ...(user.email !== undefined && { email: user.email }),
        ...(user.emailVerified !== undefined && {
          emailVerified: user.emailVerified?.toISOString() ?? "",
        }),
      };
      await users.updateEntity(merged as Record<string, unknown> & { partitionKey: string; rowKey: string }, "Merge");
      return toUser(merged as Record<string, unknown>);
    },

    async deleteUser(userId) {
      try {
        const entity = await users.getEntity("user", userId);
        await users.deleteEntity("user", userId);
        if (entity.email) {
          await users.deleteEntity("email", entity.email as string).catch(() => {});
        }
        await gwEncryptionKeys.deleteEntity("key", userId).catch(() => {});
      } catch {
        // User may already be deleted
      }
    },

    async createVerificationToken(token) {
      await verificationTokens.upsertEntity({
        partitionKey: "token",
        rowKey: token.identifier,
        token: token.token,
        expires: token.expires.toISOString(),
      });
      return token;
    },

    async useVerificationToken({ identifier, token }) {
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
