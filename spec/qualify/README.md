# qualify: Specification

> **Status:** Draft v1 | **Schema:** [evidence.schema.json](evidence.schema.json)
> (`schemaVersion` 1) | **Scenarios:**
> [conformance/README.md](conformance/README.md)

qualify is a small harness for qualification tests: Installation Qualification
(IQ), Operational Qualification (OQ), Performance Qualification (PQ) and Intended
Use (IU). A qualification test is an ordinary test with an ID, a narrative and
recorded checks. When it runs, it leaves an evidence record that a reviewer can
read without the code, and a trace matrix links each record to the requirements
it covers.

This document is the contract for every implementation. The TypeScript package
is the reference and carries the full CLI. The Python, Java and C# packages
follow the same rules and must pass the same conformance scenarios. Where this document
and an implementation disagree, the implementation is wrong.

| Language   | Package                      | Runs on                      |
| ---------- | ---------------------------- | ---------------------------- |
| TypeScript | `@lekman/qualify` (npm)      | vitest, `node:test`, bun     |
| Python     | `lekman-qualify` (PyPI)      | pytest, as a plugin          |
| Java       | `com.lekman:qualify` (Maven) | JUnit 5, from Java or Kotlin |
| C#         | `Lekman.Qualify` (NuGet)     | xUnit v3 on .NET 10 and 11   |

## Contents

1. [Principles](#1-principles)
2. [Declaring a Test](#2-declaring-a-test)
3. [The Context and Checks](#3-the-context-and-checks)
4. [IDs](#4-ids)
5. [Environment and Policy](#5-environment-and-policy)
6. [Evidence Files](#6-evidence-files)
7. [Values and Redaction](#7-values-and-redaction)
8. [The CLI](#8-the-cli)
9. [The Qualification Report](#9-the-qualification-report)
10. [Keeping the Languages in Step](#10-keeping-the-languages-in-step)
11. [Out of Scope](#11-out-of-scope)

## 1. Principles

1. **The native runner runs the tests.** qualify has no runner of its own and no
   wrapper command. Selecting tests uses the runner's own filters, markers and
   tags.
2. **One context object.** A test receives one context, `ctx`, for its identity,
   checks, attachments, secrets and runtime skip. Everything else, such as
   clients and configuration, comes from the runner's own fixtures.
3. **The process that ran a test writes its record, already redacted.** Nothing
   depends on an end-of-run hook to produce evidence, and no secret value leaves
   the process that knows it.
4. **Real runs prove conformance.** Each language runs the shared scenarios
   through its real runner integration and compares the result with one shared
   expected file per scenario.
5. **One hand-written JSON Schema is the contract.** It is neutral between the
   languages and is read by all of them.

## 2. Declaring a Test

### 2.1 Fields

| Field          | Required          | Rule                                                                                                  |
| -------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| `id`           | yes               | See [section 4](#4-ids).                                                                              |
| level          | yes               | Chosen by the function or annotation name: `iq`, `oq`, `pq`, `iu`.                                    |
| `title`        | yes               | One line, not empty.                                                                                  |
| `given`        | yes               | Not empty. Stored verbatim.                                                                           |
| `when`         | yes               | Not empty. Stored verbatim.                                                                           |
| `then`         | yes               | Not empty. Stored verbatim.                                                                           |
| `and`          | no                | Further clauses, each not empty. Python spells the argument `and_`.                                   |
| `scope`        | yes for OQ and PQ | `read` or `read-write`. IQ is always `read` and IU always `read-write`; declaring either is an error. |
| `requirements` | no                | Requirement IDs, 1 to 64 characters each. Duplicates are a declaration error.                         |
| `risk`         | no                | `high`, `medium` or `low`.                                                                            |
| `tags`         | no                | Free strings. Stored sorted and without duplicates.                                                   |
| `controls`     | no                | ID of the negative test this test is the control for.                                                 |
| `timeoutMs`    | no                | Passed to the runner's own timeout. Not recorded.                                                     |

A declaration error, such as a missing `scope` on an OQ test or a bad ID, fails
the test at collection or registration time with a clear message and writes no
evidence. It never becomes a silent default.

Parametrised qualification tests are refused in v1, because one ID would map to
several records.

### 2.2 TypeScript

A runner-free core plus one thin adapter per runner: `@lekman/qualify/vitest`,
`@lekman/qualify/node` and `@lekman/qualify/bun`.

```ts
import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-EXPORT-003",
  "The bank file never changes an amount",
  {
    given: "a day of payments in three currencies",
    when: "the export writes the bank file",
    then: "every amount in the file equals the amount in the ledger",
    requirements: ["EXPORT-003"],
    risk: "high",
    scope: "read",
    tags: ["export"],
  },
  async (ctx) => {
    const file = await exportBankFile(ledger);
    ctx
      .check("bank file", "EUR keeps two decimals")
      .that(file.amount("EUR"))
      .equals("100.50");
  },
);
```

- The adapter registers the test with the runner as
  `[OQ-EXPORT-003] The bank file never changes an amount`, so the runner's own
  name filter selects by ID (for example `vitest -t OQ-EXPORT-003`).
- The adapter wraps the test body itself, so the outcome never depends on runner
  hooks.
- `ctx.skip(reason)` records the skip and ends the body. Each adapter shows it as
  a skip in its runner where the runner allows it; where a runner has no in-body
  skip, the adapter ends the body and still records `skip`. The adapter's README
  states which applies.

### 2.3 Python

A pytest plugin, registered through the `pytest11` entry point.

```python
import qualify


@qualify.oq(
    "OQ-EXPORT-003",
    "The bank file never changes an amount",
    given="a day of payments in three currencies",
    when="the export writes the bank file",
    then="every amount in the file equals the amount in the ledger",
    requirements=["EXPORT-003"],
    risk="high",
    scope="read",
    tags=["export"],
)
def test_bank_file_keeps_amounts(ctx, ledger):  # ledger is an ordinary fixture
    file = export_bank_file(ledger)
    ctx.check("bank file", "EUR keeps two decimals").that(file.amount("EUR")).equals("100.50")
```

- The outcome comes from a `pytest_runtest_makereport` hook wrapper that reads
  the call-phase report. It never relies on `try` around a fixture `yield`,
  because pytest does not pass the test's exception into a yield fixture.
- `pytest.skip()` inside the body is recorded as `skip` with its message.
- The decorator adds markers `qualify`, the level in lower case (`oq`) and each
  tag, so `pytest -m oq` and `pytest -m "oq and not slow"` select natively. The
  test ID is added to the item's keywords, so `pytest -k OQ-EXPORT-003` works.
- `qualify.Secret` is a `str` subclass whose `repr()` hides the value and which
  registers the value for redaction when created.
- With pytest-xdist, each worker writes its own records. The controller runs
  `merge` at session end when `--qualify-merge` is given.

### 2.4 Java and Kotlin

A JUnit 5 extension, written in Java 17 so Java users do not need the Kotlin
runtime.

```kotlin
@OQ(
    id = "OQ-EXPORT-003",
    title = "The bank file never changes an amount",
    given = "a day of payments in three currencies",
    `when` = "the export writes the bank file",
    then = "every amount in the file equals the amount in the ledger",
    requirements = ["EXPORT-003"],
    risk = Risk.HIGH,
    scope = Scope.READ,
    tags = ["export"],
)
fun bankFileKeepsAmounts(ctx: QualifyContext) {
    val file = exportBankFile(ledger)
    ctx.check("bank file", "EUR keeps two decimals").that(file.amount("EUR")).isEqualTo("100.50")
}
```

```java
@OQ(id = "OQ-EXPORT-003", title = "The bank file never changes an amount",
    given = "a day of payments in three currencies",
    when = "the export writes the bank file",
    then = "every amount in the file equals the amount in the ledger",
    requirements = {"EXPORT-003"}, risk = Risk.HIGH, scope = Scope.READ, tags = {"export"})
void bankFileKeepsAmounts(QualifyContext ctx) {
    var file = exportBankFile(ledger);
    ctx.check("bank file", "EUR keeps two decimals").that(file.amount("EUR")).isEqualTo("100.50");
}
```

- `@IQ`, `@OQ`, `@PQ` and `@IU` are composed annotations, meta-annotated with
  `@Test`, `@Tag` for the level, and `@ExtendWith(QualifyExtension.class)`.
  Gradle `includeTags("OQ")` and Maven `-Dgroups=OQ` select by level. JUnit
  reads tags only from `@Tag` annotations and cannot add one at discovery, so a
  value in `tags` is recorded but cannot be selected. The record's `tags` also
  hold every JUnit tag of the test except its level's, so `@Tag("export")` on
  the method or its class both selects and records `export`.
- `QualifyExtension` resolves the `QualifyContext` parameter, starts the record
  before execution, reads `getExecutionException()` after execution for `fail`
  or `error`, and records aborted tests (assumption failures and `ctx.skip`) as
  `skip`. Policy denials use an `ExecutionCondition` and are recorded as `skip`
  with the reason.
- Java matcher names follow the language: `isEqualTo`, `isNotEqualTo`,
  `contains`, `matches`, `isTrue`, `isFalse`, `isNull`, `isNotNull`,
  `hasLength`, `isAtLeast`, `isAtMost`, `isOneOf`. The JSON records the shared
  names in [section 3.2](#32-matchers).

### 2.5 C#

An xUnit v3 extension for .NET, built with the .NET 11 SDK and targeting
`net11.0` and `net10.0`, so teams on the long-term-support release can use it.

```csharp
public class BankFileTests
{
    [OQ("OQ-EXPORT-003", "The bank file never changes an amount",
        Given = "a day of payments in three currencies",
        When = "the export writes the bank file",
        Then = "every amount in the file equals the amount in the ledger",
        Requirements = ["EXPORT-003"], Risk = Risk.High, Scope = Scope.Read,
        Tags = ["export"])]
    public void BankFileKeepsAmounts()
    {
        var ctx = QualifyContext.Current;
        var file = BankFile.Export(ledger);
        ctx.Check("bank file", "EUR keeps two decimals").That(file.Amount("EUR")).IsEqualTo("100.50");
    }
}
```

- `[IQ]`, `[OQ]`, `[PQ]` and `[IU]` derive from xUnit's `FactAttribute` and
  use a test case of qualify's own that wraps the method body, so the outcome
  never depends on runner hooks. The display name is `[<ID>] <title>`.
- xUnit facts take no method parameters, so the test reads its context from
  `QualifyContext.Current`, which qualify sets for the duration of the test
  (an `AsyncLocal`, safe across `await`).
- The attribute adds the traits `Qualify` (the level) and `Tag` (each tag), so
  the runner's trait filter selects by level or tag, and the display name
  selects by ID. The package README gives the exact `dotnet test` filter syntax
  for the Microsoft Testing Platform and for VSTest.
- `ctx.Skip(reason)` records the skip and ends the test as skipped, using
  xUnit v3's dynamic skip.
- C# matcher names follow the language: `IsEqualTo`, `IsNotEqualTo`,
  `Contains`, `Matches`, `IsTrue`, `IsFalse`, `IsNull`, `IsNotNull`,
  `HasLength`, `IsAtLeast`, `IsAtMost`, `IsOneOf`. The JSON records the shared
  names in [section 3.2](#32-matchers).
- Language assertion errors (`fail` rather than `error`) are xUnit's
  `XunitException` family and `System.Diagnostics.Debug` assertion failures.

## 3. The Context and Checks

### 3.1 The Context

```text
ctx.id, ctx.level, ctx.environment      identity, and where the test runs
ctx.check(context, description)         start a hard check
ctx.check(...).soft()                   a soft check: record, keep going, fail at the end
ctx.delegate(context, description, fn)  run fn and record it as one check
ctx.attach(filename, body, contentType) add an inline attachment
ctx.secret(name)                        read a named secret (QUALIFY_SECRET_<NAME> by default) and register it
ctx.redact(value)                       register a value for redaction
ctx.skip(reason)                        skip at runtime, with a reason
ctx.runContext(extra)                   attach the standard run context document
```

Names follow each language's style (`run_context` in Python, `runContext` in
Java). Behaviour is identical.

- **Checks are the only assertion surface.** qualify does not wrap the runner's
  own `expect` or `assert`.
- **Hard by default.** A failed hard check records itself, then throws
  `CheckFailed`, so later steps never run on bad state.
- **Soft checks** record a failure and let the test continue. At the end of the
  body, a test with any failed soft check fails with `CheckFailed`, message
  `<n> soft check(s) failed`, and site of the first failed soft check.
- **Delegated checks** wrap work that has its own assertions, such as a helper
  shared with unit tests. `delegate` runs `fn` and records one check with
  matcher `delegate`, `expected` `"completes"`, and `actual` `"completed"` or
  the redacted failure message, plus `delegate`: the function's qualified name.
  A failure inside `fn` keeps its own type (see 3.3).
- **Run context** attaches `run-context.json` with the run envelope's `source`,
  `actor` and `target` plus any `extra` values, writing `null` for values that
  were not available instead of guessing. The document has four keys,
  `actor`, `extra`, `source` and `target`, and is written like any JSON
  attachment (section 7.3).

### 3.2 Matchers

The JSON `matcher` field uses these names in every language. A failing matcher
records `pass: false` with both values.

| Matcher     | Passes when                                                        | `expected` recorded as   |
| ----------- | ------------------------------------------------------------------ | ------------------------ |
| `equals`    | Deep equality after normalisation (section 7.1)                    | the expected value       |
| `notEquals` | Not deep-equal                                                     | the value it must not be |
| `contains`  | A string contains a substring, or a list contains an equal element | the substring or element |
| `matches`   | A string matches a regular expression (the language's own engine)  | the pattern source       |
| `isTrue`    | The value is boolean `true`                                        | `true`                   |
| `isFalse`   | The value is boolean `false`                                       | `false`                  |
| `isNull`    | The value is null, None or undefined                               | `null`                   |
| `isNotNull` | The value is not null, None or undefined                           | `"not null"`             |
| `hasLength` | A string, list or map has the given length                         | the length               |
| `atLeast`   | A number is at least the given number                              | the bound                |
| `atMost`    | A number is at most the given number                               | the bound                |
| `oneOf`     | The value equals one of the given values                           | the list of values       |
| `delegate`  | The delegated function completes                                   | `"completes"`            |

`actual` is the normalised value under test. For `hasLength`, `actual` is the
measured length, and a string's length counts Unicode code points.

### 3.3 Outcomes

| Outcome | When                                                                                                                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pass`  | The body completed and every check passed.                                                                                                                                                                     |
| `fail`  | A hard check failed, a soft check failed, or the language's own assertion error was raised (`AssertionError` in Python and Java, an assertion error from the runner in TypeScript, an `XunitException` in C#). |
| `error` | Any other exception. `error.type` is its type name and `error.message` its redacted message.                                                                                                                   |
| `skip`  | `ctx.skip`, the runner's own in-body skip, or a policy or "not applicable" rule. `skipReason` is required.                                                                                                     |

`error` holds the first failure only: `type`, redacted `message`, and `site`
(the `path:line` of the failing check or the innermost frame in the test file,
or `null` when neither is known). A failed hard check has type `CheckFailed`
and message `<context>: <description>`.

## 4. IDs

- Pattern: `^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$`, for example
  `OQ-EXPORT-003`.
- The prefix must equal the declared level.
- One area segment only. `OQ-EXPORT-API-001` is invalid; use `OQ-EXPORTAPI-001`.
- An ID is unique within a run. Two records with one ID is an input error for
  `merge`.
- A test the runner's filter deselects writes no record. Only policy rules,
  "not applicable" rules and runtime skips write `skip` records. The trace
  matrix reports protocol IDs with no record as "not run".

## 5. Environment and Policy

- **Environment name.** A resolver supplies it. The default reads
  `QUALIFY_ENVIRONMENT`, and falls back to `local` when it is unset. A project can
  plug in its own resolver. If a configured resolver throws, the environment is
  treated as `production`.
- **Production environments.** `QUALIFY_PRODUCTION` holds a comma-separated list
  of environment names treated as production. The default is `production,prod`.
- **Write protection.** In a production environment, tests with scope
  `read-write` are skipped with reason
  `read-write test blocked in production environment <name>`.
  `run.policy.productionWriteBlocked` is `true`.
- **Overrides.** `QUALIFY_ALLOW_WRITE` lists test IDs allowed to write in
  production, each as `ID=reason` separated by `;`. Every override is recorded in
  `run.policy.overrides`. Setting `QUALIFY_NO_OVERRIDES=1` refuses all overrides
  and fails the run at start if any are given.
- **Not applicable rules.** A project can register rules that match on tags and
  environment, each with a reason. A matched test is skipped with that reason.

Each adapter also exposes these settings in the runner's own configuration
(vitest config, `pytest.ini` options, JUnit configuration parameters). The
environment variable wins when both are set.

## 6. Evidence Files

### 6.1 Location

- Evidence directory: `qualification/evidence/` relative to the working
  directory, or `QUALIFY_EVIDENCE_DIR`.
- Records and markers: `<evidenceDir>/records/`.
- Run file: `<evidenceDir>/test-evidence.json`, plus
  `<evidenceDir>/test-evidence.json.sha256` holding the run file's lowercase
  SHA-256 hex digest followed by two spaces, the file name and a newline (the
  `sha256sum` format).

### 6.2 The Run ID

`run.id` is a ULID shared by every file of one run. An adapter takes it from
`QUALIFY_RUN_ID` when set. Otherwise the controlling process creates one per
runner invocation and passes it to its workers (a vitest global setup, the
pytest controller and its xdist workers, the JUnit launcher). Split runs across
machines or languages share one run by setting `QUALIFY_RUN_ID` in the job.

### 6.3 Files

Three kinds, all defined in [evidence.schema.json](evidence.schema.json):

- **Started marker**, `<runId>__<testId>__<key>.started`, `kind: "started"`,
  written when the test starts. It holds the run envelope and the test's
  declaration.
- **Record**, `<runId>__<testId>__<key>.json`, `kind: "record"`, written when the
  test ends, already redacted. The marker stays in place; `merge` pairs them.
- **Run file**, `kind: "run"`, written by `merge`.

`<key>` is the first 8 lowercase hex digits of the SHA-256 of the declaration's
`site` (UTF-8). Without it, two declarations of one ID in one run would write
to the same file name, the second would overwrite the first, and `merge` could
never see the duplicate. A retried test keeps its site, so it overwrites its own
files.

Every file is written atomically: write to a temporary file in the same
directory, flush, then rename. JSON is UTF-8, two-space indented, keys in
schema order for the envelope and sorted inside values, with a trailing newline.

### 6.4 The Run Envelope

Each marker and record carries the full `run` envelope, so a file is readable on
its own. `source` comes from git (`commit`, `branch`, `dirty`), each value
`null` if git is unavailable. `dirty` counts changes to tracked files only: the
evidence directory usually sits untracked inside the repository, and counting
it would change `dirty` partway through a run. `actor` comes from the CI environment
(`GITHUB_ACTOR`, `GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`, `GITHUB_RUN_ID` on
GitHub Actions; `name` from `USER` or `USERNAME` outside CI). `target` comes
from `QUALIFY_TARGET_<NAME>` variables, with the name lower-cased:
`QUALIFY_TARGET_DIGEST=sha256:...` becomes `target.digest`, and
`QUALIFY_TARGET_IMAGE_TAG` becomes `target.image_tag`. A variable that is set
but empty becomes `null`.

### 6.5 Merge

`merge` reads `<evidenceDir>/records/`, ignoring file names that start with a
dot (the temporary files of an interrupted atomic write), and:

1. validates every file against the schema, and checks that each file name
   matches the `run.id`, test ID and kind inside it;
2. refuses records from more than one `run.id` unless `--allow-runs` names the
   others, and lists them in `run.mergedRuns`;
3. refuses two records with one test ID;
4. checks that the envelopes agree on `environment`, `source` and `policy`, and
   refuses the merge if they do not. `tool`, `actor` and `target` may differ
   (a run split across machines or languages); the run file takes them from the
   main run's file with the lowest test ID;
5. turns every marker without a record into a record with outcome `error`,
   error type `DidNotFinish` and message `test started and did not finish`,
   `startedAt` and `endedAt` from the marker, `durationMs` 0;
6. re-applies the pattern redaction rules to every string as a second line of
   defence;
7. writes the run file with tests sorted by `id`, `run.startedAt` the earliest
   start, `run.endedAt` the latest end, and the summary, then the `.sha256`
   sidecar.

`summary.verdict` is `fail` if any test failed or errored, `incomplete` if there
are no records, and `pass` otherwise. With no records at all, `merge` still
writes a run file, with the envelope of the process that runs `merge` and
`startedAt` and `endedAt` set to the current time.

## 7. Values and Redaction

### 7.1 Normalisation

Every value recorded as `expected` or `actual` is normalised the same way in
every language, so the expected files match:

- Object and map keys are sorted by Unicode code point. Arrays and lists keep
  their order. Sets become sorted arrays: numbers in numeric order, strings by
  code point, and a set of mixed types by the compact JSON text of each element.
- Bytes become `{"$bytes": "<base64>"}`.
- Dates and instants become timestamp strings in the schema's format, in UTC.
- Integers outside plus or minus 2^53 become strings. `NaN` and infinities
  become the strings `"NaN"`, `"Infinity"` and `"-Infinity"`.
- Cycles and values that cannot be serialised become
  `"[unserialisable: <type>]"`, with the language's type name. A value that
  holds a cycle anywhere becomes one such string as a whole, named after the
  outer value's type.
- Strings are recorded as they are, then redacted.

### 7.2 Redaction

Applied by the process that ran the test, before the record is written, to
every string: check values, contexts and descriptions, error messages, the
narrative, and attachments.

- **Registered values.** Values from `ctx.secret`, `ctx.redact` and secret
  objects are replaced wherever they occur. A value shorter than 6 characters is
  refused with a warning, because it would redact ordinary words.
- **Pattern rules,** applied without registration, after registered values:
  - PEM private key blocks, from `-----BEGIN ... PRIVATE KEY-----` to the
    matching `END` line, or to the end of the text when there is none;
  - JWT-shaped tokens: three base64url segments separated by dots, the first
    starting with `eyJ`;
  - access-key-ID shapes: `AKIA` or `ASIA` followed by 16 upper-case letters or
    digits.

  As regular expressions, in this order:
  `-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY-----(?:[\s\S]*?-----END \1PRIVATE KEY-----|[\s\S]*$)`,
  `eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` and
  `(?:AKIA|ASIA)[A-Z0-9]{16}`. Registered values are replaced longest first.

- **JSON attachments** (content type `application/json`): values under keys
  named `password`, `passwd`, `secret`, `token`, `authorization`, `apiKey`,
  `api_key` or `privateKey`, compared case-insensitively, are replaced, whole,
  by `"[REDACTED]"`. Every other string and key is redacted as text.
- **Binary attachments** are scanned as bytes, so a match never corrupts the
  bytes around it.
- The replacement text is `[REDACTED]`.
- `secretsUsed` lists the names of secrets read with `ctx.secret`, sorted.
  Values are never recorded.

### 7.3 Attachments

Attachments are stored inline, base64-encoded, with `sizeBytes` and `sha256` of
the redacted bytes. The size limit is 1 MiB per attachment by default
(`QUALIFY_ATTACHMENT_LIMIT` in bytes). An attachment over the limit ends the
test with outcome `error`, type `AttachmentTooLarge`, message
`attachment <filename> is <size> bytes, over the limit of <limit> bytes`; it is
never truncated. The size is measured when the test attaches it, before
redaction, because a later secret could still change it.

A JSON attachment (content type `application/json`, given as a value or as JSON
text) is parsed, normalised (section 7.1), redacted, and written the way the
evidence files are: UTF-8, two-space indent, keys sorted by code point, and a
trailing newline. So every language produces the same bytes, and the same
`sha256`. JSON text that does not parse is kept as bytes. Any other attachment
keeps its bytes, redacted as bytes.

## 8. The CLI

The full CLI ships in the TypeScript package (`npx @lekman/qualify`). The Python,
Java and C# packages ship `merge`, `validate` and `report` with the same flags and
exit codes, so a project can produce its evidence and its PDF report without
Node.

```text
qualify merge    [--evidence-dir DIR] [--allow-runs ID,ID] [--out FILE]
qualify validate FILE...
qualify trace    EVIDENCE... [--protocol protocol.yaml] [--map trace.yaml]
                 [--md trace.md] [--json trace.json] [--fail-on-skip]
qualify report   RUNFILE --pdf FILE [--protocol protocol.yaml] [--map trace.yaml]
                 [--theme NAME|PATH] [--title TEXT] [--subtitle TEXT]
                 [--document-id TEXT] [--classification TEXT]
                 [--signatures ROLE;ROLE;...] [--no-signatures]
```

- `protocol.yaml` lists the test IDs that must run, each with `title`, `level`,
  and optional `requirements` and `risk`, under a `tests` key:

  ```yaml
  tests:
    - id: OQ-EXPORT-003
      title: The bank file never changes an amount
      level: OQ
      requirements: [EXPORT-003]
      risk: high
  ```

- `trace.yaml` maps test IDs to requirement IDs without touching code. A value
  is one requirement ID or a list:

  ```yaml
  OQ-EXPORT-003: [EXPORT-004, EXPORT-005]
  ```

- Requirement links are the union of the map, the protocol and the code
  declarations. The matrix shows where each link came from.
- `trace.md` has a header (environments, run IDs, commits, and the SHA-256 of
  each input), a summary line, a table of requirement, test ID, level, title,
  risk, outcome and run, a list of protocol IDs with no record, and a list of
  requirements with no passing test.
- `trace.json` holds the same rows, with its own `schemaVersion` 1, defined in
  `trace.schema.json` next to this file.

| Exit code | Meaning                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------- |
| 0         | Every included test passed, and every protocol ID has a passing record                                |
| 1         | At least one `fail` or `error`, or a protocol ID failed                                               |
| 2         | Input invalid: schema violation, duplicate ID, mixed runs, unreadable file                            |
| 3         | Incomplete: no records, a protocol ID has no record, or a required test skipped with `--fail-on-skip` |
| 64        | Usage error                                                                                           |

When several codes apply, 1 wins over 3, and 3 over 0: a failure outranks a
missing record. A skipped test does not stop exit 0 unless `--fail-on-skip` is
given; then a skip of a protocol ID, or of any test when there is no protocol,
exits 3. `merge` exits with the code of its verdict: 0 for `pass`, 1 for
`fail`, 3 for `incomplete`, and 2 for invalid input, when it writes no run
file. `validate` exits 0 when every file is valid and 2 otherwise. `report`
exits 0 when the PDF is written, whatever the run's outcome, because a failed
run needs its report too. It exits 2 for invalid input.

The test run itself keeps the native runner's exit code.

## 9. The Qualification Report

`qualify report` renders a run file as a PDF that a reviewer can read, sign and
file without the code or the JSON. Every package draws it with a library written
in its own language, so no system libraries and no browser are needed:

| Package    | Library                                                           | Licence    |
| ---------- | ----------------------------------------------------------------- | ---------- |
| TypeScript | `pdf-lib` with `@pdf-lib/fontkit`                                 | MIT        |
| Python     | `fpdf2`                                                           | LGPL-3.0   |
| Java       | Apache PDFBox                                                     | Apache-2.0 |
| C#         | PDFsharp 6.2.4 (the last MIT release; 6.5 and later are AGPL-3.0) | MIT        |

How the report looks comes from a theme (section 9.3): logo, fonts, colours and
texts. The layout below is fixed. The PDFs from different languages are not
pixel-identical; they hold the same text, in the same order, drawn with the same
theme, and conformance checks that by extracting the text (section 10).

### 9.1 Contents

In this order:

1. **Cover page.** No header or footer. From the top:
   - the logo, `brand.logoHeightMm` high, at the top-left margin, with
     `brand.name` beside it, vertically centred, in the heading font and the
     `muted` colour. Either may be absent;
   - the title, at 40% of the page height, in the heading font at 30 pt in the
     `title` colour, wrapped to the text width;
   - a rule in the `accent` colour, 30 mm long and 1.5 pt thick, 6 mm below the
     title;
   - the subtitle, 6 mm below the rule, in the body font at 13 pt in the
     `muted` colour;
   - at the bottom margin, a hairline in the `rule` colour across the text
     width, then one row per entry in `cover.fields`: the label in the bold body
     font at 9 pt, and the value in the body font at 9 pt in the `muted`
     colour. A `classification` row is left out when the classification is
     empty.

   | Field            | Label            | Value                                                                 |
   | ---------------- | ---------------- | --------------------------------------------------------------------- |
   | `documentId`     | `Document ID`    | the document ID                                                       |
   | `date`           | `Date`           | the generation date, `YYYY-MM-DD`                                     |
   | `verdict`        | `Verdict`        | `Passed`, `Failed` or `Incomplete`                                    |
   | `tests`          | `Tests`          | `<total> tests: <pass> pass, <fail> fail, <error> error, <skip> skip` |
   | `environment`    | `Environment`    | `run.environment`                                                     |
   | `version`        | `Version`        | `run.target.version`, or `-`                                          |
   | `commit`         | `Commit`         | the first 12 characters of `run.source.commit`, or `-`                |
   | `classification` | `Classification` | the classification text                                               |

2. **Run details,** starting page 2: the title again as a level 1 heading, then
   a `Run details` table of the run ID, run start and end, source commit and
   branch, the name and version of the tool that wrote the evidence
   (`run.tool`), the generation time, the SHA-256 of the run file exactly as
   read, merged run IDs, and production write overrides. Merged runs and
   overrides are listed here, early, because a reviewer must see them first.
3. **Summary and traceability.** Counts per level and outcome. The trace table:
   requirement, test ID, level, title, risk and outcome, with the same rows and
   link sources as `trace`. A requirement cell holds the requirement and its
   sources, for example `EXPORT-003 (code, map)`, and an outcome is the JSON
   value, `not-run` for a protocol ID with no record. Then two lists, under the
   headings `Not run` (protocol IDs with no record, each with its title) and
   `Requirements without a passing test`, each holding the line `None` when
   empty.
4. **One section per test,** sorted by ID: the heading `<ID> <title>`; level,
   outcome (the JSON value), risk, scope, requirements, tags and `controls`;
   the skip reason, or the error type and message; the narrative (`Given`,
   `When`, `Then`, and each `And`); a checks table with number (`seq` plus 1),
   context, description, matcher, expected, actual, result (`Pass` or `Fail`)
   and `soft` when set; attachments by file name, content type, size and
   SHA-256 (the content itself is not rendered); and the names in
   `secretsUsed`.
5. **Signature block,** when the theme or `--signatures` names any roles,
   under the level 2 heading `Signatures`. One row per role, each with blank
   lines for name, signature and date.

### 9.2 Rendering Rules

- Page size and margins come from the theme. Tables wrap their cells; a row
  never splits across pages unless it is taller than a page, and a table's
  header row repeats on each page it continues on.
- **Header,** every page after the cover: the `header` text on the left and
  the classification on the right, in the body font at 8.5 pt in the `muted`
  colour, with a hairline in the `rule` colour below.
- **Footer,** every page after the cover: a hairline in the `rule` colour, then
  the `footer` text, right-aligned, in the body font at 8.5 pt in the `muted`
  colour. Pages are counted from the cover, so the first footer says page 2.
  A header or footer text too long for its space is cut and ends with `…`.
- **Headings:** the level 1 heading in the heading font at 20 pt in the
  `title` colour, with a rule in the `accent` colour across the text width
  below it; level 2 headings (`Run details`, `Summary`, `Traceability`, the
  test headings) at 14 pt in the `heading` colour; level 3 headings (`Not run`,
  `Requirements without a passing test`, `Checks`, `Attachments`) at 11 pt in
  the `heading` colour.
- **Tables:** a header row filled with `tableHeader`, its text in the bold body
  font in `tableHeaderText`; body rows in the body font at 9 pt in the `text`
  colour; every second body row filled with `tableStripe`; a hairline in the
  `rule` colour under each row. Field lists (label and value, as in run details
  and each test's fields) have no fill: the label in the bold body font, the
  value in the body font.
- **Values:** `expected`, `actual`, IDs, digests and the run ID are drawn in the
  mono font. `expected` and `actual` are rendered as compact JSON: no spaces,
  keys sorted. A value longer than 200 characters (code points) is cut and ends
  with `… (<n> more characters)`. A missing value, such as no risk, no commit or
  an empty list, is drawn as `-`.
- **Fonts** are embedded as subsets. A character the theme's font cannot draw is
  drawn as `?`. The evidence file stays the record of the exact text.
- Timestamps are shown in UTC as `YYYY-MM-DD HH:MM:SS UTC`.
- PDF metadata: `Title` the title, `Subject` the run ID, `Keywords` holding
  `sha256:<run file digest>`, `Producer` the name and version of the package
  that wrote the PDF (a PDF library may add its own name to `Producer`; then
  `Creator` holds the package name and version alone), and `CreationDate` the
  generation time.
- The generation time is the current time, or `QUALIFY_REPORT_TIME` when set
  (an ISO 8601 UTC instant), so a report can be reproduced.
- `report` reads only the run file, the theme and the optional protocol and map
  files. It never re-runs or alters evidence.

### 9.3 Themes

A theme is a JSON file defined by
[report-theme.schema.json](report-theme.schema.json), with its logo and font
files beside it; paths in it are relative to the theme file. Two themes ship in
[report/themes/](report/README.md), and every package bundles both, byte for
byte:

- `lekman`, the default: the lekman.com logo and name, Geist fonts, and
  the lekman.com colours.
- `plain`: no logo, black on white, Noto Sans for Latin, Greek and Cyrillic
  coverage.

`--theme <name|path>` picks a bundled theme by name or a theme file by path.
`QUALIFY_REPORT_THEME` does the same; the flag wins. An invalid theme (schema
violation, a missing file, an unknown token) is an input error: exit 2, no PDF.

The `texts` are templates. They may use these tokens, and nothing else in
braces; `{{` and `}}` print a literal brace:

| Token               | Value                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `{title}`           | the resolved title                                                                                                                    |
| `{documentId}`      | the resolved document ID                                                                                                              |
| `{classification}`  | the resolved classification                                                                                                           |
| `{environment}`     | `run.environment`                                                                                                                     |
| `{levels}`          | the levels present in the run, in the order IQ, OQ, PQ, IU, joined as `IQ`, `IQ and OQ`, `IQ, OQ and PQ`; `-` for a run with no tests |
| `{date}`            | the generation date, `YYYY-MM-DD`                                                                                                     |
| `{version}`         | `run.target.version`, or `-`                                                                                                          |
| `{verdict}`         | `Passed`, `Failed` or `Incomplete`                                                                                                    |
| `{runId}`           | `run.id`                                                                                                                              |
| `{sha12}`           | the first 12 characters of the run file's SHA-256                                                                                     |
| `{page}`, `{pages}` | the page number and the page count (header and footer only)                                                                           |

`texts.title` and `texts.classification` are resolved first, so they may not
use `{title}` or `{classification}`; the other texts may. Using a token where it
is not allowed is the same error as an unknown token.

Flags override the theme for one report: `--title`, `--subtitle`,
`--document-id`, `--classification`, `--signatures` (roles separated by `;`) and
`--no-signatures`. A flag's value is used as written, without tokens. The
document ID defaults to `QR-<environment>-<run start date as YYYYMMDD>`.

## 10. Keeping the Languages in Step

- [evidence.schema.json](evidence.schema.json) (JSON Schema draft 2020-12) is
  hand-written and normative. Each language validates its own output against it
  in its tests.
- [conformance/](conformance/README.md) holds the scenarios and one expected file
  per scenario. Every language runs every scenario through its real runner
  integration in CI.
- A breaking schema change bumps `schemaVersion`. `validate` accepts the current
  and the previous version for one minor release after a change.

## 11. Out of Scope

- Harnesses for cloud services, and providers for infrastructure outputs or
  secret stores. Projects provide clients through their own fixtures.
- Export formats for test-management tools. `trace.json` is the integration
  point.
- Electronic signatures and document approval states such as draft and
  approved. The report leaves signature lines blank; signing and approval
  belong to a document control system.
- A custom runner or a `run` command.
- Skip records for tests deselected by a filter.
- A scaffolding command. Copy an example file instead.
