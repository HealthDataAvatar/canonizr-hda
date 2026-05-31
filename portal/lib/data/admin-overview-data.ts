/**
 * Server-side data assembly for the admin overview dashboard.
 *
 * Reads from Redis (queue stats) and Table Storage (job/user counts).
 */

import { requireAdmin } from "@/lib/auth/session";
import { getRedis } from "@/lib/redis";
import { getTableClient } from "./table-client";
import { TableName } from "./table-names";

const STREAM_KEY = "stream:convert";
const GROUP_NAME = "workers";

export interface AdminOverview {
  // Queue (real-time from Redis)
  queueLength: number;
  queueSizeKB: number;
  inFlightJobs: number;
  oldestWaitingSince: string | null; // ISO string or null

  // Historical (from Table Storage)
  jobsToday: number;
  jobsErrorToday: number;
  totalUsers: number;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  await requireAdmin({ autoRedirect: true });

  const [queue, tables] = await Promise.all([
    getQueueStats(),
    getTableStats(),
  ]);

  return { ...queue, ...tables };
}

// ---------------------------------------------------------------------------
// Redis queue stats
// ---------------------------------------------------------------------------

async function getQueueStats() {
  const redis = getRedis();
  if (!redis) {
    return {
      queueLength: 0,
      queueSizeKB: 0,
      inFlightJobs: 0,
      oldestWaitingSince: null,
    };
  }

  // Queue length
  let queueLength = 0;
  try {
    queueLength = await redis.xlen(STREAM_KEY);
  } catch {}

  // In-flight (pending) jobs
  let inFlightJobs = 0;
  try {
    const pending = await redis.xpending(STREAM_KEY, GROUP_NAME);
    if (pending && Array.isArray(pending) && pending.length >= 1) {
      inFlightJobs = typeof pending[0] === "number" ? pending[0] : 0;
    }
  } catch {}

  // Oldest waiting job + total queue size
  let queueSizeKB = 0;
  let oldestWaitingSince: string | null = null;
  try {
    // Get oldest entry (first in stream)
    const oldest = await redis.xrange(STREAM_KEY, "-", "+", "COUNT", 1);
    if (oldest && oldest.length > 0) {
      const streamId = oldest[0][0];
      const timestamp = parseInt(streamId.split("-")[0], 10);
      oldestWaitingSince = new Date(timestamp).toISOString();
    }

    // Sum input_bytes across all queued entries
    // For large queues this could be expensive; limit to first 1000
    const entries = await redis.xrange(STREAM_KEY, "-", "+", "COUNT", 1000);
    for (const [, fields] of entries) {
      for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === "input_bytes") {
          queueSizeKB += Math.round(parseInt(fields[i + 1], 10) / 1024);
        }
      }
    }
  } catch {}

  return { queueLength, queueSizeKB, inFlightJobs, oldestWaitingSince };
}

// ---------------------------------------------------------------------------
// Table Storage stats
// ---------------------------------------------------------------------------

async function getTableStats() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayFilter = todayStart.toISOString();

  let jobsToday = 0;
  let jobsErrorToday = 0;
  let totalUsers = 0;

  // Jobs today
  try {
    const jobs = getTableClient(TableName.GW_JOBS);
    for await (const e of jobs.listEntities({
      queryOptions: { filter: `created_at ge '${todayFilter}'` },
    })) {
      jobsToday++;
      if (e.status === "error") jobsErrorToday++;
    }
  } catch {}

  // Total users
  try {
    const users = getTableClient(TableName.USERS);
    for await (const _e of users.listEntities({
      queryOptions: { filter: "PartitionKey eq 'user'" },
    })) {
      totalUsers++;
    }
  } catch {}

  return { jobsToday, jobsErrorToday, totalUsers };
}
