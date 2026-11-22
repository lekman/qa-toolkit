import { describe, expect, test } from "bun:test";

import { Redaction } from "../../src/redaction";

// The section 7.2 rules as regular expressions. The scanners in
// src/redaction must replace exactly what these replace.
const REFERENCE: readonly RegExp[] = [
  new RegExp(
    "-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY-----" +
      "(?:[\\s\\S]*?-----END \\1PRIVATE KEY-----|[\\s\\S]*$)",
    "g",
  ),
  /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
];

const reference = (text: string): string =>
  REFERENCE.reduce((result, rule) => result.replace(rule, "[REDACTED]"), text);

// Pieces that build the edge cases: labels that contain PRIVATE, missing and
// mismatched footers, segments without dots, and access-key prefixes.
const PIECES = [
  "-----BEGIN ",
  "-----END ",
  "PRIVATE ",
  "KEY-----",
  "RSA ",
  "EC ",
  "PRIVATE KEY-----",
  "eyJ",
  "eyJhb",
  ".",
  "..",
  "abc",
  "A1",
  "-",
  "_",
  " ",
  "\n",
  "AK" + "IA",
  "AS" + "IA",
  "ABCDEFGHIJKLMNOP",
  "x",
];

// A fixed seed keeps the cases the same on every run.
const random = (() => {
  let state = 0x2545f491;
  return (limit: number): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % limit;
  };
})();

describe("Redaction.patterns matches the section 7.2 expressions", () => {
  test("on 20,000 generated texts", () => {
    for (let n = 0; n < 20_000; n++) {
      let text = "";
      const length = 1 + random(12);
      for (let i = 0; i < length; i++) text += PIECES[random(PIECES.length)];
      expect(Redaction.patterns(text)).toBe(reference(text));
    }
  });

  test("on the inputs that are slow for the expressions", () => {
    const pem =
      "-----BEGIN PRIVATE KEY-----" +
      "-----BEGIN PRIVATE KEY-----a".repeat(20_000);
    const jwt = "eyJ".repeat(100_000);
    const started = performance.now();
    expect(Redaction.patterns(pem)).toBe("[REDACTED]");
    expect(Redaction.patterns(jwt)).toBe(jwt);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
