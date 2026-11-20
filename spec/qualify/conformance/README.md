# qualify: Conformance Scenarios

> **Status:** Draft v1 | Part of the [qualify specification](../README.md)

Every implementation runs every scenario below as real test files through its
real runner integration, then runs `merge` and compares the masked run file with
the shared expected file. Replaying stored output is not conformance: it proves
the serialiser and misses outcome bugs.

## How a Scenario Runs

1. The scenario's test files live in the implementation, for example
   `packages/qualify/conformance/<scenario>.test.ts`,
   `packages/qualify-python/conformance/test_<scenario>.py`,
   `packages/qualify-jvm/src/conformance/.../<Scenario>Test.java` and
   `packages/qualify-dotnet/conformance/<Scenario>Tests.cs`. They declare
   exactly the tests listed here, with the same IDs, narratives, checks and
   values, in the language's own syntax.
2. The harness runs them with `QUALIFY_RUN_ID=01HQA1ZQJ0C0NF0RMANCE00000`,
   `QUALIFY_EVIDENCE_DIR` set to a fresh temporary directory, and the
   environment variables the scenario lists. Nothing else from the real
   environment leaks in: the harness clears every other `QUALIFY_*` variable.
3. The harness runs `merge`, masks the run file (below), and compares it with
   `expected/<scenario>.json` byte for byte after formatting. Formatting writes
   the masked file the way section 6.3 of the specification writes evidence:
   two-space indent, envelope keys in schema order, value keys sorted, and a
   trailing newline.
4. The harness also checks the exit codes the scenario lists.

A scenario whose expected outcome is a declaration error checks the runner's
failure and that no record or marker was written.

## Masking

Before comparison, the harness replaces:

| Field                                                        | Replaced with                                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `run.startedAt`, `run.endedAt`                               | `"<timestamp>"`                                                                                |
| every test `startedAt`, `endedAt`                            | `"<timestamp>"`                                                                                |
| every `durationMs`                                           | `0`                                                                                            |
| every check `at`                                             | removed                                                                                        |
| `run.tool`                                                   | `{"name": "<tool>", "version": "<version>", "language": "<language>", "runtime": "<runtime>"}` |
| `run.source`                                                 | `{"commit": null, "branch": null, "dirty": null}`                                              |
| `run.actor`                                                  | `{"name": null, "ci": null, "ciRunUrl": null}`                                                 |
| every `site`, also inside `error`                            | `"<scenario>:0"`, literally; a `null` site stays `null`                                        |
| `error.type` where a scenario names a language-specific type | the placeholder the scenario gives, such as `"<runtime error>"`                                |
| a check's `delegate` name                                    | `"<function>"`                                                                                 |
| the `<type>` part of `"[unserialisable: <type>]"`            | `<type>`                                                                                       |
| `run.selection`                                              | removed, because it is optional and an adapter records it only where it can read the filter    |

Because masking hides the site, the harness first checks, on the unmasked run
file, that every site points into one of the scenario's own test files.

A trace output (`<scenario>.trace.json`) is masked too: every `inputs[].path`
becomes its base name, every `inputs[].sha256` becomes `"<sha256>"`, and every
`runs[].commit` becomes `null`.

The expected files are written by the TypeScript reference implementation, then
reviewed by hand against this document before they are committed. A later
implementation that disagrees with an expected file reports the disagreement; it
does not edit the file.

## Shared Declaration

Unless a scenario says otherwise, every test uses:

```text
title:  "<scenario> test"
given:  "a conformance fixture"
when:   "the scenario runs"
then:   "the evidence matches the expected file"
scope:  read            (OQ and PQ only)
```

Where a scenario asks for "one passing check" without writing it out, the check
is `check("fixture", "one equals one").that(1).equals(1)`. A test the scenario
gives no check has none.

## Scenarios

### 1. `all-pass`

- `IQ-CONF-001`: two checks, both pass.
  - `check("fixture", "one equals one").that(1).equals(1)`
  - `check("fixture", "text contains a word").that("qualify").contains("ali")`
- Expect: outcome `pass`, two checks with `seq` 0 and 1, `pass: true`.
  Summary `{total 1, pass 1, verdict pass}`. Merge exit 0.

### 2. `failing-check-stops`

- `OQ-CONF-002`:
  - `check("fixture", "first passes").that(1).equals(1)`
  - `check("fixture", "second fails").that(2).equals(3)`
  - `check("fixture", "third never runs").that(4).equals(4)`
- Expect: outcome `fail`; two checks only, the second with `pass: false`,
  `expected: 3`, `actual: 2`; `error.type` `CheckFailed`, `error.message`
  `fixture: second fails`. Merge exit 1.

### 3. `soft-check`

- `OQ-CONF-003`:
  - `check("fixture", "soft fails").soft().that("a").equals("b")`
  - `check("fixture", "still runs").that(true).isTrue()`
- Expect: outcome `fail`; two checks, the first `soft: true, pass: false`, the
  second `pass: true`; `error.type` `CheckFailed`, `error.message`
  `1 soft check(s) failed`.

### 4. `thrown-error`

- `OQ-CONF-004`: one passing check, then the body throws the language's plain
  runtime error with message `boom` (`Error` in TypeScript, `RuntimeError` in
  Python, `IllegalStateException` in Java, `InvalidOperationException` in C#).
- Expect: outcome `error`; `error.type` the language's type name, which the
  harness masks to `"<runtime error>"`; `error.message` `boom`; one check.

### 5. `plain-assertion`

- `OQ-CONF-005`: `delegate("helper", "shared helper passes", fn)` where `fn`
  uses the language's own assertion and fails it with message `helper failed`.
- Expect: outcome `fail`; one check with matcher `delegate`, `expected`
  `"completes"`, `actual` `"helper failed"`, `pass: false`, and `delegate`
  masked to `"<function>"`; `error.type` masked to `"<assertion error>"`.

### 6. `runtime-skip`

- `OQ-CONF-006`: one passing check, then `ctx.skip("fixture not seeded")`.
- Expect: outcome `skip`, `skipReason` `fixture not seeded`, one check, no
  `error`. Merge exit 0.

### 7. `policy-skip`

- `OQ-CONF-007`: scope `read-write`, one check that passes.
- Run A with `QUALIFY_ENVIRONMENT=production`: outcome `skip`, `skipReason`
  `read-write test blocked in production environment production`,
  `run.policy.productionWriteBlocked: true`, no checks.
- Run B adds `QUALIFY_ALLOW_WRITE=OQ-CONF-007=conformance override`: outcome
  `pass`, `run.policy.overrides` `[{"id": "OQ-CONF-007", "reason": "conformance override"}]`.
- Two expected files: `policy-skip.a.json`, `policy-skip.b.json`.

### 8. `missing-scope`

- `OQ-CONF-008` declared without `scope`.
- Expect: declaration error naming the ID and `scope`; no files in
  `records/`.

### 9. `bad-id`

- `OQ-conf-009` (lower case) and `IQ-CONF-010` declared with level OQ.
- Expect: two declaration errors, one for the pattern and one for the level
  mismatch; no files in `records/`.

### 10. `secret-redaction`

- `OQ-CONF-011`, environment `QUALIFY_SECRET_CONFORMANCE_TOKEN=s3cr3t-value-123`:
  - `const t = ctx.secret("CONFORMANCE_TOKEN")`
  - `check("api", "token " + t + " is used").that("Bearer " + t).contains(t)`
  - `attach("request.json", {"url": "/x", "token": t, "note": "x " + t}, "application/json")`
  - `attach("raw.bin", <bytes 0x00 0xFF + utf8(t) + 0x00>, "application/octet-stream")`
  - then throw a plain runtime error whose message is the text `failed with`,
    a space, and `t`; the harness masks `error.type` to `"<runtime error>"`,
    as in scenario 4
- Expect: no occurrence of `s3cr3t-value-123` anywhere in any file in the
  evidence directory, including markers; `secretsUsed` `["CONFORMANCE_TOKEN"]`;
  the JSON attachment decodes to `{"note": "x [REDACTED]", "token": "[REDACTED]", "url": "/x"}`;
  the binary attachment decodes to `0x00 0xFF` + `utf8("[REDACTED]")` + `0x00`;
  outcome `error` with message `failed with [REDACTED]`.

`ctx.secret(name)` reads `QUALIFY_SECRET_<NAME>` in the core. A project can plug
in another source.

### 11. `pattern-redaction`

- `OQ-CONF-012`: one check, `check("fixture", "the output holds secret shapes")`,
  whose `actual` is a string holding, separated by
  spaces: a PEM block
  `-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----`,
  a JWT shape `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl`, and an
  access-key-ID shape made of `AKIA` followed by `ABCDEFGHIJKLMNOP`; matcher
  `isNotNull`.
- Build each of the three values at runtime by joining two parts, for example
  `"AK" + "IA" + "ABCDEFGHIJKLMNOP"`. Written whole, they look like real secrets
  to secret scanners such as gitleaks, which then fail CI on the test source.
- Expect: `actual` is `"[REDACTED] [REDACTED] [REDACTED]"`; outcome `pass`.

### 12. `several-requirements`

- `OQ-CONF-013` declares `requirements: ["REQ-1", "REQ-2"]`.
- A map file `trace.yaml` maps `OQ-CONF-013` to `REQ-3`.
- Expect: the record holds `["REQ-1", "REQ-2"]` only. `qualify trace` with the
  map lists three rows for `OQ-CONF-013`, with link sources `code`, `code` and
  `map`. Expected trace output: `several-requirements.trace.json` (TypeScript
  only).

### 13. `narrative`

- `PQ-CONF-014` with `given` `données d’entrée — 入力`, `when` `the run 🚀 starts`,
  `then` `“quoted” output`, and `and` `["first", "second", "third — 3"]`.
- Expect: every string survives byte for byte in UTF-8; outcome `pass` with one
  passing check.

### 14. `attachments`

- `OQ-CONF-015`: `attach("note.txt", "hello\n", "text/plain")` and
  `attach("blob.bin", bytes 0..255, "application/octet-stream")`; one passing check.
- `OQ-CONF-016`, environment `QUALIFY_ATTACHMENT_LIMIT=16`:
  `attach("big.txt", 17 bytes of "a", "text/plain")`, and no check.
- The limit would stop `OQ-CONF-015` too, so the harness runs the scenario
  twice into one evidence directory: once selecting `OQ-CONF-015`, once
  selecting `OQ-CONF-016` with the limit set. Then it runs one `merge`.
- Expect: `OQ-CONF-015` passes with correct `sizeBytes` (6 and 256) and
  `sha256`; `OQ-CONF-016` outcome `error`, type `AttachmentTooLarge`, no
  attachment recorded.

### 15. `value-normalisation`

- `OQ-CONF-017`, one `equals` check per value, each comparing the value with
  itself, with context `value` and the descriptions `bytes`, `instant`,
  `big integer`, `NaN`, `map`, `set` and `cycle`, in this order:
  - bytes `0x01 0x02`
  - the instant `2026-01-02T03:04:05.006Z`
  - the integer 2^60
  - `NaN` (`NaN` in every language)
  - a map `{"b": 1, "a": {"d": 2, "c": 3}}`
  - a set of the strings `"b"` and `"a"`
  - a self-referencing list or object
- Expect, in order: `{"$bytes": "AQI="}`, `"2026-01-02T03:04:05.006Z"`,
  `"1152921504606846976"`, `"NaN"`, `{"a": {"c": 3, "d": 2}, "b": 1}`,
  `["a", "b"]`, and `"[unserialisable: <type>]"` with the type masked to
  `<type>`. Every check passes, including `NaN` equal to itself, because
  equality is compared after normalisation.

### 16. `parallel-determinism`

- Scenarios 1, 2 and 13 run together twice, with the runner's parallel mode on
  and at least two workers.
- Expect: both masked run files are identical to each other and to
  `parallel-determinism.json`.

### 17. `duplicate-id`

- Two test files each declare `OQ-CONF-018`.
- Expect: `merge` exits 2 and names the ID; no run file is written.

### 18. `crash`

- `OQ-CONF-019` ends its process abruptly mid-test, after its marker is written
  (`process.kill(process.pid, "SIGKILL")` in TypeScript, `os._exit` in Python,
  `Runtime.halt` in Java, `Environment.FailFast` in C#), in a worker or child process so the harness
  survives. TypeScript cannot use `process.exit`: vitest replaces it in its
  workers with a function that throws, so the test would record an `error`
  and never crash.
- Expect: `merge` writes an `error` record with type `DidNotFinish` and message
  `test started and did not finish`; merge exit 1.

### 19. `deselected`

- `OQ-CONF-020` and `OQ-CONF-021`; the runner's own filter selects only
  `OQ-CONF-020`.
- Expect: one record; `qualify trace --protocol` with a protocol listing both
  shows `OQ-CONF-021` as not run; trace exit 3. Expected trace output:
  `deselected.trace.json` (TypeScript only).

### 20. `control-pair`

- `OQ-CONF-022`: a negative test, title "an unsigned call is refused".
- `OQ-CONF-023`: its control, `controls: "OQ-CONF-022"`, title "a signed call
  is accepted".
- Expect: the record of `OQ-CONF-023` has `controls`; the trace matrix shows the
  pair on adjacent rows. Expected trace output: `control-pair.trace.json`
  (TypeScript only).

### 21. `report`

- Run scenarios 1, 2 and 6 together as one run, merge, then render
  `qualify report <run file> --pdf report.pdf --protocol report.protocol.yaml
--title "Conformance report" --document-id CONF-RPT-001` with
  `QUALIFY_REPORT_TIME=2026-01-02T03:04:05.006Z` and no `--theme`, so the
  default `lekman` theme applies. `report.protocol.yaml` lists `IQ-CONF-001`,
  `OQ-CONF-002`, `OQ-CONF-006` and `OQ-CONF-099`; every language uses the same
  file, [fixtures/report.protocol.yaml](fixtures/report.protocol.yaml).
- Extract the PDF's text with the language's own PDF library, collapse runs of
  whitespace to one space, and drop empty lines.
- Expect: every line of `expected/report.outline.txt` appears in the extracted
  text, in the same order. Other lines may sit between them, so layout and
  wrapping may differ between languages. An outline line is found when it is
  part of an extracted line, at or after the end of the previous match; several
  outline lines may come from one extracted line, such as the cells of one
  table row. The outline covers:
  - the cover: `lekman.com`, the title, the subtitle
    `IQ and OQ qualification, local environment, 2026-01-02`, and the cover
    rows in theme order (document ID, `2026-01-02`, `Failed`, the counts,
    `local`, `-` for the version, `Internal`);
  - page 2: the header (title and `Internal`), the title as a level 1 heading,
    `Run details` with the run ID `01HQA1ZQJ0C0NF0RMANCE00000` and the
    generation time `2026-01-02 03:04:05 UTC`;
  - the trace rows, `OQ-CONF-099` listed as not run, each test heading in ID
    order, `fixture: second fails`, `fixture not seeded`, the three signature
    roles, and the footer `CONF-RPT-001 Page 2 of`.
- Expect: the cover page has no header and no footer text.
- Expect: PDF metadata `Title` `Conformance report`, `Subject`
  `01HQA1ZQJ0C0NF0RMANCE00000`, and `Keywords` containing `sha256:` followed by
  the run file's digest.
- Expect: `report` exits 0 although the run failed.

### 22. `report-theme`

- Use the run file from scenario 21.
- Run A: `--theme plain`. Expect: every line of
  `expected/report-plain.outline.txt` in order. That outline has the title and
  subtitle but no `lekman.com`, no `Classification` row, and a `Commit`
  row with `-` when the source commit is null; exit 0.
- Run B: `--theme fixtures/bad-theme/theme.json`, a copy of the `plain` theme
  whose `texts.footer` holds the unknown token `{nope}`. Expect: exit 2, an
  error naming `{nope}`, and no PDF written.
- Run C: `--theme lekman --classification "Commercial in confidence"
--no-signatures`. Expect: `Commercial in confidence` on the cover and in the
  page 2 header, and none of the three signature roles; exit 0.

## Exit Codes Checked

| Scenario              | `merge` | `trace` | `report` |
| --------------------- | ------- | ------- | -------- |
| `all-pass`            | 0       | 0       | n/a      |
| `failing-check-stops` | 1       | 1       | n/a      |
| `runtime-skip`        | 0       | 0       | n/a      |
| `duplicate-id`        | 2       | n/a     | n/a      |
| `crash`               | 1       | 1       | n/a      |
| `deselected`          | 0       | 3       | n/a      |
| `report`              | 1       | n/a     | 0        |
| `report-theme`        | n/a     | n/a     | 0, 2, 0  |
