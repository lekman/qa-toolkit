import { describe, expect, test } from "bun:test";

import { Redaction } from "../../src/redaction";

// Secret-shaped samples are joined from parts so scanners do not flag them.
const PEM =
  "-----BEGIN RSA PRIVATE" +
  " KEY-----\nabc\ndef\n-----END RSA PRIVATE KEY-----";
const JWT = "eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
const KEY = "AS" + "IA" + "ABCDEFGHIJKLMNOP";

describe("Redaction.text", () => {
  test("pattern rules", () => {
    expect(Redaction.text(`a ${PEM} b ${JWT} c ${KEY} d`, [])).toBe(
      "a [REDACTED] b [REDACTED] c [REDACTED] d",
    );
  });

  test("a PEM block cut short is redacted to the end", () => {
    expect(Redaction.text("x -----BEGIN PRIVATE" + " KEY-----\nabc", [])).toBe(
      "x [REDACTED]",
    );
  });

  test("registered values, longest first", () => {
    expect(
      Redaction.text("token abcdef-123 and abcdef", ["abcdef", "abcdef-123"]),
    ).toBe("token [REDACTED] and [REDACTED]");
  });
});

describe("Redaction.value and json", () => {
  test("redacts strings and keys at every depth", () => {
    expect(
      Redaction.value({ "k secret1": ["v secret1", 1, null] }, ["secret1"]),
    ).toEqual({
      "k [REDACTED]": ["v [REDACTED]", 1, null],
    });
  });

  test("JSON documents replace values under sensitive keys, any case", () => {
    expect(
      Redaction.json(
        {
          Password: "p",
          nested: [
            {
              apiKey: { a: 1 },
              API_KEY: 2,
              privateKey: "k",
              note: "x s3cr3t!",
            },
          ],
          url: "/x",
        },
        ["s3cr3t!"],
      ),
    ).toEqual({
      Password: "[REDACTED]",
      nested: [
        {
          apiKey: "[REDACTED]",
          API_KEY: "[REDACTED]",
          privateKey: "[REDACTED]",
          note: "x [REDACTED]",
        },
      ],
      url: "/x",
    });
  });
});

describe("Redaction.bytes", () => {
  test("replaces the UTF-8 bytes of a value without touching the rest", () => {
    const secret = "sécret-1";
    const bytes = new Uint8Array([0, 255, ...Buffer.from(secret), 0]);
    expect([...Redaction.bytes(bytes, [secret])]).toEqual([
      0,
      255,
      ...Buffer.from("[REDACTED]"),
      0,
    ]);
  });

  test("applies pattern rules to bytes", () => {
    const bytes = new Uint8Array([0xfe, ...Buffer.from(KEY), 0xfe]);
    expect([...Redaction.bytes(bytes, [])]).toEqual([
      0xfe,
      ...Buffer.from("[REDACTED]"),
      0xfe,
    ]);
  });

  test("returns the same array when nothing matches", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(Redaction.bytes(bytes, ["absent-value"])).toBe(bytes);
  });
});
