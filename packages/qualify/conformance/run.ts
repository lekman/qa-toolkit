/**
 * Conformance harness: runs every scenario in
 * spec/qualify/conformance/README.md through a real runner, then `qualify
 * merge` and `qualify trace` from the built CLI, masks the run file and
 * compares it byte for byte with the shared expected file.
 *
 *   bun run conformance                 build, then run every scenario
 *   bun run conformance/run.ts --update write the expected files instead
 *   bun run conformance/run.ts --only crash,all-pass
 *
 * vitest runs all 20 scenarios. node:test and bun run scenarios 1, 2, 6 and
 * 10, compared with the same expected files. Needs Node 22.18 or later for
 * the node:test files, which Node loads as TypeScript.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RunFile, TestRecord } from "../src/evidence";
import type { TraceFile } from "../src/trace";

import { EVIDENCE_SHAPE } from "../src/evidence";
import { Schema } from "../src/schema";
import { TRACE_SHAPE } from "../src/trace";
import { JsonText } from "../src/values";
import { extractPdf, missingFromOutline } from "./pdf-text";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = resolve(PKG, "../../spec/qualify/conformance/expected");
const FIXTURES = resolve(PKG, "../../spec/qualify/conformance/fixtures");
const CLI = join(PKG, "dist/cli.js");
const VITEST = join(PKG, "node_modules/vitest/vitest.mjs");
const RUN_ID = "01HQA1ZQJ0C0NF0RMANCE00000";
const SECRET = "s3cr3t-value-123";

type Runner = "bun" | "node:test" | "vitest";

interface Exec {
  output: string;
  status: number;
}

interface Invocation {
  args?: string[];
  env?: Record<string, string>;
  /** Scenario test files, without folder or extension. */
  files: string[];
  /** The runner's expected exit code; `"nonzero"` for a crashed worker. */
  status: "nonzero" | number;
}

interface Scenario {
  /** Extra checks on the evidence directory and the run file. */
  check?: (ctx: CheckContext) => void;
  /** `error.type` placeholder, for a scenario that names one. */
  errorType?: string;
  /** Expected file name without `.json`; omitted when no run file is compared. */
  expected?: string;
  invocations: Invocation[];
  merge: number;
  name: string;
  /** Runners besides vitest that run this scenario. */
  runners: Runner[];
  /** Scenario names the sites must point at. Defaults to the files run. */
  sites?: string[];
  /** `trace` exit code without a protocol, from the exit-code table. */
  trace?: number;
}

interface CheckContext {
  dir: string;
  merged?: RunFile;
  output: string;
  runner: Runner;
}

class Failure extends Error {}

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Failure(message);
};

const exec = (
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Exec => {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  if (result.error) throw result.error;
  return {
    status: result.status ?? (result.signal ? 128 : 1),
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
};

/** The real environment without any QUALIFY_* variable, plus the scenario's own. */
const scenarioEnv = (
  dir: string,
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("QUALIFY_") && key !== "NODE_TEST_CONTEXT")
      env[key] = value;
  }
  return {
    ...env,
    QUALIFY_RUN_ID: RUN_ID,
    QUALIFY_EVIDENCE_DIR: dir,
    ...extra,
  };
};

const runTests = (
  runner: Runner,
  invocation: Invocation,
  dir: string,
  log?: string,
): Exec => {
  const env = scenarioEnv(dir, invocation.env);
  if (log !== undefined) env.CONFORMANCE_WORKER_LOG = log;
  switch (runner) {
    case "vitest":
      return exec(
        process.execPath.includes("bun") ? "node" : process.execPath,
        [
          VITEST,
          "run",
          "--config",
          "conformance/vitest.config.ts",
          ...(invocation.args ?? []),
          ...invocation.files.map((f) => `conformance/vitest/${f}.qualify.ts`),
        ],
        PKG,
        env,
      );
    case "node:test":
      return exec(
        "node",
        [
          ...(invocation.args ?? []),
          "--test",
          ...invocation.files.map((f) => `conformance/node/${f}.test.ts`),
        ],
        PKG,
        env,
      );
    case "bun":
      return exec(
        "bun",
        [
          "test",
          ...(invocation.args ?? []),
          ...invocation.files.map((f) => `./${f}.test.ts`),
        ],
        join(PKG, "conformance/bun"),
        env,
      );
  }
};

const cli = (args: string[], env: NodeJS.ProcessEnv = scenarioEnv("")): Exec =>
  exec("node", [CLI, ...args], PKG, env);

const recordsOf = (dir: string): string[] => {
  const records = join(dir, "records");
  return existsSync(records)
    ? readdirSync(records).filter((n) => !n.startsWith("."))
    : [];
};

/** Every file below a directory, recursively. */
const filesBelow = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? filesBelow(join(dir, entry.name))
          : [join(dir, entry.name)],
      )
    : [];

const SITE_FILE = /^(?:.*\/)?([^/]+?)(?:\.qualify|\.test)?\.ts:\d+$/;

/** Every site must point into one of the scenario's own test files. */
const checkSites = (file: RunFile, allowed: readonly string[]): void => {
  const sites = file.tests.flatMap((t) => [
    t.site,
    ...t.checks.map((c) => c.site),
    ...(t.error?.site ? [t.error.site] : []),
  ]);
  for (const site of sites) {
    const match = SITE_FILE.exec(site);
    assert(
      match && allowed.includes(match[1] as string),
      `site ${site} does not point into ${allowed.join(" or ")}`,
    );
  }
};

const UNSERIALISABLE = /\[unserialisable: [^\]]*\]/g;

const maskStrings = (value: unknown): unknown => {
  if (typeof value === "string")
    return value.replace(UNSERIALISABLE, "[unserialisable: <type>]");
  if (Array.isArray(value)) return value.map(maskStrings);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, maskStrings(v)]),
    );
  }
  return value;
};

const maskSite = (site: string): string =>
  site.replace(/^.*:\d+$/, "<scenario>:0");

/** The masking table of spec/qualify/conformance/README.md. */
const mask = (file: RunFile, errorType?: string): RunFile => {
  const copy = JSON.parse(JSON.stringify(file)) as RunFile;
  copy.run.startedAt = "<timestamp>";
  copy.run.endedAt = "<timestamp>";
  copy.run.tool = {
    name: "<tool>",
    version: "<version>",
    language: "<language>" as never,
    runtime: "<runtime>",
  };
  copy.run.source = { commit: null, branch: null, dirty: null };
  copy.run.actor = { name: null, ci: null, ciRunUrl: null };
  delete copy.run.selection;
  copy.tests = copy.tests.map((test): TestRecord => {
    const t = { ...test };
    t.startedAt = "<timestamp>";
    t.endedAt = "<timestamp>";
    t.durationMs = 0;
    t.site = maskSite(t.site);
    t.checks = t.checks.map((c) => {
      const check = { ...c, site: maskSite(c.site) };
      delete check.at;
      if (check.delegate !== undefined) check.delegate = "<function>";
      return check;
    });
    if (t.error) {
      t.error = {
        ...t.error,
        site: t.error.site === null ? null : maskSite(t.error.site),
        type: errorType ?? t.error.type,
      };
    }
    return maskStrings(t) as TestRecord;
  });
  return copy;
};

const maskTrace = (trace: TraceFile): TraceFile => ({
  ...trace,
  inputs: trace.inputs.map((i) => ({
    ...i,
    path: basename(i.path),
    sha256: "<sha256>",
  })),
  runs: trace.runs.map((r) => ({ ...r, commit: null })),
});

const UPDATE = process.argv.includes("--update");
const onlyArg = process.argv.indexOf("--only");
const ONLY =
  onlyArg >= 0
    ? new Set((process.argv[onlyArg + 1] ?? "").split(","))
    : undefined;

/** Compare a document with its expected file, or write it with --update. */
const compare = (name: string, document: string): void => {
  const path = join(EXPECTED, name);
  if (UPDATE) {
    mkdirSync(EXPECTED, { recursive: true });
    writeFileSync(path, document);
    return;
  }
  assert(
    existsSync(path),
    `expected file ${name} is missing; run with --update`,
  );
  const expected = readFileSync(path, "utf8");
  if (expected === document) return;
  const a = expected.split("\n");
  const b = document.split("\n");
  const line = a.findIndex((l, i) => l !== b[i]);
  throw new Failure(
    `${name} differs at line ${line + 1}:\n  expected: ${a[line]}\n  actual:   ${b[line]}`,
  );
};

const readRun = (dir: string): RunFile =>
  JSON.parse(readFileSync(join(dir, "test-evidence.json"), "utf8")) as RunFile;

const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

const testById = (file: RunFile | undefined, id: string): TestRecord => {
  const test = file?.tests.find((t) => t.id === id);
  assert(test, `no record for ${id}`);
  return test as TestRecord;
};

const declarationError =
  (expectations: [string, string][]) =>
  ({ dir, output }: CheckContext): void => {
    assert(
      recordsOf(dir).length === 0,
      "a declaration error wrote files to records/",
    );
    for (const [id, word] of expectations) {
      assert(
        output
          .split("\n")
          .some((line) => line.includes(id) && line.includes(word)),
        `the runner output does not name ${id} with "${word}"`,
      );
    }
  };

const traceWith = (
  dir: string,
  args: string[],
  expectedName: string,
): { status: number; trace: TraceFile } => {
  const json = join(dir, "trace.json");
  const result = cli([
    "trace",
    join(dir, "test-evidence.json"),
    ...args,
    "--json",
    json,
    "--md",
    join(dir, "trace.md"),
  ]);
  assert(existsSync(json), `trace wrote no trace.json: ${result.output}`);
  const trace = JSON.parse(readFileSync(json, "utf8")) as TraceFile;
  const problems = Schema.trace(trace);
  assert(
    problems.length === 0,
    `trace.json is not valid: ${problems.join("; ")}`,
  );
  compare(expectedName, JsonText.document(maskTrace(trace), TRACE_SHAPE));
  return { status: result.status, trace };
};

const SCENARIOS: Scenario[] = [
  {
    name: "all-pass",
    invocations: [{ files: ["all-pass"], status: 0 }],
    merge: 0,
    trace: 0,
    expected: "all-pass",
    runners: ["node:test", "bun"],
  },
  {
    name: "failing-check-stops",
    invocations: [{ files: ["failing-check-stops"], status: 1 }],
    merge: 1,
    trace: 1,
    expected: "failing-check-stops",
    runners: ["node:test", "bun"],
  },
  {
    name: "soft-check",
    invocations: [{ files: ["soft-check"], status: 1 }],
    merge: 1,
    expected: "soft-check",
    runners: [],
  },
  {
    name: "thrown-error",
    invocations: [{ files: ["thrown-error"], status: 1 }],
    merge: 1,
    expected: "thrown-error",
    errorType: "<runtime error>",
    runners: [],
    check: ({ merged }) =>
      assert(
        testById(merged, "OQ-CONF-004").error?.type === "Error",
        "error.type is not Error",
      ),
  },
  {
    name: "plain-assertion",
    invocations: [{ files: ["plain-assertion"], status: 1 }],
    merge: 1,
    expected: "plain-assertion",
    errorType: "<assertion error>",
    runners: [],
    check: ({ merged }) =>
      assert(
        testById(merged, "OQ-CONF-005").error?.type === "AssertionError",
        "error.type is not AssertionError",
      ),
  },
  {
    name: "runtime-skip",
    invocations: [{ files: ["runtime-skip"], status: 0 }],
    merge: 0,
    trace: 0,
    expected: "runtime-skip",
    runners: ["node:test", "bun"],
    check: ({ output, runner }) => {
      if (runner === "vitest")
        assert(
          /1 skipped/.test(output),
          "vitest did not report the test as skipped",
        );
      if (runner === "node:test")
        assert(
          /skipped 1/.test(output),
          "node:test did not report the test as skipped",
        );
    },
  },
  {
    name: "policy-skip.a",
    invocations: [
      {
        files: ["policy-skip"],
        status: 0,
        env: { QUALIFY_ENVIRONMENT: "production" },
      },
    ],
    merge: 0,
    expected: "policy-skip.a",
    sites: ["policy-skip"],
    runners: [],
  },
  {
    name: "policy-skip.b",
    invocations: [
      {
        files: ["policy-skip"],
        status: 0,
        env: {
          QUALIFY_ENVIRONMENT: "production",
          QUALIFY_ALLOW_WRITE: "OQ-CONF-007=conformance override",
        },
      },
    ],
    merge: 0,
    expected: "policy-skip.b",
    sites: ["policy-skip"],
    runners: [],
  },
  {
    name: "missing-scope",
    invocations: [{ files: ["missing-scope"], status: 1 }],
    merge: -1,
    runners: [],
    check: declarationError([["OQ-CONF-008", "scope"]]),
  },
  {
    name: "bad-id",
    invocations: [{ files: ["bad-id"], status: 1 }],
    merge: -1,
    runners: [],
    check: declarationError([
      ["OQ-conf-009", "pattern"],
      ["IQ-CONF-010", "level"],
    ]),
  },
  {
    name: "secret-redaction",
    invocations: [
      {
        files: ["secret-redaction"],
        status: 1,
        env: { QUALIFY_SECRET_CONFORMANCE_TOKEN: SECRET },
      },
    ],
    merge: 1,
    expected: "secret-redaction",
    errorType: "<runtime error>",
    runners: ["node:test", "bun"],
    check: ({ dir, merged }) => {
      for (const path of filesBelow(dir)) {
        assert(
          !readFileSync(path).includes(Buffer.from(SECRET)),
          `${basename(path)} holds the secret`,
        );
      }
      const test = testById(merged, "OQ-CONF-011");
      const json = test.attachments.find((a) => a.filename === "request.json");
      assert(
        JSON.stringify(
          JSON.parse(
            Buffer.from(json?.content ?? "", "base64").toString("utf8"),
          ),
        ) ===
          JSON.stringify({
            note: "x [REDACTED]",
            token: "[REDACTED]",
            url: "/x",
          }),
        "request.json does not decode to the redacted document",
      );
      const raw = test.attachments.find((a) => a.filename === "raw.bin");
      assert(
        Buffer.from(raw?.content ?? "", "base64").equals(
          Buffer.concat([
            Buffer.from([0x00, 0xff]),
            Buffer.from("[REDACTED]"),
            Buffer.from([0x00]),
          ]),
        ),
        "raw.bin does not decode to 0x00 0xFF [REDACTED] 0x00",
      );
      assert(
        test.error?.message === "failed with [REDACTED]",
        "the error message is not redacted",
      );
    },
  },
  {
    name: "pattern-redaction",
    invocations: [{ files: ["pattern-redaction"], status: 0 }],
    merge: 0,
    expected: "pattern-redaction",
    runners: [],
    check: ({ dir }) => {
      const shapes = [
        "AK" + "IA" + "ABCDEFGHIJKLMNOP",
        "eyJhbGciOiJIUzI1NiJ9" + ".eyJ",
        "BEGIN PRIVATE" + " KEY",
      ];
      for (const path of filesBelow(dir)) {
        const text = readFileSync(path, "utf8");
        for (const shape of shapes)
          assert(
            !text.includes(shape),
            `${basename(path)} holds a secret shape`,
          );
      }
    },
  },
  {
    name: "several-requirements",
    invocations: [{ files: ["several-requirements"], status: 0 }],
    merge: 0,
    expected: "several-requirements",
    runners: [],
    check: ({ dir, merged }) => {
      const test = testById(merged, "OQ-CONF-013");
      assert(
        JSON.stringify(test.requirements) === '["REQ-1","REQ-2"]',
        "the record holds other requirements",
      );
      const { status, trace } = traceWith(
        dir,
        [
          "--map",
          join(PKG, "conformance/fixtures/several-requirements.trace.yaml"),
        ],
        "several-requirements.trace.json",
      );
      assert(status === 0, `trace exited ${status}, expected 0`);
      const rows = trace.rows.filter((r) => r.testId === "OQ-CONF-013");
      assert(
        JSON.stringify(rows.map((r) => [r.requirement, r.sources])) ===
          JSON.stringify([
            ["REQ-1", ["code"]],
            ["REQ-2", ["code"]],
            ["REQ-3", ["map"]],
          ]),
        "the trace rows of OQ-CONF-013 are not code, code and map",
      );
    },
  },
  {
    name: "narrative",
    invocations: [{ files: ["narrative"], status: 0 }],
    merge: 0,
    expected: "narrative",
    runners: [],
    check: ({ merged }) => {
      const test = testById(merged, "PQ-CONF-014");
      assert(test.given === "données d’entrée — 入力", "given changed");
      assert(test.when === "the run 🚀 starts", "when changed");
      assert(test.then === "“quoted” output", "then changed");
      assert(
        JSON.stringify(test.and) ===
          JSON.stringify(["first", "second", "third — 3"]),
        "and changed",
      );
    },
  },
  {
    name: "attachments",
    invocations: [
      { files: ["attachments"], status: 0, args: ["-t", "OQ-CONF-015"] },
      {
        files: ["attachments"],
        status: 1,
        args: ["-t", "OQ-CONF-016"],
        env: { QUALIFY_ATTACHMENT_LIMIT: "16" },
      },
    ],
    merge: 1,
    expected: "attachments",
    runners: [],
    check: ({ merged }) => {
      const passed = testById(merged, "OQ-CONF-015");
      const blob = Uint8Array.from({ length: 256 }, (_, i) => i);
      const note = passed.attachments.find((a) => a.filename === "note.txt");
      const bin = passed.attachments.find((a) => a.filename === "blob.bin");
      assert(
        note?.sizeBytes === 6 && note.sha256 === sha256("hello\n"),
        "note.txt size or digest is wrong",
      );
      assert(
        bin?.sizeBytes === 256 && bin.sha256 === sha256(blob),
        "blob.bin size or digest is wrong",
      );
      const big = testById(merged, "OQ-CONF-016");
      assert(
        big.outcome === "error" && big.error?.type === "AttachmentTooLarge",
        "OQ-CONF-016 is not AttachmentTooLarge",
      );
      assert(
        big.attachments.length === 0,
        "OQ-CONF-016 recorded an attachment",
      );
    },
  },
  {
    name: "value-normalisation",
    invocations: [{ files: ["value-normalisation"], status: 0 }],
    merge: 0,
    expected: "value-normalisation",
    runners: [],
  },
  {
    name: "duplicate-id",
    invocations: [{ files: ["duplicate-id-a", "duplicate-id-b"], status: 0 }],
    merge: 2,
    runners: [],
    sites: ["duplicate-id-a", "duplicate-id-b"],
    check: ({ dir, output }) => {
      assert(output.includes("OQ-CONF-018"), "merge did not name OQ-CONF-018");
      assert(
        !existsSync(join(dir, "test-evidence.json")),
        "merge wrote a run file",
      );
    },
  },
  {
    name: "crash",
    invocations: [{ files: ["crash"], status: "nonzero" }],
    merge: 1,
    trace: 1,
    expected: "crash",
    runners: [],
    check: ({ merged }) => {
      const test = testById(merged, "OQ-CONF-019");
      assert(
        test.error?.type === "DidNotFinish",
        "the crash is not DidNotFinish",
      );
    },
  },
  {
    name: "deselected",
    invocations: [
      { files: ["deselected"], status: 0, args: ["-t", "OQ-CONF-020"] },
    ],
    merge: 0,
    expected: "deselected",
    runners: [],
    check: ({ dir, merged }) => {
      assert(merged?.tests.length === 1, "more than one record");
      const { status, trace } = traceWith(
        dir,
        [
          "--protocol",
          join(PKG, "conformance/fixtures/deselected.protocol.yaml"),
        ],
        "deselected.trace.json",
      );
      assert(status === 3, `trace exited ${status}, expected 3`);
      assert(
        JSON.stringify(trace.notRun) === '["OQ-CONF-021"]',
        "OQ-CONF-021 is not listed as not run",
      );
      assert(
        trace.rows.some(
          (r) => r.testId === "OQ-CONF-021" && r.outcome === "not-run",
        ),
        "the matrix does not show OQ-CONF-021 as not run",
      );
    },
  },
  {
    name: "control-pair",
    invocations: [{ files: ["control-pair"], status: 0 }],
    merge: 0,
    expected: "control-pair",
    runners: [],
    check: ({ dir, merged }) => {
      assert(
        testById(merged, "OQ-CONF-023").controls === "OQ-CONF-022",
        "OQ-CONF-023 has no controls",
      );
      const { trace } = traceWith(dir, [], "control-pair.trace.json");
      const at = trace.rows.findIndex((r) => r.testId === "OQ-CONF-022");
      assert(
        at >= 0 && trace.rows[at + 1]?.testId === "OQ-CONF-023",
        "the pair is not on adjacent rows",
      );
    },
  },
];

interface Outcome {
  error?: string;
  runner: Runner;
  scenario: string;
}

const runScenario = (scenario: Scenario, runner: Runner): void => {
  const dir = mkdtempSync(join(tmpdir(), `qualify-${scenario.name}-`));
  try {
    let output = "";
    for (const invocation of scenario.invocations) {
      const result = runTests(runner, invocation, dir);
      output += result.output;
      const ok =
        invocation.status === "nonzero"
          ? result.status !== 0
          : result.status === invocation.status;
      assert(
        ok,
        `${runner} exited ${result.status}, expected ${invocation.status}\n${result.output.slice(-2000)}`,
      );
    }
    for (const name of recordsOf(dir)) {
      const valid = cli(["validate", join(dir, "records", name)]);
      assert(valid.status === 0, `${name} is not valid: ${valid.output}`);
    }
    let merged: RunFile | undefined;
    if (scenario.merge >= 0) {
      const merge = cli(["merge", "--evidence-dir", dir]);
      output += merge.output;
      assert(
        merge.status === scenario.merge,
        `merge exited ${merge.status}, expected ${scenario.merge}\n${merge.output}`,
      );
      if (existsSync(join(dir, "test-evidence.json"))) {
        merged = readRun(dir);
        const valid = cli(["validate", join(dir, "test-evidence.json")]);
        assert(
          valid.status === 0,
          `the run file is not valid: ${valid.output}`,
        );
        checkSites(
          merged,
          scenario.sites ?? scenario.invocations.flatMap((i) => i.files),
        );
      }
    }
    if (scenario.trace !== undefined) {
      const trace = cli([
        "trace",
        join(dir, "test-evidence.json"),
        "--json",
        join(dir, "exit.trace.json"),
      ]);
      assert(
        trace.status === scenario.trace,
        `trace exited ${trace.status}, expected ${scenario.trace}`,
      );
    }
    scenario.check?.({ dir, merged, output, runner });
    if (scenario.expected !== undefined) {
      assert(merged, "merge wrote no run file");
      const document = JsonText.document(
        mask(merged as RunFile, scenario.errorType),
        EVIDENCE_SHAPE,
      );
      if (runner === "vitest") compare(`${scenario.expected}.json`, document);
      else {
        const expected = readFileSync(
          join(EXPECTED, `${scenario.expected}.json`),
          "utf8",
        );
        assert(
          expected === document,
          `the ${runner} run differs from ${scenario.expected}.json`,
        );
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** Scenario 16: scenarios 1, 2 and 13 together, twice, on at least two worker threads. */
const runParallel = (): void => {
  const documents: string[] = [];
  for (let round = 0; round < 2; round++) {
    const dir = mkdtempSync(join(tmpdir(), "qualify-parallel-"));
    const log = join(dir, "workers.log");
    try {
      const result = runTests(
        "vitest",
        {
          files: ["all-pass", "failing-check-stops", "narrative"],
          status: 1,
          args: ["--pool=threads", "--maxWorkers=2"],
        },
        dir,
        log,
      );
      assert(
        result.status === 1,
        `vitest exited ${result.status}, expected 1\n${result.output.slice(-2000)}`,
      );
      const workers = new Set(readFileSync(log, "utf8").trim().split("\n"));
      assert(
        workers.size >= 2,
        `ran on ${workers.size} worker, expected at least 2`,
      );
      rmSync(log);
      const merge = cli(["merge", "--evidence-dir", dir]);
      assert(merge.status === 1, `merge exited ${merge.status}, expected 1`);
      const merged = readRun(dir);
      checkSites(merged, ["all-pass", "failing-check-stops", "narrative"]);
      documents.push(JsonText.document(mask(merged), EVIDENCE_SHAPE));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  assert(documents[0] === documents[1], "the two parallel runs differ");
  compare("parallel-determinism.json", documents[0] as string);
};

/**
 * Not a numbered scenario: without QUALIFY_RUN_ID, each runner's documented
 * setup must give every file of one invocation the same run ID. The node
 * runs use the global setup on Node 24 or later and one process on Node 22.
 */
const runSharedRunId = (runner: Runner): void => {
  const dir = mkdtempSync(join(tmpdir(), "qualify-run-id-"));
  try {
    const nodeArgs =
      NODE_MAJOR >= 24
        ? ["--test-global-setup=conformance/node/qualify.setup.ts"]
        : ["--experimental-test-isolation=none"];
    const env = scenarioEnv(dir);
    delete env.QUALIFY_RUN_ID;
    const result =
      runner === "vitest"
        ? exec(
            "node",
            [
              VITEST,
              "run",
              "--config",
              "conformance/vitest.config.ts",
              "conformance/vitest/all-pass.qualify.ts",
              "conformance/vitest/runtime-skip.qualify.ts",
            ],
            PKG,
            env,
          )
        : runner === "bun"
          ? exec(
              "bun",
              ["test", "./all-pass.test.ts", "./runtime-skip.test.ts"],
              join(PKG, "conformance/bun"),
              env,
            )
          : exec(
              "node",
              [
                ...nodeArgs,
                "--test",
                "conformance/node/all-pass.test.ts",
                "conformance/node/runtime-skip.test.ts",
              ],
              PKG,
              env,
            );
    assert(
      result.status === 0,
      `${runner} exited ${result.status}\n${result.output.slice(-2000)}`,
    );
    const ids = new Set(recordsOf(dir).map((name) => name.slice(0, 26)));
    assert(
      recordsOf(dir).length === 4,
      `expected 2 markers and 2 records, found ${recordsOf(dir).length}`,
    );
    assert(
      ids.size === 1 && !ids.has(RUN_ID),
      `the files used ${ids.size} run IDs`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const sampleArg = process.argv.indexOf("--sample");
const SAMPLE = sampleArg >= 0 ? process.argv[sampleArg + 1] : undefined;

/**
 * Scenario 21: scenarios 1, 2 and 6 as one run, merged, then rendered as a
 * PDF. The extracted text must hold the hand-written outline in order, and
 * the metadata must name the run and the run file's digest. With `--sample
 * DIR`, the PDF is kept there for the README images.
 */
const runReport = async (): Promise<void> => {
  const dir = mkdtempSync(join(tmpdir(), "qualify-report-"));
  try {
    const result = runTests(
      "vitest",
      { files: ["all-pass", "failing-check-stops", "runtime-skip"], status: 1 },
      dir,
    );
    assert(
      result.status === 1,
      `vitest exited ${result.status}, expected 1\n${result.output.slice(-2000)}`,
    );
    const merge = cli(["merge", "--evidence-dir", dir]);
    assert(merge.status === 1, `merge exited ${merge.status}, expected 1`);
    const runFile = join(dir, "test-evidence.json");
    const pdfPath = join(dir, "report.pdf");
    const report = cli(
      [
        "report",
        runFile,
        "--pdf",
        pdfPath,
        "--protocol",
        join(FIXTURES, "report.protocol.yaml"),
        "--title",
        "Conformance report",
        "--document-id",
        "CONF-RPT-001",
      ],
      { ...scenarioEnv(dir), QUALIFY_REPORT_TIME: "2026-01-02T03:04:05.006Z" },
    );
    assert(
      report.status === 0,
      `report exited ${report.status}, expected 0\n${report.output}`,
    );
    const bytes = new Uint8Array(readFileSync(pdfPath));
    const { info, lines, pages } = await extractPdf(bytes);
    const outline = readFileSync(join(EXPECTED, "report.outline.txt"), "utf8")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);
    const missing = missingFromOutline(lines, outline);
    assert(
      missing === undefined,
      `the report text does not hold "${missing}" in order`,
    );
    const digest = sha256(readFileSync(runFile));
    assert(
      info.Title === "Conformance report",
      `Title is ${String(info.Title)}`,
    );
    assert(info.Subject === RUN_ID, `Subject is ${String(info.Subject)}`);
    assert(
      String(info.Keywords).includes(`sha256:${digest}`),
      `Keywords is ${String(info.Keywords)}`,
    );
    assert(
      String(info.CreationDate).startsWith("D:20260102030405"),
      `CreationDate is ${String(info.CreationDate)}`,
    );
    for (let n = 1; n <= pages; n++) {
      assert(
        lines.some(
          (line) =>
            line.includes(`Page ${n} of ${pages}`) &&
            line.includes("CONF-RPT-001") &&
            line.includes(digest.slice(0, 12)),
        ),
        `page ${n} has no footer`,
      );
    }
    if (SAMPLE !== undefined) {
      mkdirSync(SAMPLE, { recursive: true });
      writeFileSync(join(SAMPLE, "report.pdf"), bytes);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const results: Outcome[] = [];
const attempt = async (
  scenario: string,
  runner: Runner,
  fn: () => Promise<void> | void,
): Promise<void> => {
  if (ONLY && !ONLY.has(scenario.replace(/\.[ab]$/, ""))) return;
  try {
    await fn();
    results.push({ scenario, runner });
  } catch (error) {
    results.push({
      scenario,
      runner,
      error:
        error instanceof Failure
          ? error.message
          : String((error as Error).stack ?? error),
    });
  }
};

if (!existsSync(CLI)) {
  console.error("dist/cli.js is missing: run bun run build first");
  process.exit(1);
}
const [major, minor] = (
  spawnSync("node", ["--version"], { encoding: "utf8" }).stdout ?? "v0.0"
)
  .slice(1)
  .split(".")
  .map(Number);
const NODE_MAJOR = major ?? 0;
if ((major ?? 0) < 22 || (major === 22 && (minor ?? 0) < 18)) {
  console.error(
    "the node:test scenarios need Node 22.18 or later, which loads .ts files",
  );
  process.exit(1);
}

for (const scenario of SCENARIOS) {
  await attempt(scenario.name, "vitest", () => runScenario(scenario, "vitest"));
}
await attempt("parallel-determinism", "vitest", runParallel);
await attempt("report", "vitest", runReport);
if (!UPDATE) {
  for (const runner of ["vitest", "node:test", "bun"] as const) {
    await attempt("shared-run-id", runner, () => runSharedRunId(runner));
  }
  for (const scenario of SCENARIOS) {
    for (const runner of scenario.runners) {
      await attempt(scenario.name, runner, () => runScenario(scenario, runner));
    }
  }
}

const width = Math.max(...results.map((r) => r.scenario.length));
for (const result of results) {
  console.log(
    `${result.error ? "FAIL" : "pass"}  ${result.scenario.padEnd(width)}  ${result.runner}${result.error ? `\n      ${result.error.replace(/\n/g, "\n      ")}` : ""}`,
  );
}
const failed = results.filter((r) => r.error).length;
console.log(
  `\n${results.length - failed} passed, ${failed} failed${UPDATE ? " (expected files written)" : ""}`,
);
process.exit(failed === 0 ? 0 : 1);
