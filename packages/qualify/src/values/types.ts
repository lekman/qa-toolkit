/** A JSON value after normalisation: what the evidence files hold. */
export type JsonValue =
  boolean | JsonArray | JsonObject | null | number | string;

/** A JSON array of normalised values. */
export type JsonArray = JsonValue[];

/** A JSON object of normalised values. Keys are sorted when written. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * How to order an object's keys when it is written. `"value"` sorts keys by
 * code point at every depth. An object shape lists its keys in order and the
 * shape of each field; an array shape gives the shape of its items.
 */
export type JsonShape =
  | "value"
  | { fields: Readonly<Record<string, JsonShape>>; order: readonly string[] }
  | { items: JsonShape };
