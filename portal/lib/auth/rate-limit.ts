/** In-memory sliding-window rate limiter. */

export class RateLimitError extends Error {
  constructor(message = "Too many requests. Please try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export interface RateLimitConfig {
  /** Maximum requests allowed within the window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

interface Entry {
  count: number;
  expiresAt: number;
}

export class RateLimiter {
  private entries = new Map<string, Entry>();

  constructor(private config: RateLimitConfig) {}

  /** Returns true if the request is allowed, false if rate-limited. */
  async check(key: string): Promise<boolean> {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (existing && existing.expiresAt > now) {
      existing.count++;
      return existing.count <= this.config.max;
    }

    this.entries.set(key, { count: 1, expiresAt: now + this.config.windowMs });
    return 1 <= this.config.max;
  }
}
