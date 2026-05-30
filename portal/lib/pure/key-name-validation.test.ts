import { describe, it, expect } from "vitest";
import { KEY_NAME_MAX_LENGTH, validateKeyName } from "./key-name-validation";

describe("validateKeyName", () => {
  it("accepts valid names", () => {
    expect(validateKeyName("my-key", [])).toBeNull();
    expect(validateKeyName("agent-bold-crane", [])).toBeNull();
    expect(validateKeyName("Key 1", [])).toBeNull();
    expect(validateKeyName("key_with_underscores", [])).toBeNull();
    expect(validateKeyName("a", [])).toBeNull();
    expect(validateKeyName("1-starts-with-number", [])).toBeNull();
  });

  it("rejects empty or whitespace-only names", () => {
    expect(validateKeyName("", [])).toBe("Key name is required.");
    expect(validateKeyName("   ", [])).toBe("Key name is required.");
  });

  it("rejects names exceeding max length", () => {
    const long = "a".repeat(KEY_NAME_MAX_LENGTH + 1);
    expect(validateKeyName(long, [])).toBe(`Max ${KEY_NAME_MAX_LENGTH} characters.`);
  });

  it("accepts names at exactly max length", () => {
    const exact = "a".repeat(KEY_NAME_MAX_LENGTH);
    expect(validateKeyName(exact, [])).toBeNull();
  });

  it("rejects names with invalid characters", () => {
    const msg = "Only letters, numbers, spaces, hyphens, and underscores. Must start with a letter or number.";
    expect(validateKeyName("my@key", [])).toBe(msg);
    expect(validateKeyName("key!", [])).toBe(msg);
    expect(validateKeyName("key/name", [])).toBe(msg);
    expect(validateKeyName("key.name", [])).toBe(msg);
  });

  it("rejects names starting with special characters", () => {
    const msg = "Only letters, numbers, spaces, hyphens, and underscores. Must start with a letter or number.";
    expect(validateKeyName("-starts-with-dash", [])).toBe(msg);
    expect(validateKeyName("_starts-with-underscore", [])).toBe(msg);
  });

  it("trims leading space so name starting with letter is valid", () => {
    expect(validateKeyName(" starts-with-space", [])).toBeNull();
  });

  it("detects duplicate names case-insensitively", () => {
    const existing = ["agent-bold-crane", "My Key"];
    expect(validateKeyName("agent-bold-crane", existing)).toBe("A key with this name already exists.");
    expect(validateKeyName("Agent-Bold-Crane", existing)).toBe("A key with this name already exists.");
    expect(validateKeyName("MY KEY", existing)).toBe("A key with this name already exists.");
  });

  it("allows names that don't match existing keys", () => {
    expect(validateKeyName("new-key", ["existing-key"])).toBeNull();
  });

  it("trims whitespace before validating", () => {
    expect(validateKeyName("  agent-bold-crane  ", ["agent-bold-crane"])).toBe("A key with this name already exists.");
  });
});
