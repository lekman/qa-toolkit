import { describe, expect, test } from "bun:test";

import { RunIds } from "../../src";

describe("RunIds", () => {
  test("a ULID: 26 Crockford characters, time first", () => {
    const id = RunIds.create(
      Date.UTC(2026, 10, 22),
      new Uint8Array(16).fill(31),
    );
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(id.endsWith("Z".repeat(16))).toBe(true);
    expect(RunIds.create(0, new Uint8Array(0))).toBe("0".repeat(26));
  });
});
