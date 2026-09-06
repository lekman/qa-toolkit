# qat-002: data-sampler Package

> **Status:** Dispatched | **Date:** 2026-09-06 | **Author:** planning session (Claude chat) | **Keys:** qat-002

## Context

The operator previously used `@faker-js/faker` to generate random JSON
payloads for base data loads and for unit and integration tests. What was
missing was a layer that decides, before generating, whether a record is a
normal case or an outlier, and lets the caller choose the spread: "1000
patients, 90% normal, 10% ill". This package is that layer. It is a library
first (consumers call it from their own test suites) and a CLI second (base
data loads, fixture files).

This brief is gated by qat-001 (repository scaffold merged, CI green). It
produces one pull request on branch `feat/data-sampler` and leaves
`@lekman/data-sampler` 0.1.0 buildable and tested but not published.

## Already Done, Do Not Redo

From qat-001, verify these exist on `main` before starting; do not recreate
them:

- `packages/data-sampler/package.json`, `tsconfig.json`, `bunfig.toml`,
  `scripts/build.ts`, `.gitignore`.
- Root ESLint, trunk, commitlint, release-please and `.claude/rules/`.

Delete `packages/data-sampler/tests/placeholder.test.ts` as the first change.
Replace the placeholder `src/index.ts`, `src/cli.ts` and `README.md`.

## Design

### Vocabulary

- **Grade**: a named classification of a record, for example `normal`,
  `warning`, `ill`, `impossible`. Grades are strings chosen by the dataset
  author.
- **Scale**: the ordered list of grades a dataset knows, ascending severity.
  The order matters for tie-breaking in allocation and for consumers who want
  "at most warning".
- **Spread**: weights per grade that sum to 1 (or to 100, accepted as
  percentages).
- **Allocation**: the exact integer count per grade for a run.
- **Dataset**: a named scale, a default spread, and one field specification
  per output property.
- **Field generator**: a function that produces one field value for one
  record, given the record's grade. Typed `FieldGenerator`, to avoid clashing
  with the built-in `Generator` iterator type that `Sampler.records` returns.

Generation is classification-first: the grade of every record is fixed by the
allocation and a seeded shuffle before any value is produced. Field generators
then produce values that satisfy that grade.

### Module Layout

Follow `.claude/rules/clean-architecture.md`: one folder per domain, a
`types.ts`, an `interfaces.ts` where a port exists, business logic as static
classes, an `index.ts` barrel, and `*.system.ts` only for I/O.

```text
packages/data-sampler/
  src/
    index.ts                     Library barrel
    cli.ts                       CLI entrypoint (wiring only, excluded from coverage)
    grade/
      index.ts
      types.ts                   Grade, GradeScale, Weights, Allocation
      spread.ts                  class Spread: parse, validate, allocate, sequence
    sampler/
      index.ts
      types.ts                   GenerateContext, FieldSpec, DatasetDefinition, SampleOptions, SampledRecord, SampleRun
      interfaces.ts              IRandom
      dataset.ts                 class Dataset: define (validates)
      distribution.ts            class Distribution: normal, band, outside, integer
      sampler.ts                 class Sampler: records (generator), run (collect)
      errors.ts                  DatasetError, SpreadError
    faker/
      index.ts
      random.ts                  class FakerRandom implements IRandom
      faker.ts                   class Fakers: seeded(seed) factory
    output/
      index.ts
      types.ts                   EncodeOptions
      interfaces.ts              IOutputSink
      ndjson.ts                  class Ndjson: line, document (pure)
      output.system.ts           StdoutSink, FileSink (node:fs)
  examples/
    patient.ts                   Reference dataset with four grades
  tests/
    grade/spread.test.ts
    sampler/dataset.test.ts
    sampler/distribution.test.ts
    sampler/sampler.test.ts
    faker/random.test.ts
    output/ndjson.test.ts
    examples/patient.test.ts     Integration: full run with a fixed seed
    mocks/random.mock.ts         ScriptedRandom: replays a fixed sequence
  README.md
  CONTRIBUTING.md
```

`@faker-js/faker` is deterministic and makes no system calls, so `faker/` is
ordinary business code, covered by tests. Only `output/output.system.ts`
touches I/O.

### Types

```typescript
// grade/types.ts
export type Grade = string;
export type GradeScale = readonly Grade[];
export type Weights = Readonly<Record<Grade, number>>;
export type Allocation = Readonly<Record<Grade, number>>;

// sampler/interfaces.ts
/** Source of uniform random numbers in [0, 1). Everything else derives from it. */
export interface IRandom {
  next(): number;
}

// sampler/types.ts
import type { Faker } from "@faker-js/faker";

export interface GenerateContext<T> {
  faker: Faker;
  grade: Grade;
  index: number;
  random: IRandom;
  /** Fields generated so far for this record, in declaration order. */
  record: Readonly<Partial<T>>;
  scale: GradeScale;
}

export type FieldGenerator<T, V> = (ctx: GenerateContext<T>) => V;

/** One generator per grade, or a `default` used for every grade not listed. */
export type FieldSpec<T, V> = {
  readonly default?: FieldGenerator<T, V>;
} & {
  readonly [grade: Grade]: FieldGenerator<T, V> | undefined;
};

export interface DatasetDefinition<T> {
  name: string;
  grades: GradeScale;
  spread: Weights;
  fields: { readonly [K in keyof T]-?: FieldSpec<T, T[K]> };
}

export interface SampleOptions {
  count: number;
  seed?: number;
  spread?: Weights;
}

export interface SampledRecord<T> {
  data: T;
  grade: Grade;
  index: number;
}

export interface SampleRun<T> {
  allocation: Allocation;
  records: SampledRecord<T>[];
  seed: number;
}
```

A grade may not be named `default`; `Dataset.define` rejects it. Field
generation order is the key order of `fields`, which is JavaScript insertion
order; document this in the README because `dischargedAt` depending on
`admittedAt` relies on it.

### Spread

```typescript
export class Spread {
  /** "normal:0.9,ill:0.1" or "normal:90,ill:10". Throws SpreadError. */
  static parse(text: string): Weights;

  /** Weights are non-negative, sum to 1 within 1e-9 (a sum near 100 is scaled), every key is in the scale. */
  static validate(weights: Weights, scale: GradeScale): Weights;

  /** Exact integer counts: floor each, hand out the remainder by largest fractional part, ties to the earlier grade in the scale. Sum equals count. Grades in the scale but absent from weights get 0. */
  static allocate(
    weights: Weights,
    count: number,
    scale: GradeScale,
  ): Allocation;

  /** Expand the allocation to a grade per index and Fisher-Yates shuffle it with `random`. */
  static sequence(
    allocation: Allocation,
    scale: GradeScale,
    random: IRandom,
  ): Grade[];
}
```

### Dataset and Sampler

```typescript
export class Dataset {
  /** Validates and returns a frozen definition. Throws DatasetError on: empty or duplicate grades, a grade named "default", spread keys outside the scale, weights that do not sum to 1, any field with no generator for some grade and no default. */
  static define<T>(definition: DatasetDefinition<T>): DatasetDefinition<T>;
}
export const defineDataset = Dataset.define;

export class Sampler {
  /** Lazily yields records. Seeds one Faker instance from `options.seed`; if absent, draws a seed from crypto and reports it in the first yielded run header. */
  static *records<T>(
    dataset: DatasetDefinition<T>,
    options: SampleOptions,
  ): Generator<SampledRecord<T>, void>;

  /** Collects `records` into a SampleRun. Convenience for tests and small fixtures. */
  static run<T>(
    dataset: DatasetDefinition<T>,
    options: SampleOptions,
  ): SampleRun<T>;

  /** Allocation and seed without generating anything. Used by the CLI `plan` command. */
  static plan<T>(
    dataset: DatasetDefinition<T>,
    options: SampleOptions,
  ): { allocation: Allocation; seed: number };
}
```

Seed handling: `Sampler.plan` resolves the seed once (given or drawn) and both
`records` and `run` use `plan`. One `Faker` instance is created per run via
`Fakers.seeded(seed)` and one `FakerRandom` wraps it, so the grade shuffle and
every field value draw from a single seeded stream. Same dataset, count,
spread and seed produce byte-identical output.

If the generator design makes the "report the seed" part of `records` awkward,
have `records` accept a resolved seed only and let `run` and the CLI call
`plan` first. Keep the public behaviour: the CLI always prints
`seed: <n>` to stderr.

### Distribution

```typescript
export class Distribution {
  /** Box-Muller over two uniform draws. */
  static normal(random: IRandom, mean: number, sd: number): number;
  /** Uniform in [min, max]. */
  static band(random: IRandom, min: number, max: number): number;
  /** Uniform in [limits.min, min) or (max, limits.max]; picks the side by a third draw, weighted by width. Throws if neither side has width. */
  static outside(
    random: IRandom,
    min: number,
    max: number,
    limits: { min: number; max: number },
  ): number;
  /** Integer in [min, max] inclusive. */
  static integer(random: IRandom, min: number, max: number): number;
  /** Clamp helper for tails of a normal draw. */
  static clamp(value: number, min: number, max: number): number;
}
```

### Faker

```typescript
export class Fakers {
  /** new Faker({ locale: [en] }) seeded with `seed`. */
  static seeded(seed: number): Faker;
}

export class FakerRandom implements IRandom {
  constructor(private readonly faker: Faker) {}
  /** faker.number.int({ min: 0, max: 2 ** 32 - 1 }) / 2 ** 32, so the result is in [0, 1) and never 1. */
  next(): number;
}
```

### Output

```typescript
export interface EncodeOptions {
  meta: boolean;
  seed: number;
}

export class Ndjson {
  /** One JSON object per line, newline terminated. With meta, adds `_meta: { grade, index, seed }` as the first key. */
  static line<T>(record: SampledRecord<T>, options: EncodeOptions): string;
  /** A JSON array document, pretty-printed with two spaces. */
  static document<T>(
    records: Iterable<SampledRecord<T>>,
    options: EncodeOptions,
  ): string;
}

export interface IOutputSink {
  write(chunk: string): Promise<void>;
  close(): Promise<void>;
}
// output.system.ts: StdoutSink (process.stdout), FileSink (node:fs createWriteStream, mkdir -p the parent)
```

### CLI

Parsing with `parseArgs` from `node:util`. Two subcommands:

```text
data-sampler generate --dataset <path> --count <n> [--spread <text>] [--seed <n>]
                      [--out <file>] [--format ndjson|json] [--no-meta]
data-sampler plan     --dataset <path> --count <n> [--spread <text>] [--seed <n>]
data-sampler --help | --version
```

- `--dataset` is resolved from the working directory and loaded with
  `await import(pathToFileURL(path).href)`. The module must `export default`
  a `DatasetDefinition` (the result of `Dataset.define`). Anything else is a
  usage error.
- `--spread` overrides the dataset default. `--seed` omitted draws one.
- `generate` streams `Ndjson.line` to the sink for `ndjson`; for `json` it
  collects and writes `Ndjson.document`. Default sink is stdout; `--out`
  writes a file.
- `plan` prints the resolved seed and a table of grade, weight, count to
  stdout and exits 0.
- Always print `seed: <n>` to stderr for `generate`, so a run is reproducible
  even when the seed was drawn.
- Exit codes: 0 success; 1 usage, `DatasetError` or `SpreadError`, with the
  message only (no stack trace) on stderr; 2 any other error, with stack.
- Library barrel `src/index.ts` exports: `Dataset`, `defineDataset`,
  `Sampler`, `Spread`, `Distribution`, `Fakers`, `FakerRandom`, `Ndjson`,
  `DatasetError`, `SpreadError`, and every type above.

### Reference Dataset: examples/patient.ts

Grades `["normal", "warning", "ill", "impossible"]`, default spread
`{ normal: 0.7, warning: 0.15, ill: 0.1, impossible: 0.05 }`. The bands are
illustrative test data, not clinical guidance; say so in a file comment and in
the README.

| Field          | Type               | normal                                      | warning                  | ill                      | impossible                    |
| -------------- | ------------------ | ------------------------------------------- | ------------------------ | ------------------------ | ----------------------------- |
| `id`           | string             | `faker.string.uuid()` (default)             |                          |                          |                               |
| `givenName`    | string             | `faker.person.firstName()` (default)        |                          |                          |                               |
| `familyName`   | string             | `faker.person.lastName()` (default)         |                          |                          |                               |
| `age`          | integer            | `integer(18, 90)` (default)                 |                          |                          | pick of `-3`, `190`           |
| `heartRate`    | integer (bpm)      | `normal(72, 8)` clamped 55..95, rounded     | 96..120 or 45..54        | 121..180 or 30..44       | pick of `-20`, `999`          |
| `systolicBp`   | integer (mmHg)     | `normal(118, 10)` clamped 95..135           | 136..159 or 85..94       | 160..220 or 60..84       | pick of `0`, `500`            |
| `temperatureC` | number (1 decimal) | `normal(36.7, 0.3)` clamped 36.1..37.2      | 37.3..38.4 or 35.0..36.0 | 38.5..41.0 or 32.0..34.9 | pick of `15.0`, `60.0`        |
| `spo2`         | integer (%)        | 95..100                                     | 90..94                   | 70..89                   | pick of `120`, `-5`           |
| `admittedAt`   | ISO string         | `faker.date.recent({ days: 30 })` (default) |                          |                          |                               |
| `dischargedAt` | ISO string         | `admittedAt` plus 0..14 days (default)      |                          |                          | `admittedAt` minus 1..30 days |

"a..b or c..d" means: choose the side with `random.next() < 0.5`, then
`band` inside it. `dischargedAt` reads `ctx.record.admittedAt`.

Also export from the example a small validator for the integration test:
`isPlausible(patient): boolean` returns false when any vital is outside the
physical limits used by `impossible` or `dischargedAt < admittedAt`. Put it in
`examples/patient.ts` under the default export so the example stays one file.

## Steps

Work test-first: write the test file, watch it fail, implement, watch it pass,
then move on. Commit per module.

1. **Branch and clean up.** `git checkout -b feat/data-sampler`. Delete
   `tests/placeholder.test.ts`. Run `bun install` so `@faker-js/faker`
   resolves. Expected: `bun test` reports no tests.

2. **grade/**. Tests in `tests/grade/spread.test.ts`:
   - `parse("normal:0.9,ill:0.1")` returns `{ normal: 0.9, ill: 0.1 }`;
     `parse("normal:90,ill:10")` returns the same after `validate`.
   - `parse` rejects `""`, `"normal"`, `"normal:x"`, `"normal:0.5,normal:0.5"`.
   - `validate` rejects a negative weight, a sum of 0.95, a key not in the
     scale, and a key named `default`.
   - `allocate({ normal: 0.9, ill: 0.1 }, 1000, scale)` returns exactly
     `{ normal: 900, warning: 0, ill: 100, impossible: 0 }`.
   - `allocate` of three equal thirds over 10 returns counts summing to 10
     with the remainder going to the earlier grades.
   - `allocate({ a: 0.5, b: 0.5 }, 1, ["a", "b"])` returns `{ a: 1, b: 0 }`.
   - `sequence` with a `ScriptedRandom` returns a deterministic order and
     preserves counts.
     Expected: 8 or more passing tests, `Spread` complete.

3. **tests/mocks/random.mock.ts**. `ScriptedRandom implements IRandom`,
   constructed with a `number[]`, cycles through it. Used by grade, sampler
   and distribution tests so they do not depend on faker.

4. **sampler/dataset.ts and errors.ts**. Tests in
   `tests/sampler/dataset.test.ts` cover every rejection listed under
   `Dataset.define` and one accepting case using `default` fallback. Expected:
   the returned definition is frozen (`Object.isFrozen`).

5. **sampler/distribution.ts**. Tests in `tests/sampler/distribution.test.ts`:
   - `band(ScriptedRandom([0]), 10, 20)` returns 10; with `[0.999999]` returns
     a value below 20 and above 19.99.
   - `outside` never returns a value inside `[min, max]` over 1000 draws from a
     `FakerRandom` seeded with 1.
   - `normal(FakerRandom(seed 1), 0, 1)` over 10,000 draws: absolute mean
     below 0.05, standard deviation within 0.05 of 1.
   - `integer` is inclusive at both ends over a scripted `[0, 0.999999]`.

6. **faker/**. Tests in `tests/faker/random.test.ts`: every `next()` over
   1000 draws is in `[0, 1)`; two `FakerRandom` from `Fakers.seeded(42)`
   produce the same first 20 values; seed 43 differs.

7. **sampler/sampler.ts**. Tests in `tests/sampler/sampler.test.ts` using a
   tiny inline dataset with two grades and three fields:
   - counts per grade match the allocation exactly for count 100 and spread
     `{ a: 0.9, b: 0.1 }`;
   - each generator receives the record's grade (assert by writing the grade
     into a field);
   - a later field can read an earlier one through `ctx.record`;
   - `index` runs 0..count-1 in yield order;
   - `run` with seed 7 twice is deep-equal; seed 8 differs;
   - `spread` in options overrides the dataset default;
   - `plan` returns the allocation and the given seed without generating.

8. **output/**. Tests in `tests/output/ndjson.test.ts`: one line per record,
   each ending in `\n`, `_meta` first with `{ grade, index, seed }`, absent
   with `meta: false`; `document` parses back to an array of the same
   length. Write `output.system.ts` (no tests; excluded from coverage).

9. **examples/patient.ts**. Implement per the table. Integration test in
   `tests/examples/patient.test.ts`:
   - `Sampler.run(patient, { count: 200, seed: 7 })` yields the default
     allocation `{ normal: 140, warning: 30, ill: 20, impossible: 10 }`;
   - every `normal` record has `heartRate` in 55..95 and `isPlausible` true;
   - every `impossible` record has `isPlausible` false;
   - the first record equals an inline expected object (write the test with
     an empty object, run once, paste the real output, commit). This is the
     determinism guard; see Failure Interpretation.

10. **src/cli.ts and src/index.ts**. Wire the CLI as specified. No logic in
    `cli.ts` beyond argument parsing, module loading, sink selection and exit
    codes. Verify manually:

    ```bash
    bun run src/cli.ts plan --dataset examples/patient.ts --count 1000
    bun run src/cli.ts generate --dataset examples/patient.ts --count 5 --seed 1
    bun run src/cli.ts generate --dataset examples/patient.ts --count 1000 \
      --spread normal:0.9,ill:0.1 --seed 42 --out .tmp/patients.ndjson --no-meta
    wc -l .tmp/patients.ndjson        # 1000
    bun run src/cli.ts generate --dataset examples/patient.ts --count 2 --format json
    ```

    Expected: `plan` prints seed and a four-row table; the 1000-line file has
    no `_meta`; `json` output is a two-element array.

11. **Build and Node check.**

    ```bash
    bun run build
    node dist/cli.js --help
    node dist/cli.js plan --dataset examples/patient.ts --count 10
    ```

    Expected: `--help` works under Node. The `plan` call fails under Node
    older than 23.6 with an unknown file extension error for `.ts`; that is
    the documented limitation (day plan gap 5), not a defect. If the session's
    Node is 23.6 or later, it succeeds.

12. **Docs.**
    - `README.md` (reader: an engineer who wants graded test data in ten
      minutes). Sections: Why (two paragraphs: classification-first, exact
      allocation), Install and Run (`bunx @lekman/data-sampler generate ...`
      and the `plan` command), Use as a Library (a ten-line snippet calling
      `Sampler.run` in a test and asserting on `record.grade`), Write a
      Dataset (grades, spread, fields, `default`, `ctx.record`, the
      `Distribution` helpers), Output (`_meta`, `--no-meta`, `ndjson` versus
      `json`, seeds and the stderr line), What It Costs (record-level grade
      means every graded field of a `warning` record sits in the warning band;
      `.ts` datasets need Bun or Node 23.6+; faker upgrades change output for
      the same seed). Say the patient example is illustrative, not clinical.
    - `CONTRIBUTING.md` (package): module layout, test layout, the
      determinism guard and how to regenerate it, build and the `external`
      faker decision.
    - `practices/graded-test-data/README.md` (repo): the reasoning half.
      Three short sections: the problem (random data is not assertable), the
      pattern (grade first, generate to satisfy, allocate exactly, tag every
      record), where it applies and where it does not (load tests that want
      realism take the probabilistic sampler that does not exist yet). Link
      to `../../packages/data-sampler/README.md`.
    - Fix the dangling links in `packages/README.md` and
      `practices/README.md` from qat-001 by confirming the targets now exist.
    - Apply the writing rules from qat-001 step 5.

13. **Quality gate and pull request.**

    ```bash
    bun run lint && bun run typecheck && bun test && bun run build
    trunk check --all
    ```

    Expected: exit 0 throughout; coverage at or above the `bunfig.toml`
    thresholds. Open a pull request titled `feat(data-sampler): graded
sampling with exact spread allocation`. Fill Outcome. The operator merges;
    release-please raises the 0.1.0 release pull request from the `feat`
    commits.

## Failure Interpretation

| Symptom                                                                          | Meaning                                                                                                  | Action                                                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `tests/examples/patient.test.ts` first-record assertion fails after a faker bump | Faker changed its internal sequence; values differ for the same seed                                     | Regenerate the expected object; say so in the commit body. Not a sampler defect |
| The same test fails with no dependency change                                    | Something consumed the random stream in a different order (a new field, a reordered field, a stray draw) | Real regression in determinism; find the extra draw                             |
| `Distribution.normal` mean or sd out of tolerance                                | With a fixed seed this cannot flake; either the Box-Muller implementation or `FakerRandom.next` changed  | Inspect the implementation; do not widen the tolerance                          |
| Allocation off by one from the expected counts                                   | Remainder distribution or tie-break order wrong                                                          | Check floor, fractional sort, and scale-order tie-break in `Spread.allocate`    |
| `perfectionist/sort-classes` errors                                              | Static methods not in alphabetical order                                                                 | Reorder; the rule is intended                                                   |
| `jsdoc/require-jsdoc` errors                                                     | An exported class, method or function lacks a comment                                                    | Write a comment that says something; the fixer is off on purpose                |
| Coverage below threshold                                                         | Usually `output.system.ts` or `cli.ts` not excluded, or a branch in `outside`/`allocate` untested        | Check `bunfig.toml` patterns, then add the missing test                         |
| Node cannot import `examples/patient.ts`                                         | Node older than 23.6 without `--experimental-strip-types`                                                | Documented limitation; run under Bun                                            |
| `typescript-eslint does not support TS 7.0`                                      | `typescript` drifted to 7.x                                                                              | Pin `^5.7.0`                                                                    |

## Outcome

_Empty at dispatch. The implementation session fills in: date, pull request
URL, final coverage numbers, the pasted first-record snapshot's seed and
faker version, any deviation from the module layout, and whether Node in the
session could load the `.ts` example._
