/** Rate limiter with pluggable storage. */

export interface RateLimitStore {
  /** Increment the counter for `key`, returning the new count and window expiry. */
  increment(key: string, windowMs: number): Promise<{ count: number }>;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

interface Entry {
  count: number;
  expiresAt: number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private entries = new Map<string, Entry>();

  async increment(key: string, windowMs: number): Promise<{ count: number }> {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (existing && existing.expiresAt > now) {
      existing.count++;
      return { count: existing.count };
    }

    const entry: Entry = { count: 1, expiresAt: now + windowMs };
    this.entries.set(key, entry);
    return { count: 1 };
  }
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Maximum requests allowed within the window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export class RateLimiter {
  constructor(
    private store: RateLimitStore,
    private config: RateLimitConfig,
  ) {}

  /** Returns true if the request is allowed, false if rate-limited. */
  async check(key: string): Promise<boolean> {
    const { count } = await this.store.increment(key, this.config.windowMs);
    return count <= this.config.max;
  }
}
