import { describe, expect, test } from "bun:test";

import { Discovery } from "../../src/discovery";

const FILE = "/repo/app/export.qualify.test.ts";

const parse = (text: string) => Discovery.parse(FILE, text);

describe("TypeScript discovery", () => {
  test("reads an oq call with its options", () => {
    const [d, ...rest] = parse(`import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-EXPORT-003",
  "The bank file never changes an amount",
  {
    given: "a day of payments",
    when: "the export runs",
    then: "every amount matches",
    requirements: ["EXPORT-003", "EXPORT-004"],
    risk: "high",
    scope: "read",
    tags: ["export", "bank"],
  },
  async (ctx) => {},
);
`);
    expect(rest).toEqual([]);
    expect(d).toMatchObject({
      file: FILE,
      framework: "vitest",
      id: "OQ-EXPORT-003",
      language: "typescript",
      level: "OQ",
      line: 3,
      problems: [],
      requirements: ["EXPORT-003", "EXPORT-004"],
      risk: "high",
      scope: "read",
      tags: ["bank", "export"],
      title: "The bank file never changes an amount",
    });
  });

  test("picks the runner from the adapter the file imports", () => {
    const body = `iu("IU-AB-001", "t", { given: "g", when: "w", then: "t" }, () => {});`;
    expect(
      parse(`import { iu } from "@lekman/qualify/node";\n${body}`)[0]
        ?.framework,
    ).toBe("node");
    expect(
      parse(`import { iu } from '@lekman/qualify/bun';\n${body}`)[0]?.framework,
    ).toBe("bun");
    expect(
      parse(`import type { X } from "@lekman/qualify";\n${body}`)[0]?.framework,
    ).toBe("vitest");
  });

  test("reads nothing from a file that does not import qualify", () => {
    expect(parse(`oq("OQ-AB-001", "t", {}, () => {});`)).toEqual([]);
  });

  test("ignores calls in comments and strings, and the definition of a function named oq", () => {
    const found = parse(`import { oq } from "@lekman/qualify/vitest";
// oq("OQ-COMMENT-001", "in a comment", {}, () => {});
/* iu("IU-BLOCK-001", "in a block", {}, () => {}); */
const s = 'oq("OQ-STRING-001", "in a string")';
const r = /oq\\(/;
function oq(id: string) {}
`);
    expect(found).toEqual([]);
  });

  test("reads a namespace call, a template literal and a joined string", () => {
    const [d] = parse(`import * as q from "@lekman/qualify/bun";
q.iq(\`IQ-SETUP-001\`, "The service " + "starts", { given: "g", when: "w", then: "t" }, () => {});
`);
    expect(d).toMatchObject({
      id: "IQ-SETUP-001",
      level: "IQ",
      problems: [],
      title: "The service starts",
    });
  });

  test("an ID that breaks the pattern is an error item, not hidden", () => {
    const [d] = parse(`import { oq } from "@lekman/qualify/vitest";
oq("OQ-EXPORT-API-001", "two area segments", { given: "g", when: "w", then: "t", scope: "read" }, () => {});
`);
    expect(d?.id).toBe("OQ-EXPORT-API-001");
    expect(d?.problems).toEqual([
      "the ID OQ-EXPORT-API-001 does not match ^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$",
    ]);
  });

  test("an ID whose prefix differs from the level is an error", () => {
    const [d] = parse(`import { pq } from "@lekman/qualify/vitest";
pq("OQ-LOAD-001", "t", { given: "g", when: "w", then: "t", scope: "read" }, () => {});
`);
    expect(d?.problems).toEqual([
      "the ID must start with PQ-, the level it is declared at",
    ]);
  });

  test("an ID held in a variable cannot be read without running the test", () => {
    const [d] = parse(`import { oq } from "@lekman/qualify/vitest";
const ID = "OQ-AB-001";
oq(ID, "t", options, () => {});
`);
    expect(d?.id).toBe("ID");
    expect(d?.problems[0]).toBe(
      "the ID is not a string literal, so it cannot be read without running the test",
    );
  });

  test("options in a variable or with a spread are not checked for missing fields", () => {
    const [a, b] = parse(`import { oq } from "@lekman/qualify/vitest";
oq("OQ-AB-001", "t", options, () => {});
oq("OQ-AB-002", "t", { ...base, risk: "low" }, () => {});
`);
    expect(a?.problems).toEqual([]);
    expect(b?.problems).toEqual([]);
    expect(b?.risk).toBe("low");
  });

  test("reports missing narrative, a missing OQ scope, a scope on IU and an unknown risk", () => {
    const [oq, iu] = parse(`import { oq, iu } from "@lekman/qualify/vitest";
oq("OQ-AB-001", "t", { given: "g", risk: "severe" }, () => {});
iu("IU-AB-001", "", { given: "g", when: "w", then: "t", scope: "read" }, () => {});
`);
    expect(oq?.problems).toEqual([
      "risk severe is not high, medium or low",
      "when is missing",
      "then is missing",
      "scope is missing: an OQ test declares read or read-write",
    ]);
    expect(iu?.problems).toEqual([
      "the title is empty",
      "an IU test does not declare a scope: IQ is always read and IU always read-write",
    ]);
  });

  test("an unknown scope value is an error", () => {
    const [d] = parse(`import { oq } from "@lekman/qualify/vitest";
oq("OQ-AB-001", "t", { given: "g", when: "w", then: "t", scope: "write" }, () => {});
`);
    expect(d?.problems).toEqual(["scope write is not read or read-write"]);
  });

  test("a call with no arguments has no ID", () => {
    const [d] = parse(`import { oq } from "@lekman/qualify/vitest";
oq();
`);
    expect(d?.problems[0]).toBe("the declaration has no ID");
  });
});
