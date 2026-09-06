#!/usr/bin/env node
/**
 * data-sampler command line entrypoint.
 *
 * Wiring only: argument parsing, dataset module loading, sink selection and
 * exit codes. Everything that decides what a record looks like lives in the
 * library and is covered by tests; this file is excluded from coverage.
 *
 * Exit codes: 0 success; 1 usage, DatasetError or SpreadError (message only);
 * 2 any other error (with stack).
 */

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import type { Weights } from "./grade";
import type { IOutputSink } from "./output";
import type { DatasetDefinition, SampleOptions } from "./sampler";

import { Spread } from "./grade";
import { FileSink, Ndjson, StdoutSink } from "./output";
import { Dataset, DatasetError, Sampler, SpreadError } from "./sampler";

const USAGE = `Usage:
  data-sampler generate --dataset <path> --count <n> [--spread <text>] [--seed <n>]
                        [--out <file>] [--format ndjson|json] [--no-meta]
  data-sampler plan     --dataset <path> --count <n> [--spread <text>] [--seed <n>]
  data-sampler --help | --version

Options:
  --dataset   Path to a TypeScript or JavaScript module whose default export is a dataset
  --count     Number of records to generate
  --spread    Override the dataset's spread, e.g. normal:0.9,ill:0.1 or normal:90,ill:10
  --seed      Seed for a reproducible run; drawn and printed to stderr when omitted
  --out       Write to a file instead of stdout
  --format    ndjson (default, one record per line) or json (one array document)
  --no-meta   Omit the _meta { grade, index, seed } property from every record
`;

/** A problem with how the command was invoked. Reported without a stack. */
class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

const version = (): string => {
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version: string };
  return pkg.version;
};

const parseCount = (text: string | undefined): number => {
  if (text === undefined) throw new UsageError("--count is required");
  const count = Number(text);
  if (!Number.isInteger(count) || count < 0) {
    throw new UsageError(
      `--count must be a non-negative integer, got "${text}"`,
    );
  }
  return count;
};

const parseSeed = (text: string | undefined): number | undefined => {
  if (text === undefined) return undefined;
  const seed = Number(text);
  if (!Number.isInteger(seed))
    throw new UsageError(`--seed must be an integer, got "${text}"`);
  return seed;
};

const loadDataset = async (
  path: string | undefined,
): Promise<DatasetDefinition<unknown>> => {
  if (path === undefined) throw new UsageError("--dataset is required");
  const url = pathToFileURL(resolve(process.cwd(), path)).href;
  const module = (await import(url)) as { default?: unknown };
  const candidate = module.default as
    Partial<DatasetDefinition<unknown>> | undefined;
  if (
    candidate === undefined ||
    candidate === null ||
    typeof candidate !== "object" ||
    !Array.isArray(candidate.grades) ||
    typeof candidate.fields !== "object"
  ) {
    throw new UsageError(
      `${path} must default-export a dataset definition (see Dataset.define)`,
    );
  }
  return Dataset.define(candidate as DatasetDefinition<unknown>);
};

const planTable = (
  dataset: DatasetDefinition<unknown>,
  weights: Weights,
  options: SampleOptions,
): string => {
  const { allocation, seed } = Sampler.plan(dataset, options);
  const width = Math.max(5, ...dataset.grades.map((g) => g.length));
  const lines = [`seed: ${seed}`, `${"grade".padEnd(width)}  weight  count`];
  for (const grade of dataset.grades) {
    const weight = (weights[grade] ?? 0).toFixed(2).padStart(6);
    lines.push(
      `${grade.padEnd(width)}  ${weight}  ${String(allocation[grade] ?? 0).padStart(5)}`,
    );
  }
  return `${lines.join("\n")}\n`;
};

const main = async (argv: string[]): Promise<number> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args: argv,
    options: {
      count: { type: "string" },
      dataset: { type: "string" },
      format: { type: "string" },
      help: { short: "h", type: "boolean" },
      "no-meta": { type: "boolean" },
      out: { type: "string" },
      seed: { type: "string" },
      spread: { type: "string" },
      version: { short: "v", type: "boolean" },
    },
  });

  if (values.version) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }
  const command = positionals[0];
  if (values.help || command === undefined) {
    process.stdout.write(USAGE);
    return values.help ? 0 : 1;
  }
  if (command !== "generate" && command !== "plan") {
    throw new UsageError(`unknown command "${command}"\n\n${USAGE}`);
  }

  const dataset = await loadDataset(values.dataset);
  const spread =
    values.spread === undefined ? undefined : Spread.parse(values.spread);
  const options: SampleOptions = {
    count: parseCount(values.count),
    seed: parseSeed(values.seed),
    spread,
  };
  const weights = spread
    ? Spread.validate(spread, dataset.grades)
    : dataset.spread;

  if (command === "plan") {
    process.stdout.write(planTable(dataset, weights, options));
    return 0;
  }

  const format = values.format ?? "ndjson";
  if (format !== "ndjson" && format !== "json") {
    throw new UsageError(`--format must be ndjson or json, got "${format}"`);
  }
  const { seed } = Sampler.plan(dataset, options);
  process.stderr.write(`seed: ${seed}\n`);
  const encode = { meta: !values["no-meta"], seed };
  const sink: IOutputSink =
    values.out === undefined ? new StdoutSink() : new FileSink(values.out);
  try {
    const records = Sampler.records(dataset, { ...options, seed });
    if (format === "json") {
      await sink.write(Ndjson.document(records, encode));
    } else {
      for (const record of records)
        await sink.write(Ndjson.line(record, encode));
    }
  } finally {
    await sink.close();
  }
  return 0;
};

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (
      error instanceof UsageError ||
      error instanceof DatasetError ||
      error instanceof SpreadError
    ) {
      process.stderr.write(`${error.name}: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    // parseArgs reports unknown or malformed options as a TypeError with a code.
    if (
      error instanceof TypeError &&
      "code" in error &&
      String(error.code).startsWith("ERR_PARSE_ARGS")
    ) {
      process.stderr.write(`${error.message}\n\n${USAGE}`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 2;
  },
);
