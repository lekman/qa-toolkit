import { createHash } from "node:crypto";

import type {
  AttachmentRecord,
  RecordFile,
  RunFile,
  RunFileInfo,
  RunInfo,
  RunSummary,
  StartedFile,
  TestRecord,
} from "../evidence";
import type { JsonValue } from "../values";
import type { MergeInput, MergeOptions, MergeResult } from "./types";

import { EvidenceFiles } from "../evidence";
import { Redaction } from "../redaction";
import { Schema } from "../schema";
import { Values } from "../values";

interface Pair {
  marker?: { file: StartedFile; name: string };
  record?: { file: RecordFile; name: string };
}

const AGREE = ["environment", "source", "policy"] as const;

const minimum = (values: string[]): string =>
  values.reduce((a, b) => (b < a ? b : a));
const maximum = (values: string[]): string =>
  values.reduce((a, b) => (b > a ? b : a));

/** `qualify merge`: builds the run file from records and markers, section 6.5. */
export class Merge {
  /** Merge the files of one records directory. Pure: the caller reads and writes. */
  static build(
    inputs: readonly MergeInput[],
    options: MergeOptions,
  ): MergeResult {
    const errors: string[] = [];
    const pairs = new Map<string, Pair>();

    for (const input of [...inputs].sort((a, b) =>
      Values.compare(a.name, b.name),
    )) {
      if (input.name.startsWith(".")) continue;
      const parsed = EvidenceFiles.parse(input.name);
      if (parsed === undefined) {
        errors.push(
          `${input.name}: not a record or marker name (<runId>__<testId>__<key>.json or .started)`,
        );
        continue;
      }
      let data: unknown;
      try {
        data = JSON.parse(input.text);
      } catch (error) {
        errors.push(
          `${input.name}: not valid JSON (${(error as Error).message})`,
        );
        continue;
      }
      const problems = Schema.evidence(data);
      if (problems.length > 0) {
        errors.push(...problems.map((p) => `${input.name}: ${p}`));
        continue;
      }
      const file = data as RecordFile | StartedFile;
      const expectedKind = parsed.kind === "started" ? "started" : "record";
      if (file.kind !== expectedKind) {
        errors.push(
          `${input.name}: holds a ${file.kind} file, not a ${expectedKind}`,
        );
        continue;
      }
      if (file.run.id !== parsed.runId || file.test.id !== parsed.testId) {
        errors.push(
          `${input.name}: the name does not match run ${file.run.id} and test ${file.test.id}`,
        );
        continue;
      }
      if (!file.test.id.startsWith(`${file.test.level}-`)) {
        errors.push(
          `${input.name}: test ${file.test.id} does not match its level ${file.test.level}`,
        );
        continue;
      }
      const pair = pairs.get(parsed.stem) ?? {};
      if (file.kind === "started") pair.marker = { file, name: input.name };
      else pair.record = { file, name: input.name };
      pairs.set(parsed.stem, pair);
    }
    if (errors.length > 0) return { ok: false, exitCode: 2, errors };

    const all = [...pairs.values()].flatMap((p) =>
      [p.marker, p.record].filter((x) => x !== undefined),
    ) as { file: RecordFile | StartedFile; name: string }[];

    const runCheck = Merge.runs(all, options.allowRuns);
    if (typeof runCheck === "string")
      return { ok: false, exitCode: 2, errors: [runCheck] };

    errors.push(...Merge.duplicates(pairs), ...Merge.disagreements(all));
    if (errors.length > 0) return { ok: false, exitCode: 2, errors };

    const tests = [...pairs.values()]
      .map((pair) => Merge.test(pair))
      .sort((a, b) => Values.compare(a.id, b.id));

    const run = Merge.envelope(all, runCheck, tests, options);
    const summary = Merge.summary(tests);
    const file: RunFile = {
      schemaVersion: 1,
      kind: "run",
      run,
      summary,
      tests,
    };
    const exitCode =
      summary.verdict === "fail" ? 1 : summary.verdict === "incomplete" ? 3 : 0;
    return { ok: true, exitCode, file };
  }

  /** Counts and verdict: fail on any fail or error, incomplete with no tests. */
  static summary(tests: readonly TestRecord[]): RunSummary {
    const count = (outcome: TestRecord["outcome"]): number =>
      tests.filter((t) => t.outcome === outcome).length;
    const fail = count("fail");
    const error = count("error");
    return {
      total: tests.length,
      pass: count("pass"),
      fail,
      error,
      skip: count("skip"),
      verdict:
        fail + error > 0 ? "fail" : tests.length === 0 ? "incomplete" : "pass",
    };
  }

  /** Apply the pattern rules again, decoding attachments to redact their bytes. */
  private static defend(test: TestRecord): TestRecord {
    const { attachments, ...rest } = test;
    const redacted = Redaction.value(
      rest as unknown as JsonValue,
      [],
    ) as unknown as TestRecord;
    redacted.attachments = attachments.map((attachment): AttachmentRecord => {
      const bytes = new Uint8Array(Buffer.from(attachment.content, "base64"));
      const clean = Redaction.bytes(bytes, []);
      if (clean === bytes) return { ...attachment };
      return {
        ...attachment,
        content: Buffer.from(clean).toString("base64"),
        sizeBytes: clean.byteLength,
        sha256: createHash("sha256").update(clean).digest("hex"),
      };
    });
    return redacted;
  }

  private static disagreements(
    all: readonly { file: RecordFile | StartedFile; name: string }[],
  ): string[] {
    const first = all[0];
    if (first === undefined) return [];
    const errors: string[] = [];
    for (const field of AGREE) {
      const expected = Values.key(
        first.file.run[field] as unknown as JsonValue,
      );
      const other = all.find(
        (f) =>
          Values.key(f.file.run[field] as unknown as JsonValue) !== expected,
      );
      if (other) {
        errors.push(
          `the run envelopes disagree on ${field}: ${first.name} and ${other.name}`,
        );
      }
    }
    return errors;
  }

  private static duplicates(pairs: Map<string, Pair>): string[] {
    const byId = new Map<string, string[]>();
    for (const [stem, pair] of pairs) {
      const id = (pair.record?.file.test.id ??
        pair.marker?.file.test.id) as string;
      byId.set(id, [...(byId.get(id) ?? []), stem]);
    }
    return [...byId]
      .filter(([, stems]) => stems.length > 1)
      .map(
        ([id, stems]) =>
          `test ID ${id} appears ${stems.length} times in the run (${stems.join(", ")}); an ID must be unique within a run`,
      );
  }

  private static envelope(
    all: readonly { file: RecordFile | StartedFile; name: string }[],
    primary: { merged: string[]; primary: string | undefined },
    tests: readonly TestRecord[],
    options: MergeOptions,
  ): RunFileInfo {
    const ofPrimary = all
      .filter((f) => f.file.run.id === primary.primary)
      .sort((a, b) => Values.compare(a.file.test.id, b.file.test.id));
    const source: RunInfo = ofPrimary[0]?.file.run ?? options.emptyEnvelope();
    const { selection, ...base } = source;
    const now = options.now().toISOString();
    const run: RunFileInfo = Redaction.value(
      base as unknown as JsonValue,
      [],
    ) as unknown as RunFileInfo;
    const selections = new Set(
      all.map((f) =>
        Values.key((f.file.run.selection ?? null) as unknown as JsonValue),
      ),
    );
    if (selection !== undefined && selections.size === 1)
      run.selection = selection;
    run.startedAt =
      tests.length > 0 ? minimum(tests.map((t) => t.startedAt)) : now;
    run.endedAt = tests.length > 0 ? maximum(tests.map((t) => t.endedAt)) : now;
    if (primary.merged.length > 0) run.mergedRuns = primary.merged;
    return run;
  }

  private static runs(
    all: readonly { file: RecordFile | StartedFile; name: string }[],
    allowRuns: readonly string[],
  ): string | { merged: string[]; primary: string | undefined } {
    const ids = [...new Set(all.map((f) => f.file.run.id))].sort(
      Values.compare,
    );
    const primaries = ids.filter((id) => !allowRuns.includes(id));
    if (primaries.length > 1) {
      return `records come from more than one run (${primaries.join(", ")}); name the runs to merge in with --allow-runs`;
    }
    if (primaries.length === 0 && ids.length > 0) {
      return "--allow-runs names every run in the directory; leave the main run out";
    }
    return {
      primary: primaries[0],
      merged: ids.filter((id) => id !== primaries[0]),
    };
  }

  private static test(pair: Pair): TestRecord {
    if (pair.record) return Merge.defend(pair.record.file.test);
    const { startedAt, ...declaration } = (pair.marker as { file: StartedFile })
      .file.test;
    return Merge.defend({
      ...declaration,
      outcome: "error",
      error: {
        type: "DidNotFinish",
        message: "test started and did not finish",
        site: null,
      },
      startedAt,
      endedAt: startedAt,
      durationMs: 0,
      checks: [],
      attachments: [],
      secretsUsed: [],
    });
  }
}
