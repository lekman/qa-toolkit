import { relative } from "node:path";

import type { Declaration } from "./types";

import { Levels, TestIds } from "../levels";

const RISKS: readonly string[] = ["high", "low", "medium"];
const SCOPES: readonly string[] = ["read", "read-write"];

/**
 * The declaration rules of section 2.1 of the qualify specification that can
 * be checked without running a test.
 */
export class DeclarationRules {
  /**
   * The declaration with every problem the rules find added, and its tags
   * sorted without duplicates. `fields` names the fields the declaration
   * sets, lower-cased; leave it out when they cannot be read from the
   * source, and the rules on missing fields are not applied.
   */
  static check(
    declaration: Declaration,
    fields?: ReadonlySet<string>,
  ): Declaration {
    const d = declaration;
    const problems = [...d.problems];
    if (Levels.isQualification(d.level)) {
      problems.push(...TestIds.problems(d.id, d.level));
    }
    if (d.title.trim().length === 0) problems.push("the title is empty");
    if (d.risk !== undefined && !RISKS.includes(d.risk)) {
      problems.push(`risk ${d.risk} is not high, medium or low`);
    }
    if (d.scope !== undefined && !SCOPES.includes(d.scope)) {
      problems.push(`scope ${d.scope} is not read or read-write`);
    }
    if (fields !== undefined) {
      for (const field of ["given", "when", "then"]) {
        if (!fields.has(field)) problems.push(`${field} is missing`);
      }
    }
    if (d.level === "OQ" || d.level === "PQ") {
      if (fields !== undefined && !fields.has("scope")) {
        problems.push(
          `scope is missing: an ${d.level} test declares read or read-write`,
        );
      }
    } else if (
      (d.level === "IQ" || d.level === "IU") &&
      fields?.has("scope") === true
    ) {
      problems.push(
        `an ${d.level} test does not declare a scope: IQ is always read and IU always read-write`,
      );
    }
    return {
      ...d,
      problems,
      tags: [...new Set(d.tags)].sort(),
    };
  }

  /**
   * The declarations with a problem added to each one whose ID another
   * declaration also uses, because one ID must map to one record. The other
   * places are named relative to `base` when it is given.
   */
  static duplicates(
    declarations: readonly Declaration[],
    base?: string,
  ): Declaration[] {
    const name = (file: string): string =>
      base === undefined ? file : relative(base, file).split("\\").join("/");
    const byId = new Map<string, Declaration[]>();
    for (const d of declarations) {
      byId.set(d.id, [...(byId.get(d.id) ?? []), d]);
    }
    return declarations.map((d) => {
      const others = (byId.get(d.id) ?? []).filter((o) => o !== d);
      if (others.length === 0) return d;
      const where = others.map((o) => `${name(o.file)}:${o.line}`).join(", ");
      return {
        ...d,
        problems: [
          ...d.problems,
          `the ID ${d.id} is also declared at ${where}`,
        ],
      };
    });
  }
}
