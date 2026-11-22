import { parse } from "yaml";

import type { Level, Risk } from "../declaration";
import type { ProtocolEntry } from "./types";

import { Declarations } from "../declaration";
import { TraceInputError } from "./errors";

const LEVELS = new Set(["IQ", "OQ", "PQ", "IU"]);
const RISKS = new Set(["high", "medium", "low"]);
const ENTRY_KEYS = new Set(["id", "level", "requirements", "risk", "title"]);

const read = (text: string, path: string): unknown => {
  try {
    return parse(text) as unknown;
  } catch (error) {
    throw new TraceInputError(
      `${path}: not valid YAML (${(error as Error).message})`,
    );
  }
};

const requirementList = (value: unknown, where: string): string[] => {
  const list = typeof value === "string" ? [value] : value;
  if (
    !Array.isArray(list) ||
    list.some((r) => typeof r !== "string" || r.length < 1 || r.length > 64)
  ) {
    throw new TraceInputError(
      `${where}: requirements must be requirement IDs of 1 to 64 characters`,
    );
  }
  if (new Set(list).size !== list.length) {
    throw new TraceInputError(`${where}: a requirement is listed twice`);
  }
  return list as string[];
};

/** Parsing of `protocol.yaml` and `trace.yaml`, the inputs of `trace`. */
export class TraceInputs {
  /**
   * `trace.yaml`: a mapping from test ID to one requirement ID or a list.
   *
   *   OQ-EXPORT-003: [EXPORT-004, EXPORT-005]
   */
  static map(text: string, path: string): Map<string, string[]> {
    const data = read(text, path);
    const result = new Map<string, string[]>();
    if (data === null || data === undefined) return result;
    if (typeof data !== "object" || Array.isArray(data)) {
      throw new TraceInputError(
        `${path}: must map test IDs to requirement IDs`,
      );
    }
    for (const [id, value] of Object.entries(data)) {
      if (!Declarations.isTestId(id)) {
        throw new TraceInputError(`${path}: ${id} is not a test ID`);
      }
      result.set(id, requirementList(value, `${path}: ${id}`));
    }
    return result;
  }

  /**
   * `protocol.yaml`: the tests that must run.
   *
   *   tests:
   *     - id: OQ-EXPORT-003
   *       title: The bank file never changes an amount
   *       level: OQ
   *       requirements: [EXPORT-003]
   *       risk: high
   */
  static protocol(text: string, path: string): ProtocolEntry[] {
    const data = read(text, path) as { tests?: unknown } | null;
    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !Array.isArray(data.tests)
    ) {
      throw new TraceInputError(`${path}: must have a "tests" list`);
    }
    const seen = new Set<string>();
    return data.tests.map((raw: unknown, index: number): ProtocolEntry => {
      const where = `${path}: tests[${index}]`;
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new TraceInputError(`${where}: must be a mapping`);
      }
      const entry = raw as Record<string, unknown>;
      for (const key of Object.keys(entry)) {
        if (!ENTRY_KEYS.has(key))
          throw new TraceInputError(`${where}: unknown field ${key}`);
      }
      const { id, level, title, risk } = entry;
      if (!Declarations.isTestId(id)) {
        throw new TraceInputError(`${where}: id must be a test ID`);
      }
      if (
        typeof level !== "string" ||
        !LEVELS.has(level) ||
        !id.startsWith(`${level}-`)
      ) {
        throw new TraceInputError(
          `${where}: level must be the prefix of ${id}`,
        );
      }
      if (typeof title !== "string" || title.trim().length === 0) {
        throw new TraceInputError(`${where}: title must not be empty`);
      }
      if (
        risk !== undefined &&
        (typeof risk !== "string" || !RISKS.has(risk))
      ) {
        throw new TraceInputError(`${where}: risk must be high, medium or low`);
      }
      if (seen.has(id))
        throw new TraceInputError(`${path}: ${id} is listed twice`);
      seen.add(id);
      const result: ProtocolEntry = {
        id,
        level: level as Level,
        title,
        requirements:
          entry.requirements === undefined
            ? []
            : requirementList(entry.requirements, where),
      };
      if (risk !== undefined) result.risk = risk as Risk;
      return result;
    });
  }
}
