import type {
  Declaration,
  DeclaredTest,
  Level,
  Narrative,
  Risk,
  Scope,
} from "./types";

import { Values } from "../values";
import { DeclarationError } from "./errors";

const ID_PATTERN = /^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$/;
const LEVELS: readonly Level[] = ["IQ", "OQ", "PQ", "IU"];
const SCOPES: readonly Scope[] = ["read", "read-write"];
const RISKS: readonly Risk[] = ["high", "medium", "low"];
const FIELDS = new Set([
  "and",
  "controls",
  "given",
  "requirements",
  "risk",
  "scope",
  "tags",
  "then",
  "timeoutMs",
  "when",
]);

const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Validation of test declarations, sections 2.1 and 4 of the specification. */
export class Declarations {
  /** The ID pattern every test ID must match. */
  static readonly ID_PATTERN = ID_PATTERN;

  /** The name the adapter registers a test under: `[<ID>] <title>`. */
  static displayName(id: unknown, title: unknown): string {
    return `[${String(id)}] ${String(title)}`;
  }

  /** Whether a string is a valid test ID for any level. */
  static isTestId(value: unknown): value is string {
    return typeof value === "string" && ID_PATTERN.test(value);
  }

  /**
   * Validate a declaration. Every problem is collected into one
   * `DeclarationError`, so a test author sees them all at once.
   */
  static validate(
    level: Level,
    id: unknown,
    title: unknown,
    narrative: unknown,
    site: string,
  ): DeclaredTest {
    const problems: string[] = [];
    const shownId = typeof id === "string" ? id : String(id);

    if (!LEVELS.includes(level))
      problems.push(`unknown level ${String(level)}`);
    if (typeof id !== "string" || !ID_PATTERN.test(id)) {
      problems.push(
        `ID does not match the pattern ${ID_PATTERN.source}, for example OQ-EXPORT-003`,
      );
    } else if (!id.startsWith(`${level}-`)) {
      problems.push(
        `ID prefix ${id.slice(0, 2)} does not match the declared level ${level}`,
      );
    }
    if (!text(title)) problems.push("title must not be empty");
    else if (/[\r\n]/.test(title)) problems.push("title must be one line");

    if (narrative === null || typeof narrative !== "object") {
      problems.push("the narrative (given, when, then) is missing");
      throw new DeclarationError(shownId, problems);
    }
    const fields = narrative as Partial<Record<keyof Narrative, unknown>>;
    for (const key of Object.keys(fields)) {
      if (!FIELDS.has(key)) problems.push(`unknown field ${key}`);
    }
    for (const key of ["given", "when", "then"] as const) {
      if (!text(fields[key])) problems.push(`${key} must not be empty`);
    }
    if (fields.and !== undefined) {
      if (!stringList(fields.and) || fields.and.some((c) => !text(c))) {
        problems.push("and must be a list of clauses, each not empty");
      }
    }

    const scope = Declarations.scope(level, fields.scope, problems);
    const requirements = Declarations.requirements(
      fields.requirements,
      problems,
    );
    if (fields.risk !== undefined && !RISKS.includes(fields.risk as Risk)) {
      problems.push("risk must be high, medium or low");
    }
    const tags = Declarations.tags(fields.tags, problems);
    if (
      fields.controls !== undefined &&
      !Declarations.isTestId(fields.controls)
    ) {
      problems.push("controls must be the ID of another qualification test");
    } else if (fields.controls !== undefined && fields.controls === id) {
      problems.push("a test cannot be the control for itself");
    }
    if (
      fields.timeoutMs !== undefined &&
      (typeof fields.timeoutMs !== "number" ||
        !Number.isFinite(fields.timeoutMs) ||
        fields.timeoutMs <= 0)
    ) {
      problems.push("timeoutMs must be a positive number");
    }

    if (problems.length > 0) throw new DeclarationError(shownId, problems);

    const declaration: Declaration = {
      id: id as string,
      level,
      title: title as string,
      given: fields.given as string,
      when: fields.when as string,
      then: fields.then as string,
      scope: scope as Scope,
      requirements,
      tags,
      site,
    };
    if (fields.and !== undefined)
      declaration.and = [...(fields.and as string[])];
    if (fields.risk !== undefined) declaration.risk = fields.risk as Risk;
    if (fields.controls !== undefined) {
      declaration.controls = fields.controls as string;
    }
    const result: DeclaredTest = { declaration };
    if (fields.timeoutMs !== undefined) {
      result.timeoutMs = fields.timeoutMs as number;
    }
    return result;
  }

  private static requirements(value: unknown, problems: string[]): string[] {
    if (value === undefined) return [];
    if (!stringList(value)) {
      problems.push("requirements must be a list of requirement IDs");
      return [];
    }
    const bad = value.filter((r) => r.length < 1 || r.length > 64);
    if (bad.length > 0) {
      problems.push("each requirement ID must be 1 to 64 characters");
    }
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const r of value) {
      if (seen.has(r)) duplicates.add(r);
      seen.add(r);
    }
    if (duplicates.size > 0) {
      problems.push(
        `requirements are duplicated: ${[...duplicates].join(", ")}`,
      );
    }
    return [...value];
  }

  private static scope(
    level: Level,
    value: unknown,
    problems: string[],
  ): Scope | undefined {
    if (level === "IQ" || level === "IU") {
      if (value !== undefined) {
        problems.push(
          `scope must not be declared for ${level} tests, which are always ${level === "IQ" ? "read" : "read-write"}`,
        );
      }
      return level === "IQ" ? "read" : "read-write";
    }
    if (value === undefined) {
      problems.push(
        `scope is required for ${level} tests (read or read-write)`,
      );
      return undefined;
    }
    if (!SCOPES.includes(value as Scope)) {
      problems.push("scope must be read or read-write");
      return undefined;
    }
    return value as Scope;
  }

  private static tags(value: unknown, problems: string[]): string[] {
    if (value === undefined) return [];
    if (!stringList(value) || value.some((t) => t.length === 0)) {
      problems.push("tags must be a list of strings, each not empty");
      return [];
    }
    return [...new Set(value)].sort(Values.compare);
  }
}
