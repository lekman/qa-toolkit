# Contributing to data-sampler

How the package is put together. Consumer documentation is in
[README.md](README.md); the repo-wide rules are in
[docs/CONTRIBUTING.md](../../docs/CONTRIBUTING.md).

## Layout

One folder per domain, following
[.claude/rules/clean-architecture.md](../../.claude/rules/clean-architecture.md):
`types.ts` for types, `interfaces.ts` for ports, a static class per business
capability, an `index.ts` barrel, and `*.system.ts` only where a system call
happens.

| Folder         | Holds                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| `src/grade/`   | `Spread`: parse, validate, allocate by largest remainder, seeded shuffle.             |
| `src/sampler/` | `Dataset.define`, `Distribution`, `Sampler`, the errors, and every public type.       |
| `src/faker/`   | `Fakers.seeded` and `FakerRandom`, the one place faker is touched.                    |
| `src/output/`  | `Ndjson` (pure) and, in `output.system.ts`, the stdout and file sinks.                |
| `src/cli.ts`   | Wiring only: `parseArgs`, module loading, sink choice, exit codes. Not covered.       |
| `examples/`    | `patient.ts`, the reference dataset. Imports the package by name, as a consumer does. |
| `tests/`       | Mirrors `src/`, plus `examples/` for the integration test and `mocks/` for the fakes. |

`@faker-js/faker` is deterministic and makes no system calls, so `src/faker/`
is ordinary business code with tests. Only `output.system.ts` does I/O.

## Tests

```bash
bun test
```

Unit tests drive `Spread`, `Distribution` and `Sampler` with `ScriptedRandom`
from `tests/mocks/random.mock.ts`, which replays a fixed list of values, so
they do not depend on faker at all. The faker and distribution statistics
tests use a seeded `FakerRandom`; with a fixed seed they cannot flake.

Coverage thresholds are in `bunfig.toml` (line 0.8, function 0.6, statement
0.8). Barrels, `*.system.ts`, `cli.ts` and `examples/` are excluded.

### The Determinism Guard

`tests/examples/patient.test.ts` pins the first record of
`Sampler.run(patient, { count: 200, seed: 7 })` by value. It fails on purpose
when anything changes the random stream:

- **After a `@faker-js/faker` upgrade**, the failure is expected. Regenerate
  the record, paste it into the test, and say so in the commit body.
- **With no dependency change**, it is a regression: a new field, a reordered
  field, or a stray draw consumed the stream in a different order. Find the
  extra draw; do not repaste.

To regenerate:

```bash
bun -e 'import p from "./examples/patient"; import { Sampler } from "@lekman/data-sampler";
console.log(JSON.stringify(Sampler.run(p, { count: 200, seed: 7 }).records[0], null, 2))'
```

The example draws admission dates against a fixed reference date rather than
"now"; without that the same seed would give different dates on different
days.

## Build

```bash
bun run build          # dist/index.js and dist/cli.js
node dist/cli.js plan --dataset examples/patient.ts --count 10
```

`scripts/build.ts` bundles everything except `@faker-js/faker`, which stays a
runtime dependency. The library and a consumer's own tests must share one
faker instance and version; bundling it would put a second copy in the tree
and the seeds would no longer line up.

The example imports `@lekman/data-sampler` by name. Bun resolves that to
`src/` through the `bun` export condition; Node resolves it to `dist/`, so
build before running the example under Node.
