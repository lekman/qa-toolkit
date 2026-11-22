import { describe, expect, test } from "bun:test";

import { Settings } from "../../src/settings";
import { EvidenceRuns } from "../../src/trace";
import { folder, runFile, TraceHostMock } from "../mocks/trace-host.mock";

const A = "01M828ZGK00000000000000000"; // 2026-11-22 18:41 UTC
const B = "01M82A29W00000000000000000"; // 2026-11-22 19:00 UTC
const QA = `version: 1
sets:
  - name: iu-desktop
    level: IU
    runner: cucumber-js
    paths: [apps/web]
    results: test-results/evidence/iu/desktop
  - name: oq
    level: OQ
    runner: bun-test
    paths: ["services/*"]
    results: ./test-results/evidence/oq/
  - name: unit
    level: unit
    runner: bun-test
    paths: [apps/web]
    results: test-results/junit/unit.xml
`;

describe("EvidenceRuns", () => {
  test("the evidence folders of qa.yaml, qualify.packages and qualify.evidenceDir", async () => {
    const host = new TraceHostMock({ "/ws/qa.yaml": QA });
    const settings = Settings.from({
      evidenceDir: "/abs/evidence",
      packages: { "libs/py": { evidenceDir: "out/evidence" } },
    });
    const sets = (await import("@lekman/test-sets")).TestSets.parse(
      (await host.read("/ws/qa.yaml")) as string,
    ).file;
    expect(EvidenceRuns.locations(settings, sets)).toEqual([
      { dir: "test-results/evidence/iu/desktop", package: "apps/web" },
      { dir: "test-results/evidence/oq", package: "services/*" },
      { dir: "out/evidence", package: "libs/py" },
    ]);
    expect(EvidenceRuns.locations(Settings.DEFAULTS, undefined)).toEqual([
      { dir: "qualification/evidence", package: "**" },
    ]);
    expect(
      EvidenceRuns.globs([
        { dir: "q/e", package: "**" },
        { dir: "e", package: "." },
      ]),
    ).toEqual({
      records: ["**/q/e/**/records/*__*__*.json", "e/**/records/*__*__*.json"],
      runs: ["**/q/e/**/test-evidence.json", "e/**/test-evidence.json"],
    });
  });

  test("the package of an evidence folder", () => {
    const locations = [
      { dir: "test-results/evidence/oq", package: "services/*" },
      { dir: "e", package: "." },
      { dir: "qualification/evidence", package: "**" },
    ];
    expect(
      EvidenceRuns.packageOf(
        "services/api/test-results/evidence/oq",
        locations,
      ),
    ).toBe("services/api");
    expect(EvidenceRuns.packageOf("e/sub", locations)).toBe(".");
    expect(
      EvidenceRuns.packageOf("libs/py/qualification/evidence", locations),
    ).toBe("libs/py");
    expect(EvidenceRuns.packageOf("qualification/evidence", locations)).toBe(
      ".",
    );
    expect(EvidenceRuns.packageOf("elsewhere", locations)).toBe(".");
  });

  test("finds run files and records not merged yet, newest first, and labels them", async () => {
    const host = new TraceHostMock({
      "/ws/apps/web/test-results/evidence/iu/desktop/records/x.json": "{}",
      "/ws/apps/web/test-results/evidence/iu/desktop/test-evidence.json":
        runFile(A, "2026-11-22T18:41:22.195Z", ["IU", "IU"]),
      "/ws/node_modules/x/qualification/evidence/test-evidence.json": runFile(
        B,
        "x",
        ["OQ"],
      ),
      "/ws/qa.yaml": QA,
      "/ws/services/api/test-results/evidence/oq/records/broken.json": "{}",
      [`/ws/services/api/test-results/evidence/oq/records/${B}__OQ-API-001__0123abcd.json`]:
        "{}",
      [`/ws/services/api/test-results/evidence/oq/records/${B}__IQ-API-002__0123abcd.json`]:
        "{}",
      "/ws/services/api/test-results/evidence/oq/test-evidence.json.sha256": "",
      "/ws/libs/py/qualification/evidence/test-evidence.json": "not json",
    });
    const runs = await EvidenceRuns.find(host, [folder()]);
    expect(
      runs.map((r) => [r.runId, r.package, r.levels.join("/"), r.tests]),
    ).toEqual([
      [B, "services/api", "IQ/OQ", 2],
      [A, "apps/web", "IU", 2],
    ]);
    expect(EvidenceRuns.item(runs[0]!)).toMatchObject({
      description: "2 tests · records not merged yet",
      detail: "services/api/test-results/evidence/oq",
      label: "IQ/OQ · services/api · 2026-11-22 19:00 UTC",
    });
    expect(EvidenceRuns.item(runs[1]!)).toMatchObject({
      description: "2 tests · pass",
      label: "IU · apps/web · 2026-11-22 18:41 UTC",
    });
    expect(runs[1]?.toolVersion).toBe("0.2.0");
  });

  test("a run file that is not a run, or has no start time", () => {
    const f = folder();
    expect(
      EvidenceRuns.fromRunFile(f, "/ws/t.json", "{}", "."),
    ).toBeUndefined();
    const run = EvidenceRuns.fromRunFile(
      f,
      "/ws/t.json",
      runFile(A, "", [], { run: { id: A }, summary: {} }),
      ".",
    );
    expect(run?.startedMs).toBe(Date.parse("2026-11-22T18:41:00Z"));
    expect(run?.verdict).toBeUndefined();
    expect(run?.toolVersion).toBeUndefined();
    expect(
      EvidenceRuns.item({ ...run!, levels: [], tests: 1 }).label,
    ).toStartWith("Run · . ·");
    expect(EvidenceRuns.item({ ...run!, tests: 1 }).description).toBe(
      "1 test · no verdict",
    );
    expect(EvidenceRuns.ulidTime("not-a-ulid")).toBe(0);
  });

  test("records of several runs are one run each", () => {
    const runs = EvidenceRuns.fromRecords(
      folder(),
      "/ws/e",
      [
        `/ws/e/records/${A}__OQ-A-001__0123abcd.json`,
        `/ws/e/records/${B}__OQ-A-001__0123abcd.json`,
        `/ws/e/records/${B}__OQ-A-002__0123abcd.json`,
      ],
      ".",
    );
    expect(runs.map((r) => [r.runId, r.tests, r.recordsOfOtherRuns])).toEqual([
      [A, 1, true],
      [B, 2, true],
    ]);
  });
});
