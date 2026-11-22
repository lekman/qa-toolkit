import { TestSets } from "@lekman/test-sets";
import { describe, expect, test } from "bun:test";

import type { PlanInput } from "../../src/plan";

import { QaPlan } from "../../src/plan";

const FILE = TestSets.parse(`version: 1
sets:
  - name: unit
    level: unit
    runner: vitest
    paths: ["packages/*"]
  - name: web-iu
    level: IU
    runner: cucumber-js
    paths: [apps/web]
    command: task test:intended-use -- \${ids}
    results: test-results/evidence
  - name: py
    level: OQ
    runner: pytest
    paths: [libs/py]
  - name: jvm
    level: unit
    runner: gradle
    paths: [svc]
  - name: stories
    level: story
    runner: storybook
    paths: [packages/design]
    env: { CI: "1", OUT: "\${results}" }
  - name: ghost
    level: unit
    runner: nope
    paths: [x]
  - name: lost
    level: unit
    runner: vitest
    paths: [moved/away]
`).file as NonNullable<ReturnType<typeof TestSets.parse>["file"]>;

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  file: FILE,
  filter: {},
  folders: [
    ".",
    "apps",
    "apps/web",
    "libs",
    "libs/py",
    "packages",
    "packages/core",
    "packages/design",
    "svc",
  ],
  index: new Map([
    ["/r", ["bun.lock"]],
    ["/r/svc", ["gradlew"]],
  ]),
  out: "/r/qa-results",
  platform: "linux",
  root: "/r",
  runId: "01JZ0000000000000000000000",
  ...over,
});

describe("QaPlan", () => {
  test("one command per set and folder, writing results where the CLI reads them", () => {
    const plan = QaPlan.build(input());
    expect(plan.problems).toEqual([
      "set ghost: no runner is named nope",
      "set lost: no folder matches moved/away",
    ]);
    expect(
      plan.runs.map((r) => ({
        cmd: r.command,
        cwd: r.cwd,
        env: r.env,
        results: r.results,
        set: r.set.name,
      })),
    ).toEqual([
      {
        cmd: "bunx vitest run --reporter=default --reporter=junit --outputFile.junit=/r/qa-results/junit/unit-packages-core.xml",
        cwd: "/r/packages/core",
        env: {},
        results: "/r/qa-results/junit/unit-packages-core.xml",
        set: "unit",
      },
      {
        cmd: "bunx vitest run --reporter=default --reporter=junit --outputFile.junit=/r/qa-results/junit/unit-packages-design.xml",
        cwd: "/r/packages/design",
        env: {},
        results: "/r/qa-results/junit/unit-packages-design.xml",
        set: "unit",
      },
      {
        cmd: "task test:intended-use --",
        cwd: "/r/apps/web",
        env: {
          QUALIFY_EVIDENCE_DIR: "/r/apps/web/test-results/evidence",
          QUALIFY_RUN_ID: "01JZ0000000000000000000000",
        },
        results: "/r/apps/web/test-results/evidence",
        set: "web-iu",
      },
      {
        cmd: "python -m pytest",
        cwd: "/r/libs/py",
        env: {
          QUALIFY_EVIDENCE_DIR: "/r/qa-results/evidence/py/libs-py",
          QUALIFY_RUN_ID: "01JZ0000000000000000000000",
        },
        results: "/r/qa-results/evidence/py/libs-py",
        set: "py",
      },
      {
        cmd: "./gradlew test",
        cwd: "/r/svc",
        env: {},
        results: "/r/svc/build/test-results/test/TEST-*.xml",
        set: "jvm",
      },
      {
        cmd: "bunx test-storybook --junit",
        cwd: "/r/packages/design",
        env: {
          CI: "1",
          JEST_JUNIT_OUTPUT_DIR: "/r/qa-results/junit",
          JEST_JUNIT_OUTPUT_NAME: "stories-packages-design.xml",
          OUT: "/r/qa-results/junit/stories-packages-design.xml",
        },
        results: "/r/qa-results/junit/stories-packages-design.xml",
        set: "stories",
      },
    ]);
  });

  test("a set's results folder or file for JUnit XML", () => {
    const file = TestSets.parse(`version: 1
sets:
  - { name: a, level: unit, runner: pytest, paths: ["."], results: out }
  - { name: b, level: unit, runner: pytest, paths: ["."], results: out/x.xml }
`).file as typeof FILE;
    expect(QaPlan.build(input({ file })).runs.map((r) => r.results)).toEqual([
      "/r/out/a-root.xml",
      "/r/out/x.xml",
    ]);
  });

  test("--changed keeps only the folders with a change", () => {
    const plan = QaPlan.build(
      input({
        changed: ["packages/design/src/a.ts", "README.md"],
        filter: { levels: ["unit", "story"] },
      }),
    );
    expect(plan.runs.map((r) => `${r.set.name}:${r.folder}`)).toEqual([
      "unit:packages/design",
      "stories:packages/design",
    ]);
    expect(QaPlan.touched(".", [])).toBe(false);
    expect(QaPlan.touched(".", ["a"])).toBe(true);
    expect(QaPlan.touched("apps/web", ["apps/webx/a"])).toBe(false);
  });

  test("unknown set names are problems", () => {
    expect(
      QaPlan.build(input({ filter: { names: ["unit", "e2e"] } })).problems,
    ).toContain("no set is named e2e");
  });
});
