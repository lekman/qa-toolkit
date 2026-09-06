# @lekman/data-sampler

> Classification-first JSON test data: define grades, choose a spread, generate
> records that satisfy each grade.

## Why

Random test data is not assertable. A generator that draws a heart rate from
some distribution and leaves you to work out afterwards whether the record is
"normal" or "ill" gives you data you can load, but not data you can write a
test against. This package turns that round: the grade of every record is
decided first, and every field generator receives it, so a record graded
`warning` has warning-band values in every graded field and your test can say
so.

Allocation is exact. Ask for 1000 records at 90 percent normal and 10 percent
ill and you get 900 and 100, not roughly that. The counts are computed by
largest remainder, then shuffled with the run's seed, so an integration test
can assert on the count per grade and the order still looks random.

## Install and Run

The CLI needs Node 20 or later. Dataset files are TypeScript modules; running
them needs Bun, or Node 22.18 or later, which strips types without a flag.

```bash
# Plan a run: the seed and the count per grade, without generating anything.
bunx @lekman/data-sampler plan --dataset ./patient.ts --count 1000

# Generate newline-delimited JSON to stdout, with a reproducible seed.
bunx @lekman/data-sampler generate --dataset ./patient.ts --count 1000 --seed 42

# Override the spread, write a file, and drop the _meta property for a base load.
bunx @lekman/data-sampler generate --dataset ./patient.ts --count 1000 \
  --spread normal:0.9,ill:0.1 --out fixtures/patients.ndjson --no-meta
```

`--help` lists every option. `--spread` takes fractions (`normal:0.9,ill:0.1`)
or percentages (`normal:90,ill:10`).

## Use as a Library

```typescript
import { Sampler } from "@lekman/data-sampler";
import { expect, test } from "bun:test";

import patient from "./patient";

test("the intake validator rejects every ill patient", () => {
  const run = Sampler.run(patient, { count: 200, seed: 7 });
  expect(run.allocation.ill).toBe(20);
  for (const record of run.records) {
    expect(validate(record.data).accepted).toBe(record.grade !== "ill");
  }
});
```

`Sampler.run` collects everything; `Sampler.records` is a generator for large
runs; `Sampler.plan` returns the allocation and seed without generating.

## Write a Dataset

A dataset is a TypeScript module whose default export is the result of
`Dataset.define`. It names the grades in ascending severity, gives a default
spread, and declares one field specification per output property.

```typescript
import { Dataset, Distribution } from "@lekman/data-sampler";

interface Reading {
  id: string;
  value: number;
  takenAt: string;
  reviewedAt: string;
}

export default Dataset.define<Reading>({
  name: "reading",
  grades: ["normal", "outlier"],
  spread: { normal: 0.95, outlier: 0.05 },
  fields: {
    id: { default: (ctx) => ctx.faker.string.uuid() },
    value: {
      normal: (ctx) => Distribution.normal(ctx.random, 50, 5),
      outlier: (ctx) =>
        Distribution.outside(ctx.random, 35, 65, { min: 0, max: 200 }),
    },
    takenAt: {
      default: (ctx) =>
        ctx.faker.date.recent({ days: 7, refDate: "2026-09-01" }).toISOString(),
    },
    reviewedAt: {
      default: (ctx) => new Date(ctx.record.takenAt as string).toISOString(),
    },
  },
});
```

- A field lists one generator per grade, or a `default` for every grade not
  listed. `Dataset.define` rejects a field that leaves a grade uncovered.
- Every generator receives `ctx.grade`, `ctx.faker` (seeded), `ctx.random`
  (uniform numbers in `[0, 1)` from the same seed), `ctx.index`, `ctx.scale`
  and `ctx.record`.
- `ctx.record` holds the fields generated so far. Fields are generated in the
  key order of `fields`, which is declaration order in JavaScript, so a field
  may read any field declared above it and none below.
- `Distribution` offers `normal` (Box-Muller), `band` (uniform in a range),
  `outside` (uniform in the gaps between a range and its limits), `integer`
  and `clamp`. All take `ctx.random`, so a dataset stays reproducible.
- A grade may not be named `default`.

## Output

Each record is a JSON object. With the default `ndjson` format, one record per
line; with `--format json`, one pretty-printed array. Every record carries
`_meta: { grade, index, seed }` as its first key unless `--no-meta` is given,
so a test can tell which grade produced a record and a base load can drop it.

Every `generate` run prints `seed: <n>` to stderr, whether the seed was given
or drawn, so any run can be repeated exactly by passing that seed back.

## What It Costs

- **A record-level grade.** Every graded field of a `warning` record sits in
  the warning band. A record that is normal in most fields and off in one is
  a grade of its own, or a field whose `warning` generator sometimes returns a
  normal value; the package does not decide that for you.
- **A runtime that strips types.** Datasets are `.ts` modules. Under Bun that
  is free; under Node it needs 22.18 or later (or `--experimental-strip-types`
  from 22.6). No loader is added.
- **Faker upgrades change output for the same seed.** The package keeps
  `@faker-js/faker` as a peer-like runtime dependency so your tests and the
  generator share one instance and version. When it moves, pinned snapshots
  move with it.
- **Exact allocation, not sampling.** A load test that wants the noise of a
  real population needs a probabilistic sampler. This package does not offer
  one yet.

## The Patient Example

[examples/patient.ts](examples/patient.ts) shows four grades (`normal`,
`warning`, `ill`, `impossible`) over ten fields, with an `isPlausible`
validator that tells the last grade from the rest. The vital-sign bands in it
are illustrative test data chosen so a validator can tell the grades apart.
They are not clinical reference ranges and must not be used as such.

## Related

- [practices/graded-test-data/README.md](../../practices/graded-test-data/README.md):
  why grade first, and where the pattern does not apply.
- [CONTRIBUTING.md](CONTRIBUTING.md): layout, tests, the determinism guard.
