import type { JsonObject, JsonValue } from "../values";

const REPLACEMENT = "[REDACTED]";

/**
 * Pattern rules from section 7.2. The PEM and JWT rules are written as
 * scanners, not regular expressions, so their cost grows with the length of
 * the text and not with its square. Each returns the same matches as the
 * expression in its comment would with a global `replace`.
 */

const BEGIN = "-----BEGIN ";
const KEY_TAIL = "PRIVATE KEY-----";

const isLabelChar = (code: number): boolean =>
  (code >= 65 && code <= 90) || (code >= 48 && code <= 57);

const isBase64UrlChar = (code: number): boolean =>
  (code >= 65 && code <= 90) ||
  (code >= 97 && code <= 122) ||
  (code >= 48 && code <= 57) ||
  code === 95 ||
  code === 45;

const runEnd = (
  text: string,
  from: number,
  accepts: (code: number) => boolean,
): number => {
  let end = from;
  while (end < text.length && accepts(text.charCodeAt(end))) end++;
  return end;
};

type Range = readonly [start: number, end: number];

/**
 * `-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY-----(?:[\s\S]*?-----END \1PRIVATE KEY-----|[\s\S]*$)`:
 * a PEM private key block, to the matching END line or, when the block is
 * cut short, to the end of the text.
 */
const pemBlocks = (text: string): Range[] => {
  const ranges: Range[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf(BEGIN, from);
    if (start < 0) return ranges;
    const labelStart = start + BEGIN.length;
    // Each `[A-Z0-9]+ ` word may end the label. The expression takes the
    // longest label that is followed by PRIVATE KEY-----.
    const wordEnds = [labelStart];
    for (let at = labelStart; ;) {
      const end = runEnd(text, at, isLabelChar);
      if (end === at || text.charCodeAt(end) !== 32) break;
      at = end + 1;
      wordEnds.push(at);
    }
    let labelEnd = -1;
    for (let i = wordEnds.length - 1; i >= 0; i--) {
      if (text.startsWith(KEY_TAIL, wordEnds[i])) {
        labelEnd = wordEnds[i] as number;
        break;
      }
    }
    if (labelEnd < 0) {
      from = start + 1;
      continue;
    }
    const footer = `-----END ${text.slice(labelStart, labelEnd)}${KEY_TAIL}`;
    const footerAt = text.indexOf(footer, labelEnd + KEY_TAIL.length);
    const end = footerAt < 0 ? text.length : footerAt + footer.length;
    ranges.push([start, end]);
    from = end;
  }
};

/**
 * `eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`: a JWT shape, three
 * base64url segments with the first starting with eyJ. The segments cannot
 * hold a dot, so every start inside one first segment ends that segment at
 * the same place and fails the same way. A failed start skips to that place.
 */
const jwtShapes = (text: string): Range[] => {
  const ranges: Range[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf("eyJ", from);
    if (start < 0) return ranges;
    const first = runEnd(text, start + 3, isBase64UrlChar);
    const second =
      text.charCodeAt(first) === 46
        ? runEnd(text, first + 1, isBase64UrlChar)
        : -1;
    const third =
      second > first + 1 && text.charCodeAt(second) === 46
        ? runEnd(text, second + 1, isBase64UrlChar)
        : -1;
    if (third > second + 1) {
      ranges.push([start, third]);
      from = third;
    } else {
      from = first;
    }
  }
};

/** `(?:AKIA|ASIA)[A-Z0-9]{16}`: an access-key-ID shape. */
const ACCESS_KEY_ID = /(?:AKIA|ASIA)[A-Z0-9]{16}/g;

const replaceRanges = (text: string, ranges: readonly Range[]): string => {
  if (ranges.length === 0) return text;
  let result = "";
  let at = 0;
  for (const [start, end] of ranges) {
    result += text.slice(at, start) + REPLACEMENT;
    at = end;
  }
  return result + text.slice(at);
};

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
    const withoutKeys = replaceRanges(text, pemBlocks(text));
    const withoutTokens = replaceRanges(withoutKeys, jwtShapes(withoutKeys));
    return withoutTokens.replace(ACCESS_KEY_ID, REPLACEMENT);
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
