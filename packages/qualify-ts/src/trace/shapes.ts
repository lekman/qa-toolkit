import type { JsonShape } from "../values";

/** Key order of `trace.json`, as `trace.schema.json` lists its properties. */
export const TRACE_SHAPE: JsonShape = {
  order: [
    "schemaVersion",
    "kind",
    "inputs",
    "runs",
    "summary",
    "rows",
    "notRun",
    "requirementsWithoutPass",
  ],
  fields: {
    inputs: { items: { order: ["path", "role", "sha256"], fields: {} } },
    runs: {
      items: { order: ["id", "environment", "commit", "verdict"], fields: {} },
    },
    summary: {
      order: [
        "tests",
        "pass",
        "fail",
        "error",
        "skip",
        "notRun",
        "requirements",
        "requirementsWithoutPass",
        "verdict",
      ],
      fields: {},
    },
    rows: {
      items: {
        order: [
          "requirement",
          "sources",
          "testId",
          "level",
          "title",
          "risk",
          "controls",
          "outcome",
          "run",
          "environment",
        ],
        fields: {},
      },
    },
  },
};
