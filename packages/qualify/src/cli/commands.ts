import type { ParseArgsConfig } from "node:util";

import { createHash } from "node:crypto";
import { basename, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import type { RunFile } from "../evidence";
import type { ProtocolEntry, TraceSource } from "../trace";
import type { ICliIO } from "./interfaces";

import { Envelope } from "../envelope";
import { EVIDENCE_SHAPE, EvidenceFiles } from "../evidence";
import { Runtime } from "../execution";
import { Merge } from "../merge";
import { PdfRenderer, ReportContent } from "../report";
import { Schema } from "../schema";
import { ConfigurationError, Policy, SettingsResolver } from "../settings";
import {
  Trace,
  TRACE_SHAPE,
  TraceInputError,
  TraceInputs,
  TraceMarkdown,
} from "../trace";
import { Ulid } from "../ulid";
import { JsonText } from "../values";

/** Exit codes of section 8. */
export const EXIT = {
  ok: 0,
  failed: 1,
  invalid: 2,
  incomplete: 3,
  usage: 64,
} as const;

/** The usage text. */
export const USAGE = `Usage:
  qualify merge    [--evidence-dir DIR] [--allow-runs ID,ID] [--out FILE]
  qualify validate FILE...
  qualify trace    EVIDENCE... [--protocol protocol.yaml] [--map trace.yaml]
                   [--md trace.md] [--json trace.json] [--fail-on-skip]
  qualify report   RUNFILE --pdf FILE [--protocol protocol.yaml] [--map trace.yaml]
                   [--title TEXT] [--document-id TEXT]
                   [--signatures ROLE;ROLE;...] [--no-signatures]
  qualify --help | --version

Exit codes: 0 pass, 1 fail or error, 2 invalid input, 3 incomplete, 64 usage.
`;

/** A problem with how the command was called. Exit 64. */
class UsageError extends Error {}

/** An input that cannot be used. Exit 2. */
class InputError extends Error {}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const text = (bytes: Uint8Array): string => Buffer.from(bytes).toString("utf8");

type Options = NonNullable<ParseArgsConfig["options"]>;

const parse = (
  args: string[],
  options: Options,
): {
  positionals: string[];
  values: Record<string, boolean | string | undefined>;
} => {
  try {
    const parsed = parseArgs({
      args,
      options,
      allowPositionals: true,
      strict: true,
    });
    return {
      positionals: parsed.positionals,
      values: parsed.values as Record<string, boolean | string | undefined>,
    };
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
};

/** The `qualify` commands, with all I/O through `ICliIO`. */
export class Commands {
  /** Run the CLI with arguments (without the program name). Returns the exit code. */
  static async run(argv: readonly string[], io: ICliIO): Promise<number> {
    const [command, ...rest] = argv;
    try {
      switch (command) {
        case "--help":
        case "-h":
          io.stdout(USAGE);
          return EXIT.ok;
        case "--version":
        case "-v":
          io.stdout(`${Runtime.TOOL_VERSION}\n`);
          return EXIT.ok;
        case "merge":
          return await Commands.merge(rest, io);
        case "report":
          return await Commands.report(rest, io);
        case "trace":
          return await Commands.trace(rest, io);
        case "validate":
          return await Commands.validate(rest, io);
        default:
          throw new UsageError(
            command === undefined
              ? "no command given"
              : `unknown command ${command}`,
          );
      }
    } catch (error) {
      if (error instanceof UsageError) {
        io.stderr(`qualify: ${error.message}\n\n${USAGE}`);
        return EXIT.usage;
      }
      if (
        error instanceof InputError ||
        error instanceof TraceInputError ||
        error instanceof ConfigurationError
      ) {
        io.stderr(`qualify: ${error.message}\n`);
        return EXIT.invalid;
      }
      throw error;
    }
  }

  /** The envelope of a run with no records, from this process's environment. */
  private static emptyEnvelope(io: ICliIO): ReturnType<typeof Envelope.build> {
    const settings = SettingsResolver.resolve(io.env);
    const runId = io.env.QUALIFY_RUN_ID;
    return Envelope.build({
      env: io.env,
      environment: settings.environment,
      git: io.git.read(io.cwd()),
      policy: Policy.info(settings),
      runId:
        runId !== undefined && Ulid.isValid(runId)
          ? runId
          : Ulid.create(io.now().getTime(), io.random(10)),
      tool: {
        name: Runtime.TOOL_NAME,
        version: Runtime.TOOL_VERSION,
        language: "typescript",
        runtime: `${io.runtime()}; qualify merge`,
      },
    });
  }

  /** Read and validate a protocol and a map file, when given. */
  private static async inputs(
    io: ICliIO,
    values: Record<string, boolean | string | undefined>,
  ): Promise<{
    map?: TraceSource<Map<string, string[]>>;
    protocol?: TraceSource<ProtocolEntry[]>;
  }> {
    const result: {
      map?: TraceSource<Map<string, string[]>>;
      protocol?: TraceSource<ProtocolEntry[]>;
    } = {};
    if (typeof values.protocol === "string") {
      const bytes = await Commands.read(io, values.protocol);
      result.protocol = {
        path: values.protocol,
        sha256: sha256(bytes),
        content: TraceInputs.protocol(text(bytes), values.protocol),
      };
    }
    if (typeof values.map === "string") {
      const bytes = await Commands.read(io, values.map);
      result.map = {
        path: values.map,
        sha256: sha256(bytes),
        content: TraceInputs.map(text(bytes), values.map),
      };
    }
    return result;
  }

  private static json(path: string, bytes: Uint8Array): unknown {
    try {
      return JSON.parse(text(bytes)) as unknown;
    } catch (error) {
      throw new InputError(
        `${path}: not valid JSON (${(error as Error).message})`,
      );
    }
  }

  /** Rules the schema cannot express: an ID's prefix equals its level. */
  private static levels(data: unknown): string[] {
    const file = data as {
      test?: { id: string; level: string };
      tests?: { id: string; level: string }[];
    };
    const tests = file.tests ?? (file.test ? [file.test] : []);
    return tests
      .filter((t) => !t.id.startsWith(`${t.level}-`))
      .map((t) => `test ${t.id} does not match its level ${t.level}`);
  }

  private static async merge(args: string[], io: ICliIO): Promise<number> {
    const { values, positionals } = parse(args, {
      "allow-runs": { type: "string" },
      "evidence-dir": { type: "string" },
      out: { type: "string" },
    });
    if (positionals.length > 0) {
      throw new UsageError(
        `merge takes no file arguments, got ${positionals.join(" ")}`,
      );
    }
    const allowRuns =
      typeof values["allow-runs"] === "string"
        ? values["allow-runs"]
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
        : [];
    for (const id of allowRuns) {
      if (!Ulid.isValid(id))
        throw new UsageError(`--allow-runs: ${id} is not a run ID`);
    }
    const dir = Commands.path(
      io,
      (values["evidence-dir"] as string | undefined) ??
        (io.env.QUALIFY_EVIDENCE_DIR || undefined) ??
        EvidenceFiles.DEFAULT_DIR,
    );
    const out = Commands.path(
      io,
      (values.out as string | undefined) ?? join(dir, EvidenceFiles.RUN_FILE),
    );

    const recordsDir = join(dir, "records");
    let names: string[];
    try {
      names = (await io.list(recordsDir)) ?? [];
    } catch (error) {
      throw new InputError(
        `cannot read ${recordsDir}: ${(error as Error).message}`,
      );
    }
    const inputs = [];
    for (const name of names) {
      if (name.startsWith(".")) continue;
      try {
        inputs.push({
          name,
          text: text(await io.readBytes(join(recordsDir, name))),
        });
      } catch (error) {
        throw new InputError(
          `cannot read ${name}: ${(error as Error).message}`,
        );
      }
    }

    const result = Merge.build(inputs, {
      allowRuns,
      emptyEnvelope: () => Commands.emptyEnvelope(io),
      now: () => io.now(),
    });
    if (!result.ok) {
      io.stderr(result.errors.map((e) => `qualify merge: ${e}\n`).join(""));
      io.stderr("qualify merge: no run file written\n");
      return EXIT.invalid;
    }
    const problems = Schema.evidence(result.file);
    if (problems.length > 0) {
      throw new InputError(
        `the merged run file is not valid: ${problems.join("; ")}`,
      );
    }
    const document = JsonText.document(result.file, EVIDENCE_SHAPE);
    await io.writer.write(out, document);
    await io.writer.write(
      `${out}.sha256`,
      EvidenceFiles.sidecar(document, basename(out)),
    );
    const s = result.file.summary;
    io.stdout(
      `qualify merge: ${s.total} tests, ${s.pass} pass, ${s.fail} fail, ${s.error} error, ${s.skip} skip; verdict ${s.verdict}; wrote ${out}\n`,
    );
    return result.exitCode;
  }

  private static path(io: ICliIO, path: string): string {
    return isAbsolute(path) ? path : resolve(io.cwd(), path);
  }

  private static async read(io: ICliIO, path: string): Promise<Uint8Array> {
    try {
      return await io.readBytes(Commands.path(io, path));
    } catch (error) {
      throw new InputError(`cannot read ${path}: ${(error as Error).message}`);
    }
  }

  private static async report(args: string[], io: ICliIO): Promise<number> {
    const { values, positionals } = parse(args, {
      "document-id": { type: "string" },
      map: { type: "string" },
      "no-signatures": { type: "boolean" },
      pdf: { type: "string" },
      protocol: { type: "string" },
      signatures: { type: "string" },
      title: { type: "string" },
    });
    if (positionals.length !== 1)
      throw new UsageError("report takes exactly one run file");
    if (typeof values.pdf !== "string")
      throw new UsageError("report needs --pdf FILE");
    if (values["no-signatures"] === true && values.signatures !== undefined) {
      throw new UsageError(
        "--signatures and --no-signatures exclude each other",
      );
    }
    let signatures: null | string[] = ReportContent.DEFAULT_ROLES;
    if (values["no-signatures"] === true) signatures = null;
    else if (typeof values.signatures === "string") {
      signatures = values.signatures
        .split(";")
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
      if (signatures.length === 0)
        throw new UsageError("--signatures names no role");
    }
    for (const flag of ["title", "document-id"] as const) {
      const value = values[flag];
      if (typeof value === "string" && value.trim().length === 0) {
        throw new UsageError(`--${flag} must not be empty`);
      }
    }
    const generatedAt = Commands.reportTime(io);

    const run = await Commands.runFile(io, positionals[0] as string);
    const { protocol, map } = await Commands.inputs(io, values);
    const trace = Trace.build({
      evidence: [run],
      protocol,
      map,
      failOnSkip: false,
    }).trace;
    const document = ReportContent.build({
      run: run.content,
      digest: run.sha256,
      trace,
      tool: { name: Runtime.TOOL_NAME, version: Runtime.TOOL_VERSION },
      options: {
        generatedAt,
        signatures,
        ...(typeof values.title === "string" ? { title: values.title } : {}),
        ...(typeof values["document-id"] === "string"
          ? { documentId: values["document-id"] }
          : {}),
      },
    });
    const pdf = await PdfRenderer.render(document, await io.fonts());
    const out = Commands.path(io, values.pdf);
    await io.writer.write(out, pdf);
    io.stdout(
      `qualify report: wrote ${out}; run verdict ${run.content.summary.verdict}\n`,
    );
    return EXIT.ok;
  }

  /** The generation time: `QUALIFY_REPORT_TIME` when set, else now. */
  private static reportTime(io: ICliIO): Date {
    const value = io.env.QUALIFY_REPORT_TIME;
    if (value === undefined || value.length === 0) return io.now();
    const time = new Date(value);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) ||
      Number.isNaN(time.getTime())
    ) {
      throw new InputError(
        `QUALIFY_REPORT_TIME must be a UTC instant such as 2026-01-02T03:04:05.006Z, got ${value}`,
      );
    }
    return time;
  }

  /** Read a run file: its bytes, its digest, and its validated content. */
  private static async runFile(
    io: ICliIO,
    path: string,
  ): Promise<TraceSource<RunFile>> {
    const bytes = await Commands.read(io, path);
    await Commands.sidecar(io, path, bytes);
    const data = Commands.json(path, bytes);
    const problems = Schema.evidence(data);
    if (problems.length > 0)
      throw new InputError(`${path}: ${problems.join("; ")}`);
    if ((data as { kind: string }).kind !== "run") {
      throw new InputError(
        `${path}: expected a run file; run qualify merge first`,
      );
    }
    return { path, sha256: sha256(bytes), content: data as RunFile };
  }

  /** Check a `.sha256` sidecar next to a file, when there is one. */
  private static async sidecar(
    io: ICliIO,
    path: string,
    bytes: Uint8Array,
  ): Promise<void> {
    let sidecar: Uint8Array;
    try {
      sidecar = await io.readBytes(`${Commands.path(io, path)}.sha256`);
    } catch {
      return;
    }
    const recorded = text(sidecar).trim().split(/\s+/)[0];
    if (recorded !== sha256(bytes)) {
      throw new InputError(
        `${path}: the SHA-256 does not match ${path}.sha256`,
      );
    }
  }

  private static async trace(args: string[], io: ICliIO): Promise<number> {
    const { values, positionals } = parse(args, {
      "fail-on-skip": { type: "boolean" },
      json: { type: "string" },
      map: { type: "string" },
      md: { type: "string" },
      protocol: { type: "string" },
    });
    if (positionals.length === 0)
      throw new UsageError("trace needs at least one evidence file");

    const evidence: TraceSource<RunFile>[] = [];
    const runs = new Set<string>();
    for (const path of positionals) {
      const file = await Commands.runFile(io, path);
      if (runs.has(file.content.run.id)) {
        throw new InputError(
          `${path}: run ${file.content.run.id} is given twice`,
        );
      }
      runs.add(file.content.run.id);
      evidence.push(file);
    }
    const { protocol, map } = await Commands.inputs(io, values);

    const result = Trace.build({
      evidence,
      protocol,
      map,
      failOnSkip: values["fail-on-skip"] === true,
    });
    const problems = Schema.trace(result.trace);
    if (problems.length > 0) {
      throw new InputError(`the trace is not valid: ${problems.join("; ")}`);
    }
    const markdown = TraceMarkdown.render(result.trace);
    if (typeof values.md === "string")
      await io.writer.write(Commands.path(io, values.md), markdown);
    if (typeof values.json === "string") {
      await io.writer.write(
        Commands.path(io, values.json),
        JsonText.document(result.trace, TRACE_SHAPE),
      );
    }
    if (typeof values.md !== "string" && typeof values.json !== "string")
      io.stdout(markdown);
    const s = result.trace.summary;
    io.stderr(
      `qualify trace: ${s.tests} tests, ${s.notRun} not run, ${s.requirementsWithoutPass} requirements without a passing test; verdict ${s.verdict}\n`,
    );
    return result.exitCode;
  }

  private static async validate(args: string[], io: ICliIO): Promise<number> {
    const { positionals } = parse(args, {});
    if (positionals.length === 0)
      throw new UsageError("validate needs at least one file");
    let invalid = 0;
    for (const path of positionals) {
      try {
        const bytes = await Commands.read(io, path);
        await Commands.sidecar(io, path, bytes);
        const data = Commands.json(path, bytes);
        const kind = (data as { kind?: unknown } | null)?.kind;
        const problems =
          kind === "trace" ? Schema.trace(data) : Schema.evidence(data);
        if (problems.length === 0 && kind !== "trace") {
          problems.push(...Commands.levels(data));
        }
        if (problems.length > 0)
          throw new InputError(`${path}: ${problems.join("; ")}`);
        io.stdout(`valid: ${path}\n`);
      } catch (error) {
        if (!(error instanceof InputError)) throw error;
        invalid++;
        io.stderr(`qualify validate: ${error.message}\n`);
      }
    }
    return invalid === 0 ? EXIT.ok : EXIT.invalid;
  }
}
