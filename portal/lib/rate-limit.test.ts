import { describe, it, expect } from "vitest";
import { RateLimiter, MemoryRateLimitStore } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows requests within the limit", async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore(), { max: 3, windowMs: 60_000 });
    expect(await limiter.check("a")).toBe(true);
    expect(await limiter.check("a")).toBe(true);
    expect(await limiter.check("a")).toBe(true);
  });

  it("blocks requests exceeding the limit", async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore(), { max: 2, windowMs: 60_000 });
    expect(await limiter.check("a")).toBe(true);
    expect(await limiter.check("a")).toBe(true);
    expect(await limiter.check("a")).toBe(false);
  });

  it("tracks keys independently", async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore(), { max: 1, windowMs: 60_000 });
    expect(await limiter.check("a")).toBe(true);
    expect(await limiter.check("b")).toBe(true);
    expect(await limiter.check("a")).toBe(false);
  });

  it("resets after the window expires", async () => {
    const store = new MemoryRateLimitStore();
    const limiter = new RateLimiter(store, { max: 1, windowMs: 10 });
    expect(await limiter.check("a")).toBe(true);
    expect(await limiter.check("a")).toBe(false);
    await new Promise((r) => setTimeout(r, 15));
    expect(await limiter.check("a")).toBe(true);
  });
});
