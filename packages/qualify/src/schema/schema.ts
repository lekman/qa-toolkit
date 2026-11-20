import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";

import Ajv2020 from "ajv/dist/2020.js";

import evidenceSchema from "./evidence.schema.json" with { type: "json" };
import traceSchema from "./trace.schema.json" with { type: "json" };

let evidence: undefined | ValidateFunction;
let trace: undefined | ValidateFunction;

const compile = (schema: object): ValidateFunction => {
  // Strict mode logs instead of throwing: the schemas are valid draft
  // 2020-12, and ajv's strict checks flag the if/then/else and union types
  // they use on purpose.
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: "log",
    logger: false,
  });
  return ajv.compile(schema);
};

const describe = (errors: ErrorObject[] | null | undefined): string[] =>
  (errors ?? []).map(
    (e) =>
      `${e.instancePath.length > 0 ? e.instancePath : "/"} ${e.message ?? "is invalid"}`,
  );

/** Validation against the normative schemas in `spec/qualify/`. */
export class Schema {
  /** Problems with an evidence file, or an empty list when it is valid. */
  static evidence(data: unknown): string[] {
    evidence ??= compile(evidenceSchema);
    return evidence(data) ? [] : Schema.summarise(describe(evidence.errors));
  }

  /** Problems with a trace file, or an empty list when it is valid. */
  static trace(data: unknown): string[] {
    trace ??= compile(traceSchema);
    return trace(data) ? [] : Schema.summarise(describe(trace.errors));
  }

  /**
   * The schema's top level is a `oneOf` over three kinds, so ajv reports the
   * failures of every branch. Keep the distinct messages, at most ten.
   */
  private static summarise(messages: string[]): string[] {
    const unique = [...new Set(messages)];
    return unique.length > 10
      ? [...unique.slice(0, 10), `and ${unique.length - 10} more`]
      : unique;
  }
}
