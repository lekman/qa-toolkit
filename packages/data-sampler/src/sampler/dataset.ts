import type { DatasetDefinition, FieldSpec } from "./types";

import { Spread } from "../grade/spread";
import { DatasetError, SpreadError } from "./errors";

/** Validates dataset definitions. */
export class Dataset {
  /**
   * Validates and returns a frozen copy of the definition. Throws
   * DatasetError on: empty or duplicate grades, a grade named "default",
   * spread keys outside the scale, weights that do not sum to 1, or any field
   * with no generator for some grade and no default.
   */
  static define<T>(definition: DatasetDefinition<T>): DatasetDefinition<T> {
    const { fields, grades, name } = definition;
    if (typeof name !== "string" || name.trim() === "") {
      throw new DatasetError("dataset name must be a non-empty string");
    }
    if (!Array.isArray(grades) || grades.length === 0) {
      throw new DatasetError(`dataset "${name}" has no grades`);
    }
    if (new Set(grades).size !== grades.length) {
      throw new DatasetError(`dataset "${name}" lists a grade twice: [${grades.join(", ")}]`);
    }
    if (grades.includes("default")) {
      throw new DatasetError(`dataset "${name}": a grade may not be named "default"`);
    }
    let spread;
    try {
      spread = Spread.validate(definition.spread, grades);
    } catch (error) {
      if (error instanceof SpreadError) {
        throw new DatasetError(`dataset "${name}": ${error.message}`);
      }
      throw error;
    }
    if (fields === null || typeof fields !== "object") {
      throw new DatasetError(`dataset "${name}" has no fields`);
    }
    const frozenFields: Record<string, FieldSpec<T, unknown>> = {};
    for (const [key, spec] of Object.entries(fields) as [string, FieldSpec<T, unknown>][]) {
      if (spec === null || typeof spec !== "object") {
        throw new DatasetError(`dataset "${name}": field "${key}" has no generators`);
      }
      for (const grade of grades) {
        const generator = spec[grade] ?? spec.default;
        if (typeof generator !== "function") {
          throw new DatasetError(
            `dataset "${name}": field "${key}" has no generator for grade "${grade}" and no default`,
          );
        }
      }
      frozenFields[key] = Object.freeze({ ...spec });
    }
    return Object.freeze({
      fields: Object.freeze(frozenFields) as DatasetDefinition<T>["fields"],
      grades: Object.freeze([...grades]),
      name,
      spread,
    });
  }
}

/** Convenience alias for `Dataset.define`. */
export const defineDataset = Dataset.define;
