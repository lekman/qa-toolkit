# qualify: Conformance Scenarios

> **Status:** Draft v1 | Part of the [qualify specification](../README.md)

Every implementation runs every scenario below as real test files through its
real runner integration, then runs `merge` and compares the masked run file with
the shared expected file. Replaying stored output is not conformance: it proves
the serialiser and misses outcome bugs.

## How a Scenario Runs

1. The scenario's test files live in the implementation, for example
   `packages/qualify/conformance/<scenario>.test.ts`,
   `packages/qualify-python/conformance/test_<scenario>.py` and
   `packages/qualify-jvm/src/conformance/.../<Scenario>Test.java`. They declare
   exactly the tests listed here, with the same IDs, narratives, checks and
   values, in the language's own syntax.
2. The harness runs them with `QUALIFY_RUN_ID=01HQA1ZQJ0C0NF0RMANCE00000`,
   `QUALIFY_EVIDENCE_DIR` set to a fresh temporary directory, and the
   environment variables the scenario lists. Nothing else from the real
   environment leaks in: the harness clears every other `QUALIFY_*` variable.
3. The harness runs `merge`, masks the run file (below), and compares it with
   `expected/<scenario>.json` byte for byte after formatting.
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
| the line number in every `site`                              | `0`, and the path reduced to `<scenario>`                                                      |
| `error.type` where a scenario names a language-specific type | the placeholder the scenario gives, such as `"<runtime error>"`                                |
| a check's `delegate` name                                    | `"<function>"`                                                                                 |
| the `<type>` part of `"[unserialisable: <type>]"`            | `<type>`                                                                                       |

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
  Python, `IllegalStateException` in Java).
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
  - then throw a plain runtime error with message `failed with ` + `t`
- Expect: no occurrence of `s3cr3t-value-123` anywhere in any file in the
  evidence directory, including markers; `secretsUsed` `["CONFORMANCE_TOKEN"]`;
  the JSON attachment decodes to `{"note": "x [REDACTED]", "token": "[REDACTED]", "url": "/x"}`;
  the binary attachment decodes to `0x00 0xFF` + `utf8("[REDACTED]")` + `0x00`;
  outcome `error` with message `failed with [REDACTED]`.

`ctx.secret(name)` reads `QUALIFY_SECRET_<NAME>` in the core. A project can plug
in another source.

### 11. `pattern-redaction`

- `OQ-CONF-012`: one check whose `actual` is a string holding, separated by
  spaces: a PEM block
  `-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----`,
  a JWT shape `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl`, and
  `AKIAABCDEFGHIJKLMNOP`; matcher `isNotNull`.
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
  `attach("big.txt", 17 bytes of "a", "text/plain")`.
- Expect: `OQ-CONF-015` passes with correct `sizeBytes` (6 and 256) and
  `sha256`; `OQ-CONF-016` outcome `error`, type `AttachmentTooLarge`, no
  attachment recorded.

### 15. `value-normalisation`

- `OQ-CONF-017`, one `equals` check per value, each comparing the value with
  itself:
  - bytes `0x01 0x02`
  - the instant `2026-01-02T03:04:05.006Z`
  - the integer 2^60
  - `NaN` (Python and Java `NaN`; TypeScript `NaN`)
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
  (`process.exit` in TypeScript, `os._exit` in Python, `Runtime.halt` in Java),
  in a worker or child process so the harness survives.
- Expect: `merge` writes an `error` record with type `DidNotFinish` and message
  `test started and did not finish`; merge exit 1.

### 19. `deselected`

- `OQ-CONF-020` and `OQ-CONF-021`; the runner's own filter selects only
  `OQ-CONF-020`.
- Expect: one record; `qualify trace --protocol` with a protocol listing both
  shows `OQ-CONF-021` as not run; trace exit 3.

### 20. `control-pair`

- `OQ-CONF-022`: a negative test, "an unsigned call is refused".
- `OQ-CONF-023`: its control, `controls: "OQ-CONF-022"`, "a signed call is
  accepted".
- Expect: the record of `OQ-CONF-023` has `controls`; the trace matrix shows the
  pair on adjacent rows.

## Exit Codes Checked

| Scenario              | `merge` | `trace` |
| --------------------- | ------- | ------- |
| `all-pass`            | 0       | 0       |
| `failing-check-stops` | 1       | 1       |
| `runtime-skip`        | 0       | 0       |
| `duplicate-id`        | 2       | n/a     |
| `crash`               | 1       | 1       |
| `deselected`          | 0       | 3       |
