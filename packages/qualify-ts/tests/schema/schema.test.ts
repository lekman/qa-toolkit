import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EVIDENCE_SHAPE } from "../../src/evidence";
import { Schema } from "../../src/schema";
import { TRACE_SHAPE } from "../../src/trace";
import { envelope, recordEntry, testRecord } from "../mocks/evidence.mock";

const SPEC = join(import.meta.dir, "../../../../spec/qualify");
const SRC = join(import.meta.dir, "../../src/schema");

type SchemaNode = {
  $defs: Record<string, SchemaNode>;
  allOf?: SchemaNode[];
  properties?: Record<string, SchemaNode>;
};
type ShapeNode = {
  fields: Record<string, ShapeNode>;
  items?: ShapeNode;
  order: string[];
};

const props = (node: SchemaNode | undefined): string[] => [
  ...Object.keys(node?.properties ?? {}),
  ...(node?.allOf ?? []).flatMap((part) => props(part)),
];

describe("Schema copies", () => {
  test.each([
    "evidence.schema.json",
    "trace.schema.json",
    "report-theme.schema.json",
  ])("%s matches spec/qualify byte for byte", (name) => {
    expect(readFileSync(join(SRC, name), "utf8")).toBe(
      readFileSync(join(SPEC, name), "utf8"),
    );
  });
});

describe("Key order follows the schema", () => {
  const schema = JSON.parse(
    readFileSync(join(SPEC, "evidence.schema.json"), "utf8"),
  ) as SchemaNode;
  const defs = schema.$defs;
  const shape = EVIDENCE_SHAPE as unknown as ShapeNode;
  const run = shape.fields.run as ShapeNode;
  const test_ = shape.fields.test as ShapeNode;

  test("test records", () => {
    expect(test_.order).toEqual([
      ...props(defs.declaration),
      ...props((defs.testRecord?.allOf ?? [])[1]),
    ]);
  });

  test("the run envelope and its parts", () => {
    expect(run.order).toEqual([
      ...props(defs.runInfo),
      ...props((defs.runFile?.properties?.run?.allOf ?? [])[1]),
    ]);
    for (const name of ["tool", "source", "actor", "policy", "selection"]) {
      expect((run.fields[name] as ShapeNode).order).toEqual(props(defs[name]));
    }
  });

  test("checks, attachments, failures and the summary", () => {
    expect(
      ((test_.fields.checks as ShapeNode).items as ShapeNode).order,
    ).toEqual(props(defs.check));
    expect(
      ((test_.fields.attachments as ShapeNode).items as ShapeNode).order,
    ).toEqual(props(defs.attachment));
    expect((test_.fields.error as ShapeNode).order).toEqual(
      props(defs.failure),
    );
    expect((shape.fields.summary as ShapeNode).order).toEqual(
      props(defs.runFile?.properties?.summary),
    );
  });

  test("trace.json", () => {
    const trace = JSON.parse(
      readFileSync(join(SPEC, "trace.schema.json"), "utf8"),
    ) as SchemaNode & {
      properties: Record<string, SchemaNode & { items?: SchemaNode }>;
    };
    const t = TRACE_SHAPE as unknown as ShapeNode;
    expect(t.order).toEqual(Object.keys(trace.properties));
    for (const name of ["inputs", "runs", "rows"]) {
      expect(((t.fields[name] as ShapeNode).items as ShapeNode).order).toEqual(
        props(trace.properties[name]?.items),
      );
    }
    expect((t.fields.summary as ShapeNode).order).toEqual(
      props(trace.properties.summary),
    );
  });
});

describe("Schema validation", () => {
  test("accepts a valid record and reports problems with a broken one", () => {
    const [, text] = recordEntry(testRecord("OQ-A1-001"));
    expect(Schema.evidence(JSON.parse(text))).toEqual([]);
    const broken = JSON.parse(text);
    broken.test.outcome = "fail";
    expect(Schema.evidence(broken).length).toBeGreaterThan(0);
  });

  test("caps the number of messages", () => {
    const messages = Schema.evidence({
      schemaVersion: 2,
      kind: "x",
      run: envelope({ id: "bad" }),
      test: {},
      a: 1,
      b: 2,
    });
    expect(messages.length).toBeLessThanOrEqual(11);
    expect(messages.at(-1)).toMatch(/^and \d+ more$/);
  });

  test("trace files and themes", () => {
    expect(Schema.trace({}).length).toBeGreaterThan(0);
    expect(Schema.theme({}).length).toBeGreaterThan(0);
  });
});
