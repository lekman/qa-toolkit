import type { JsonShape } from "../values";

const object = (
  order: readonly string[],
  fields: Record<string, JsonShape> = {},
): JsonShape => ({ order, fields });

const DECLARATION = [
  "id",
  "level",
  "title",
  "given",
  "when",
  "then",
  "and",
  "scope",
  "requirements",
  "risk",
  "tags",
  "controls",
  "site",
];

const RUN = object(
  [
    "id",
    "environment",
    "tool",
    "source",
    "actor",
    "target",
    "policy",
    "selection",
    "startedAt",
    "endedAt",
    "mergedRuns",
  ],
  {
    tool: object(["name", "version", "language", "runtime"]),
    source: object(["commit", "branch", "dirty"]),
    actor: object(["name", "ci", "ciRunUrl"]),
    policy: object(["productionWriteBlocked", "overrides"], {
      overrides: { items: object(["id", "reason"]) },
    }),
    selection: object(["levels", "ids", "tags", "excludeTags"]),
  },
);

const CHECK = object([
  "seq",
  "context",
  "description",
  "matcher",
  "expected",
  "actual",
  "pass",
  "soft",
  "site",
  "delegate",
  "at",
]);

const TEST = object(
  [
    ...DECLARATION,
    "outcome",
    "skipReason",
    "error",
    "startedAt",
    "endedAt",
    "durationMs",
    "checks",
    "attachments",
    "secretsUsed",
  ],
  {
    error: object(["type", "message", "site"]),
    checks: { items: CHECK },
    attachments: {
      items: object([
        "filename",
        "contentType",
        "encoding",
        "content",
        "sizeBytes",
        "sha256",
      ]),
    },
  },
);

const COUNTER = object(["found", "hit", "percent"]);

const COUNTS = { lines: COUNTER, functions: COUNTER, branches: COUNTER };

const CASE = object(
  [
    "level",
    "id",
    "suite",
    "classname",
    "name",
    "file",
    "outcome",
    "skipReason",
    "error",
    "durationMs",
  ],
  { error: object(["type", "message", "detail"]) },
);

const COVERAGE = object(["totals", "files"], {
  totals: object(["lines", "functions", "branches"], COUNTS),
  files: {
    items: object(["path", "lines", "functions", "branches"], COUNTS),
  },
});

/**
 * Key order of every evidence file: the order properties appear in
 * `evidence.schema.json`. Values inside `expected`, `actual` and `target`
 * have no shape, so their keys are sorted.
 */
export const EVIDENCE_SHAPE: JsonShape = object(
  [
    "schemaVersion",
    "kind",
    "run",
    "summary",
    "tests",
    "imported",
    "cases",
    "coverage",
    "test",
  ],
  {
    run: RUN,
    summary: object(["total", "pass", "fail", "error", "skip", "verdict"]),
    tests: { items: TEST },
    imported: { items: object(["kind", "path", "sha256"]) },
    cases: { items: CASE },
    coverage: COVERAGE,
    test: TEST,
  },
);
