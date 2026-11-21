import type { JsonShape, JsonValue } from "./types";

import { Values } from "./values";

const pad = (depth: number): string => "  ".repeat(depth);

const childShape = (shape: JsonShape, key: string): JsonShape =>
  typeof shape === "object" && "fields" in shape
    ? (shape.fields[key] ?? "value")
    : "value";

const keyOrder = (
  value: Record<string, unknown>,
  shape: JsonShape,
): string[] => {
  const present = Object.keys(value).filter((k) => value[k] !== undefined);
  if (typeof shape !== "object" || !("order" in shape)) {
    return present.sort(Values.compare);
  }
  const known = shape.order.filter((k) => present.includes(k));
  const rest = present
    .filter((k) => !shape.order.includes(k))
    .sort(Values.compare);
  return [...known, ...rest];
};

/**
 * Writes JSON the way every evidence file is written: UTF-8, two-space
 * indent, keys in the order a shape gives (schema order for the envelope) and
 * sorted by code point everywhere else. `JSON.stringify` cannot do this,
 * because JavaScript objects always list integer-like keys first.
 */
export class JsonText {
  /** A JSON document: the value, written with the shape, and a newline. */
  static document(value: unknown, shape: JsonShape = "value"): string {
    return `${JsonText.write(value, shape, 0)}\n`;
  }

  /** Write one value at an indent depth, without a trailing newline. */
  static write(value: unknown, shape: JsonShape, depth: number): string {
    if (value === null || value === undefined) return "null";
    if (typeof value === "number") {
      return Number.isFinite(value) ? JSON.stringify(value) : "null";
    }
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      const items =
        typeof shape === "object" && "items" in shape ? shape.items : "value";
      const lines = value.map(
        (item) => `${pad(depth + 1)}${JsonText.write(item, items, depth + 1)}`,
      );
      return `[\n${lines.join(",\n")}\n${pad(depth)}]`;
    }
    const record = value as Record<string, JsonValue | undefined>;
    const keys = keyOrder(record, shape);
    if (keys.length === 0) return "{}";
    const lines = keys.map(
      (key) =>
        `${pad(depth + 1)}${JSON.stringify(key)}: ${JsonText.write(record[key], childShape(shape, key), depth + 1)}`,
    );
    return `{\n${lines.join(",\n")}\n${pad(depth)}}`;
  }
}
