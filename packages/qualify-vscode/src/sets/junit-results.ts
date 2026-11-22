import type { JunitCase } from "@lekman/test-sets";

import { relative } from "node:path";

import type { TestRecord } from "../results";
import type { ResolvedTest } from "../workspace";

/** A path without its extension, with `/`, and without a leading `./`. */
const stem = (path: string): string =>
  path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\.[^./]+$/, "");

/** Whether a case's name is the test's name, alone or after its describe blocks. */
const sameName = (name: string, title: string): boolean => {
  if (name === title) return true;
  if (!name.endsWith(title)) return false;
  const before = name[name.length - title.length - 1] ?? "";
  return /[\s>›:/.]/.test(before);
};

/** Turns the cases of a JUnit XML report into records for the tests that ran. */
export class JunitResults {
  /**
   * Whether a JUnit case is a test: the same name, and the same file when
   * the case names one, in its `file` attribute or else its suite or class
   * (`tests.test_a` or `acme.BankFileTest` read as a path).
   */
  static matches(c: JunitCase, test: ResolvedTest): boolean {
    if (
      !sameName(c.name, test.declaration.title) &&
      !sameName(c.name, test.declaration.id.split("#").pop() ?? "")
    ) {
      return false;
    }
    const file = stem(relative(test.package.root, test.declaration.file));
    const named =
      c.file !== undefined && c.file.length > 0
        ? [c.file]
        : [c.suite, c.classname];
    const candidates = named
      .filter((v): v is string => v !== undefined && v.length > 0)
      .map((v) => (/[/\\]/.test(v) ? stem(v) : v.replace(/\./g, "/")));
    if (candidates.length === 0) return true;
    return candidates.some((k) => file.endsWith(k) || k.endsWith(file));
  }

  /** One record per case that matches a test, with the test's ID. */
  static records(
    cases: readonly JunitCase[],
    tests: readonly ResolvedTest[],
    runId: string,
    path: string,
    endedAt: string,
  ): TestRecord[] {
    return cases.flatMap((c) =>
      tests
        .filter((t) => JunitResults.matches(c, t))
        .map((t): TestRecord => ({
          checks: [],
          endedAt,
          id: t.declaration.id,
          outcome: c.outcome,
          path,
          runId,
          ...(c.time === undefined
            ? {}
            : { durationMs: Math.round(c.time * 1000) }),
          ...(c.outcome === "fail" || c.outcome === "error"
            ? {
                error: {
                  message: c.message ?? "",
                  site: null,
                  type: c.outcome === "fail" ? "Failure" : "Error",
                },
              }
            : {}),
          ...(c.outcome === "skip"
            ? { skipReason: c.message ?? "skipped by the runner" }
            : {}),
        })),
    );
  }
}
