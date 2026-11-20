import type { JsonObject, JsonValue } from "../values";

const REPLACEMENT = "[REDACTED]";

/**
 * Pattern rules from section 7.2, applied without registration. Each regular
 * expression is global and stateless between calls because `replace` resets
 * `lastIndex`.
 */
const PATTERNS: readonly RegExp[] = [
  // A PEM private key block, to the matching END line or, when the block is
  // cut short, to the end of the text.
  /-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY-----(?:[\s\S]*?-----END \1PRIVATE KEY-----|[\s\S]*$)/g,
  // A JWT shape: three base64url segments, the first starting with eyJ.
  /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // An access-key-ID shape.
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
];

const SENSITIVE_KEYS = new Set([
  "api_key",
  "apikey",
  "authorization",
  "passwd",
  "password",
  "privatekey",
  "secret",
  "token",
]);

const latin1 = (bytes: Uint8Array): string =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    "latin1",
  );

const byLengthDescending = (values: readonly string[]): string[] =>
  [...new Set(values)].sort((a, b) => b.length - a.length);

/**
 * Redaction as section 7.2 defines it. Pure functions: the caller holds the
 * list of registered values and passes it in.
 */
export class Redaction {
  /** Values shorter than this are refused, because they would redact words. */
  static readonly MIN_LENGTH = 6;
  /** The text every redacted value is replaced with. */
  static readonly REPLACEMENT = REPLACEMENT;

  /**
   * Redact bytes without decoding them as text. Registered values are matched
   * as their UTF-8 bytes, and pattern rules as ASCII, so the bytes around a
   * match are never changed.
   */
  static bytes(bytes: Uint8Array, registered: readonly string[]): Uint8Array {
    let view = latin1(bytes);
    const before = view;
    for (const value of byLengthDescending(registered)) {
      view = view.split(latin1(Buffer.from(value, "utf8"))).join(REPLACEMENT);
    }
    view = Redaction.patterns(view);
    if (view === before) return bytes;
    return new Uint8Array(Buffer.from(view, "latin1"));
  }

  /**
   * Redact a JSON document: values under sensitive keys (compared without
   * case) become `[REDACTED]`, then every string and key is redacted as text.
   */
  static json(value: JsonValue, registered: readonly string[]): JsonValue {
    if (Array.isArray(value)) {
      return value.map((item) => Redaction.json(item, registered));
    }
    if (value !== null && typeof value === "object") {
      const result: JsonObject = {};
      for (const [key, item] of Object.entries(value)) {
        result[Redaction.text(key, registered)] = SENSITIVE_KEYS.has(
          key.toLowerCase(),
        )
          ? REPLACEMENT
          : Redaction.json(item, registered);
      }
      return result;
    }
    return Redaction.value(value, registered);
  }

  /** Apply the pattern rules only. */
  static patterns(text: string): string {
    let result = text;
    for (const pattern of PATTERNS)
      result = result.replace(pattern, REPLACEMENT);
    return result;
  }

  /** Redact one string: registered values first, longest first, then patterns. */
  static text(text: string, registered: readonly string[]): string {
    let result = text;
    for (const value of byLengthDescending(registered)) {
      result = result.split(value).join(REPLACEMENT);
    }
    return Redaction.patterns(result);
  }

  /** Redact every string and key inside a JSON value. */
  static value(value: JsonValue, registered: readonly string[]): JsonValue {
    if (typeof value === "string") return Redaction.text(value, registered);
    if (Array.isArray(value)) {
      return value.map((item) => Redaction.value(item, registered));
    }
    if (value !== null && typeof value === "object") {
      const result: JsonObject = {};
      for (const [key, item] of Object.entries(value)) {
        result[Redaction.text(key, registered)] = Redaction.value(
          item,
          registered,
        );
      }
      return result;
    }
    return value;
  }
}
