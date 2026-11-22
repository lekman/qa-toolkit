import { TestSets } from "@lekman/test-sets";
import { describe, expect, test } from "bun:test";

import { RunExecution, RunPlan } from "../../src/runs";
import { JunitResults, OrdinaryTests, SetScan } from "../../src/sets";
import { Settings } from "../../src/settings";
import { TestTree } from "../../src/tree";
import { WorkspaceScan } from "../../src/workspace";
import {
  ProcessMock,
  ReporterMock,
  ResultFilesMock,
  WorkspaceFilesMock,
} from "../mocks/fixtures";

const QA = `version: 1
sets:
  - { name: unit, level: unit, runner: bun-test, paths: ["apps/*"] }
  - { name: py, level: unit, runner: pytest, paths: [libs/py] }
  - { name: web-iu, level: IU, runner: cucumber-js, paths: [apps/web], command: task iu, results: out/evidence, env: { CI: "1" } }
  - { name: jvm, level: integration, runner: gradle, paths: [svc] }
`;

const FILES: Record<string, string> = {
  "/ws/apps/web/features/a.feature": `Feature: f
  Scenario: IU-WEB-001 Shows the list
    Given a
    When b
    Then c
`,
  "/ws/apps/web/package.json": "{}",
  "/ws/apps/web/src/math.test.ts": `import { describe, expect, test } from "bun:test";
describe("math", () => {
  test("adds", () => expect(1 + 1).toBe(2));
  test.skip("subtracts", () => {});
  it(\`multiplies\`, () => {});
  test(name, () => {});
});
`,
  "/ws/apps/web/src/empty.test.ts": "// no tests yet\n",
  "/ws/libs/py/pyproject.toml": "",
  "/ws/libs/py/tests/test_a.py": `import qualify

@qualify.oq("OQ-PY-001", "t", given="g", when="w", then="t", scope="read")
def test_qualified(ctx):
    pass

def test_plain():
    pass
`,
  "/ws/qa.yaml": QA,
  "/ws/svc/build.gradle.kts": "",
  "/ws/svc/src/test/java/acme/ATest.java": `class ATest {
  @Test
  void addsUp() {}
  @Test @DisplayName("x")
  public void multiplies() {}
}
`,
};

const folder = { name: "ws", path: "/ws" };

describe("OrdinaryTests", () => {
  test("reads names per framework", () => {
    expect(
      OrdinaryTests.cases(
        "a.stories.tsx",
        "export const Primary = {};\nexport const secondary = 1;\n",
        "storybook",
      ),
    ).toEqual([{ line: 1, name: "Primary" }]);
    expect(
      OrdinaryTests.cases(
        "a.feature",
        "Feature: f\n  Scenario: logs in\n",
        "cucumber",
      ),
    ).toEqual([{ line: 2, name: "logs in" }]);
    expect(
      OrdinaryTests.cases(
        "A.cs",
        "[Fact]\npublic void Adds() {}\n[Theory, InlineData(1)]\npublic async Task Waits() {}\n",
        "xunit",
      ),
    ).toEqual([
      { line: 1, name: "Adds" },
      { line: 3, name: "Waits" },
    ]);
    expect(
      OrdinaryTests.cases(
        "A.kt",
        "@Test\nfun `adds up`() {}\n@TestFactory\nfun other() {}\n",
        "junit",
      ),
    ).toEqual([{ line: 1, name: "adds up" }]);
    expect(OrdinaryTests.cases("a.mdx", "<Meta />", "storybook")).toEqual([]);
    expect(OrdinaryTests.cases("a.mdx", "x", "vitest")).toEqual([]);
  });
});

describe("SetScan", () => {
  test("globs and package folders", () => {
    const set = TestSets.parse(QA).file?.sets[0] as never;
    expect(SetScan.globs(set, ["**/*.test.ts"])).toEqual([
      "apps/*/**/*.test.ts",
    ]);
    expect(
      SetScan.globs({ ...(set as object), paths: ["."] } as never, [
        "**/*.test.ts",
      ]),
    ).toEqual(["**/*.test.ts"]);
    expect(SetScan.packageOf(set, "apps/web/src/a.test.ts")).toBe("apps/web");
    expect(SetScan.packageOf(set, "libs/a.test.ts")).toBeUndefined();
  });

  test("the tree holds ordinary tests beside qualification tests, without counting a test twice", async () => {
    const scan = await WorkspaceScan.scan(
      folder,
      Settings.DEFAULTS,
      new WorkspaceFilesMock(FILES),
    );
    expect(scan.problems).toEqual([]);
    const product = WorkspaceScan.resolve(
      folder,
      scan.declarations,
      scan.index,
      scan.ordinary,
    );
    const shape = (
      nodes: ReturnType<typeof TestTree.build>,
      depth = 0,
    ): string[] =>
      nodes.flatMap((n) => [
        `${"  ".repeat(depth)}${n.label}${n.description ? ` (${n.description})` : ""}`,
        ...shape(n.children, depth + 1),
      ]);
    expect(shape(TestTree.build([product]))).toEqual([
      "ws (9 tests)",
      "  apps/web (package.json · 5 tests)",
      "    IU (Intended Use · 1 test)",
      "      IU-WEB-001 Shows the list",
      "    unit (Unit tests · 4 tests)",
      "      empty.test.ts (src/empty.test.ts)",
      "      adds (src/math.test.ts)",
      "      multiplies (src/math.test.ts)",
      "      subtracts (src/math.test.ts)",
      "  libs/py (pyproject.toml · 2 tests)",
      "    OQ (Operational Qualification · 1 test)",
      "      OQ-PY-001 t",
      "    unit (Unit tests · 1 test)",
      "      test_plain (tests/test_a.py)",
      "  svc (2 tests)",
      "    integration (Integration tests · 2 tests)",
      "      addsUp (src/test/java/acme/ATest.java)",
      "      multiplies (src/test/java/acme/ATest.java)",
    ]);
    const adds = product.tests.find((t) => t.declaration.title === "adds");
    expect(adds && TestTree.tags(adds)).toEqual([
      "level:unit",
      "runner:bun-test",
      "set:unit",
    ]);
  });

  test("an invalid qa.yaml is a problem and adds no tests", async () => {
    const scan = await WorkspaceScan.scan(
      folder,
      Settings.DEFAULTS,
      new WorkspaceFilesMock({ ...FILES, "/ws/qa.yaml": "version: 2" }),
    );
    expect(scan.problems.length).toBeGreaterThan(0);
    expect(scan.ordinary).toEqual([]);
    expect(scan.sets).toBeUndefined();
  });
});

describe("runs of sets", () => {
  test("ordinary tests run with their set; qualification tests take the set's command, results and variables", async () => {
    const scan = await WorkspaceScan.scan(
      folder,
      Settings.DEFAULTS,
      new WorkspaceFilesMock(FILES),
    );
    const product = WorkspaceScan.resolve(
      folder,
      scan.declarations,
      scan.index,
      scan.ordinary,
    );
    const plan = RunPlan.build(product.tests, {
      index: () => scan.index,
      platform: "linux",
      resultsDir: "/storage",
      runId: "RUN",
      sets: () => scan.sets,
      settings: () => Settings.DEFAULTS,
    });
    expect(
      plan.groups.map((g) => [g.command, g.format, g.results, g.env]),
    ).toEqual([
      [
        "task iu",
        "qualify-evidence",
        "/ws/apps/web/out/evidence",
        {
          CI: "1",
          QUALIFY_EVIDENCE_DIR: "/ws/apps/web/out/evidence",
          QUALIFY_RUN_ID: "RUN",
        },
      ],
      [
        "python -m pytest -k 'OQ-PY-001'",
        "qualify-evidence",
        "/ws/libs/py/qualification/evidence",
        {
          QUALIFY_EVIDENCE_DIR: "/ws/libs/py/qualification/evidence",
          QUALIFY_RUN_ID: "RUN",
        },
      ],
      [
        "bun test --reporter=junit --reporter-outfile=/storage/RUN/unit-apps-web.xml",
        "junit-xml",
        "/storage/RUN/unit-apps-web.xml",
        {},
      ],
      [
        "python -m pytest --junitxml=/storage/RUN/py-libs-py.xml",
        "junit-xml",
        "/storage/RUN/py-libs-py.xml",
        {},
      ],
      [
        "gradle test",
        "junit-xml",
        "/ws/svc/build/test-results/test/TEST-*.xml",
        {},
      ],
    ]);

    const junit = `<testsuites><testsuite name="src/math.test.ts"><testcase name="math &gt; adds" file="src/math.test.ts" time="0.002"/><testcase name="subtracts" classname="math"><skipped/></testcase><testcase name="multiplies" file="other.test.ts"/></testsuite></testsuites>`;
    const gradle = `<testsuite name="acme.ATest"><testcase name="addsUp" classname="acme.ATest"><failure message="expected 2"/></testcase></testsuite>`;
    const reporter = new ReporterMock();
    await RunExecution.execute(
      { groups: [plan.groups[2], plan.groups[4]] as never, refused: [] },
      "RUN",
      {
        clock: () => 5000,
        files: new ResultFilesMock({
          "/storage/RUN/unit-apps-web.xml": { mtime: 5000, text: junit },
          "/ws/svc/build/test-results/test/TEST-acme.ATest.xml": {
            mtime: 5000,
            text: gradle,
          },
          "/ws/svc/build/test-results/test/other.xml": {
            mtime: 5000,
            text: gradle,
          },
        }),
        process: new ProcessMock(1),
        reporter,
      },
      new AbortController().signal,
    );
    expect(reporter.events.filter((e) => e.startsWith("result"))).toEqual([
      "result src/empty.test.ts#empty.test.ts: not-run",
      "result src/math.test.ts#adds: pass",
      "result src/math.test.ts#subtracts: skip",
      "result src/math.test.ts#multiplies: not-run",
      "result src/test/java/acme/ATest.java#addsUp: fail",
      "result src/test/java/acme/ATest.java#multiplies: not-run",
    ]);
    expect(
      JSON.stringify(
        reporter.results.get("src/test/java/acme/ATest.java#addsUp"),
      ),
    ).toContain("Failure: expected 2");
  });
});

describe("JunitResults", () => {
  test("a case without a file matches by name alone", () => {
    const scanTest = {
      declaration: {
        file: "/ws/a/x.test.ts",
        id: "x.test.ts#adds",
        title: "adds",
      },
      package: { root: "/ws/a" },
    } as never;
    expect(
      JunitResults.matches(
        { name: "adds", outcome: "pass", suite: "" },
        scanTest,
      ),
    ).toBe(true);
    expect(
      JunitResults.matches(
        { name: "subadds", outcome: "pass", suite: "" },
        scanTest,
      ),
    ).toBe(false);
    expect(
      JunitResults.matches(
        { name: "x adds", outcome: "pass", suite: "tests.test_b" },
        scanTest,
      ),
    ).toBe(false);
  });
});
