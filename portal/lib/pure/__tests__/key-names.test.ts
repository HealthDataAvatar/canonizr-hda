import { describe, it, expect } from "vitest";
import { generateKeyName } from "@/lib/pure/key-names";

describe("generateKeyName", () => {
  it("starts with 'agent-'", () => {
    const name = generateKeyName();
    expect(name.startsWith("agent-")).toBe(true);
  });

  it("has three parts separated by hyphens", () => {
    const name = generateKeyName();
    const parts = name.split("-");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("agent");
  });

  it("is all lowercase", () => {
    const name = generateKeyName();
    expect(name).toBe(name.toLowerCase());
  });

  it("generates different names on successive calls", () => {
    const names = new Set<string>();
    for (let i = 0; i < 20; i++) {
      names.add(generateKeyName());
    }
    // With large dictionaries, 20 calls should produce at least 15 unique names
    expect(names.size).toBeGreaterThanOrEqual(15);
  });

  it("contains only alphanumeric characters and hyphens", () => {
    for (let i = 0; i < 10; i++) {
      const name = generateKeyName();
      expect(name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("has a reasonable length", () => {
    const name = generateKeyName();
    expect(name.length).toBeGreaterThan(10);
    expect(name.length).toBeLessThan(50);
  });
});
