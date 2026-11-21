# Qualification Tests

The reasoning behind qualify: the
[specification](../../spec/qualify/README.md) and the TypeScript package
[@lekman/qualify](../../packages/qualify/README.md), with Python and Java
packages to follow.

## The Problem

Regulated teams have to show that a system was installed correctly (IQ),
works as specified (OQ), performs under real conditions (PQ) and fits its
intended use (IU). The usual evidence is a document: a protocol written in a
word processor, executed by hand, with screenshots pasted in and a signature
at the end. It is slow, it drifts from the system it describes, and nobody
runs it again after the next release.

Automated tests fix the speed and the drift, but on their own they make poor
evidence. A green run says the tests passed. It does not say what each test
claimed, which requirement it covers, what values it saw, where it ran, or
which commit it ran against. A reviewer cannot read the test code, and six
months later the CI log is gone. Teams end up writing the document anyway,
by hand, from the test results.

Two smaller failures make it worse. Secrets leak into evidence, because a
test that logs a request logs the token with it. And evidence goes missing,
because a report written by an end-of-run hook is never written when a worker
crashes, which is exactly the run a reviewer wants to see.

## The Pattern

1. **An ordinary test with an ID and a narrative.** The test keeps running in
   the team's own runner. It gains an ID that says its level (`OQ-EXPORT-003`)
   and a narrative in given, when and then, written for a reviewer.
2. **Checks that record themselves.** Each check states a context and a claim
   in words, then the value. The record holds the claim, the expected and
   actual values, and where in the code it was made, so the reviewer reads
   the claim and the evidence side by side.
3. **The process that ran the test writes the record.** A marker is written
   before the body and a record after it. A test that never finishes leaves a
   marker without a record, and that becomes an `error` instead of silence.
4. **Redaction before the record leaves the process.** Secrets read through
   the context, and anything shaped like a key or token, are replaced before
   the file is written. Nothing downstream needs to be trusted with them.
5. **Merge, then trace.** One command builds the run file and its digest; a
   second links each result to its requirements, from the code, a protocol
   file and a mapping file, and reports what did not run.
6. **One contract, several languages.** A JSON Schema and a set of scenarios
   that real runners must reproduce byte for byte keep the TypeScript, Python
   and Java packages honest with each other.

## What It Costs

- **Discipline in the test.** Checks need a context and a description. That
  is the point, but it is more typing than `expect(x).toBe(y)`, and a check
  with a lazy description is poor evidence however it is stored.
- **A policy you must configure.** Write protection only helps if the
  production environment names are right. A resolver that fails is treated
  as production, which blocks writes in an environment that was safe.
- **Evidence is data, not a document.** Approval states, signatures and PDF
  reports belong to a document control system. qualify gives it a JSON file
  and a digest; it does not replace it.
- **The runner decides what a skip looks like.** The record always says
  `skip`, but some runners show a runtime skip as a pass.

## When Not to Use It

- **When nobody reads the evidence.** For a team whose tests already tell it
  everything it needs, the narrative and the records are overhead.
- **For unit tests.** Qualification tests check a deployed system against
  requirements. Unit tests check code, run in milliseconds, and should stay
  plain.
- **For load and soak tests.** A test that runs for hours and produces
  millions of measurements wants a metrics store. Record its summary as one
  qualification test instead.
- **As the only control.** Evidence shows what was checked. It does not show
  that the right things were checked; that is still a reviewer's job, and the
  trace matrix is there to make it easier.
