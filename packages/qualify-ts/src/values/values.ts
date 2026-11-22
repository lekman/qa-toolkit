import type { JsonObject, JsonValue } from "./types";

/** Thrown inside normalisation when a value refers back to itself. */
class CycleFound extends Error {}

const LIMIT = 2 ** 53;

const typeName = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "function") return "Function";
  if (typeof value === "symbol") return "Symbol";
  if (typeof value !== "object") return typeof value;
  const name = (value as { constructor?: { name?: unknown } }).constructor
    ?.name;
  return typeof name === "string" && name.length > 0 ? name : "Object";
};

const unserialisable = (value: unknown): string =>
  `[unserialisable: ${typeName(value)}]`;

const isBytes = (value: object): value is ArrayBuffer | ArrayBufferView =>
  value instanceof ArrayBuffer || ArrayBuffer.isView(value);

const toBase64 = (value: ArrayBuffer | ArrayBufferView): string => {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.from(bytes).toString("base64");
};

/**
 * Normalisation and comparison of values recorded as `expected` and `actual`,
 * as section 7.1 of the specification defines them.
 */
export class Values {
  /**
   * Compare two strings by Unicode code point, the order every language can
   * reproduce. JavaScript's default sort compares UTF-16 code units, which
   * differs for characters outside the Basic Multilingual Plane.
   */
  static compare(a: string, b: string): number {
    const left = [...a];
    const right = [...b];
    const length = Math.min(left.length, right.length);
    for (let i = 0; i < length; i++) {
      const x = (left[i] as string).codePointAt(0) as number;
      const y = (right[i] as string).codePointAt(0) as number;
      if (x !== y) return x < y ? -1 : 1;
    }
    return left.length - right.length;
  }

  /** Deep equality after normalisation. `NaN` equals itself here. */
  static equal(a: unknown, b: unknown): boolean {
    return Values.key(Values.normalise(a)) === Values.key(Values.normalise(b));
  }

  /**
   * A compact text form of a normalised value with sorted keys. Two values
   * are deep-equal exactly when their keys are equal.
   */
  static key(value: JsonValue): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => Values.key(item)).join(",")}]`;
    }
    const keys = Object.keys(value).sort(Values.compare);
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${Values.key(value[k] as JsonValue)}`)
      .join(",")}}`;
  }

  /**
   * The number of elements, characters or entries in a value, or `null` when
   * it has no length. A string's length counts Unicode code points.
   */
  static lengthOf(value: unknown): null | number {
    if (typeof value === "string") return [...value].length;
    if (Array.isArray(value)) return value.length;
    if (value instanceof Map || value instanceof Set) return value.size;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (
      value !== null &&
      typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      return Object.keys(value).length;
    }
    return null;
  }

  /**
   * Normalise a value for the evidence: sorted keys, bytes as `$bytes`,
   * instants as UTC timestamps, big and non-finite numbers as strings, and
   * values that cannot be serialised as `[unserialisable: <type>]`. A value
   * holding a cycle becomes one `[unserialisable: <type>]` string as a whole.
   */
  static normalise(value: unknown): JsonValue {
    try {
      return Values.walk(value, new Set());
    } catch (error) {
      if (error instanceof CycleFound) return unserialisable(value);
      throw error;
    }
  }

  /** Sort normalised values: numbers numerically, otherwise by key text. */
  static sort(values: JsonValue[]): JsonValue[] {
    const numeric = values.every((v) => typeof v === "number");
    const strings = values.every((v) => typeof v === "string");
    return [...values].sort((a, b) => {
      if (numeric) return (a as number) - (b as number);
      if (strings) return Values.compare(a as string, b as string);
      return Values.compare(Values.key(a), Values.key(b));
    });
  }

  private static number(value: number): number | string {
    if (Number.isNaN(value)) return "NaN";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
    if (Number.isInteger(value) && Math.abs(value) > LIMIT) {
      return BigInt(value).toString();
    }
    return Object.is(value, -0) ? 0 : value;
  }

  private static object(value: object, seen: Set<object>): JsonValue {
    if (seen.has(value)) throw new CycleFound();
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        return value.map((item) =>
          item === undefined ? null : Values.walk(item, seen),
        );
      }
      if (value instanceof Set) {
        return Values.sort([...value].map((item) => Values.walk(item, seen)));
      }
      if (value instanceof Map) {
        const result: JsonObject = {};
        for (const [k, v] of value) {
          const key =
            typeof k === "string" ? k : Values.key(Values.walk(k, seen));
          result[key] = v === undefined ? null : Values.walk(v, seen);
        }
        return result;
      }
      const toJSON = (value as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === "function") {
        return Values.walk((toJSON as () => unknown).call(value), seen);
      }
      const result: JsonObject = {};
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue;
        result[k] = Values.walk(v, seen);
      }
      return result;
    } finally {
      seen.delete(value);
    }
  }

  private static walk(value: unknown, seen: Set<object>): JsonValue {
    if (value === null || value === undefined) return null;
    switch (typeof value) {
      case "bigint":
        return value >= -BigInt(LIMIT) && value <= BigInt(LIMIT)
          ? Number(value)
          : value.toString();
      case "boolean":
      case "string":
        return value;
      case "number":
        return Values.number(value);
      case "function":
      case "symbol":
        return unserialisable(value);
    }
    const object = value as object;
    if (object instanceof Date) {
      return Number.isNaN(object.getTime())
        ? unserialisable(object)
        : object.toISOString();
    }
    if (isBytes(object)) return { $bytes: toBase64(object) };
    if (object instanceof RegExp) return object.toString();
    if (
      object instanceof WeakMap ||
      object instanceof WeakSet ||
      object instanceof Promise ||
      object instanceof Error
    ) {
      return unserialisable(object);
    }
    return Values.object(object, seen);
  }
}
