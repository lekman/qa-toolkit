import { describe, expect, test } from "bun:test";

import { TestSets } from "../../src";

const FILE = `# yaml-language-server: $schema=packages/test-sets/schema/test-sets.schema.json
version: 1
sets:
  - name: web-intended-use
    level: IU
    runner: cucumber-js
    paths: [apps/web]
    command: task test:intended-use -- \${ids}
    results: test-results/evidence
  - name: unit
    level: unit
    runner: bun-test
    paths: ["packages/*", "."]
  - name: stories
    level: story
    runner: storybook
    paths: [packages/design]
    env: { CI: "1" }
`;

describe("TestSets.parse", () => {
  test("reads the sets", () => {
    const parsed = TestSets.parse(FILE);
    expect(parsed.problems).toEqual([]);
    expect(parsed.file?.sets.map((s) => s.name)).toEqual([
      "web-intended-use",
      "unit",
      "stories",
    ]);
    expect(parsed.file?.sets[0]?.command).toBe(
      "task test:intended-use -- ${ids}",
    );
  });

  test("text that is not YAML is a problem", () => {
    expect(TestSets.parse("sets: [").problems[0]).toStartWith("not YAML:");
  });

  test("schema violations name where they are", () => {
    const parsed = TestSets.parse(`version: 1
sets:
  - name: Bad Name
    level: e2e
    runner: vitest
    paths: []
    extra: 1
`);
    expect(parsed.file).toBeUndefined();
    expect(parsed.problems).toEqual([
      "/sets/0 must NOT have additional properties",
      '/sets/0/name must match pattern "^[a-z0-9][a-z0-9._-]*$"',
      "/sets/0/level must be equal to one of the allowed values",
      "/sets/0/paths must NOT have fewer than 1 items",
    ]);
    expect(TestSets.parse("version: 2\nsets: []").problems).toEqual([
      "/version must be equal to constant",
      "/sets must NOT have fewer than 1 items",
    ]);
  });

  test("a set name used twice is a problem", () => {
    const parsed = TestSets.parse(`version: 1
sets:
  - { name: a, level: unit, runner: vitest, paths: [x] }
  - { name: a, level: unit, runner: vitest, paths: [y] }
`);
    expect(parsed.problems).toEqual([
      "/sets/1/name a is used by an earlier set",
    ]);
  });
});

describe("TestSets", () => {
  const file = TestSets.parse(FILE).file as NonNullable<
    ReturnType<typeof TestSets.parse>["file"]
  >;

  test("which sets cover a package folder, with globs and the root", () => {
    expect(TestSets.forFolder(file, "apps/web").map((s) => s.name)).toEqual([
      "web-intended-use",
    ]);
    expect(
      TestSets.forFolder(file, "./packages/design/").map((s) => s.name),
    ).toEqual(["unit", "stories"]);
    expect(TestSets.forFolder(file, "").map((s) => s.name)).toEqual(["unit"]);
    expect(TestSets.forFolder(file, "packages/design/sub")).toEqual([]);
  });

  test("selects by name and level, and reports unknown names", () => {
    expect(TestSets.select(file, {}).sets).toHaveLength(3);
    expect(
      TestSets.select(file, { levels: ["IU", "story"] }).sets.map(
        (s) => s.name,
      ),
    ).toEqual(["web-intended-use", "stories"]);
    expect(TestSets.select(file, { names: ["unit", "nope"] })).toEqual({
      problems: ["no set is named nope"],
      sets: [file.sets[1] as never],
    });
  });

  test("result format and qualification levels", () => {
    expect(TestSets.resultFormat(file.sets[0] as never)).toBe(
      "qualify-evidence",
    );
    expect(TestSets.resultFormat(file.sets[1] as never)).toBe("junit-xml");
    expect(TestSets.isQualification("PQ")).toBe(true);
    expect(TestSets.SCHEMA).toHaveProperty("$id");
    expect(TestSets.FILE).toBe("qa.yaml");
  });
});
