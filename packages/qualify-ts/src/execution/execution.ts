import { join } from "node:path";

import type { Declaration, Level, Narrative } from "../declaration";
import type {
  FailureRecord,
  RecordFile,
  RunInfo,
  StartedFile,
  TestRecord,
} from "../evidence";
import type { RunnerErrors } from "../outcome";
import type { JsonValue } from "../values";
import type {
  ProcessContext,
  Registration,
  RunResult,
  SiteContext,
  TestBody,
} from "./types";

import { CheckFailed, SkipSignal, TestContext } from "../checks";
import { DeclarationError, Declarations } from "../declaration";
import { EVIDENCE_SHAPE, EvidenceFiles } from "../evidence";
import { Outcomes } from "../outcome";
import { Redaction } from "../redaction";
import { Policy } from "../settings";
import { Site } from "../site";
import { JsonText } from "../values";
import { Attachments } from "./attachments";

const scrub = (error: unknown, registered: readonly string[]): void => {
  if (typeof error !== "object" || error === null) return;
  const target = error as { message?: unknown; stack?: unknown };
  for (const key of ["message", "stack"] as const) {
    const value = target[key];
    if (typeof value !== "string") continue;
    const redacted = Redaction.text(value, registered);
    if (redacted === value) continue;
    try {
      target[key] = redacted;
    } catch {
      // A frozen error keeps its text; the evidence is redacted either way.
    }
  }
};

/**
 * Runs one qualification test the same way under every runner: validate the
 * declaration, write the started marker, apply the policy, run the body, and
 * write the redacted record. Adapters only register the test and map the
 * result back to their runner.
 */
export class Execution {
  /**
   * Validate a declaration at registration. The site is read from `stack`,
   * the stack at the level function's call.
   */
  static declare(
    level: Level,
    id: unknown,
    title: unknown,
    narrative: Narrative | undefined,
    stack: string | undefined,
    sites: SiteContext,
  ): Registration {
    const name = Declarations.displayName(id, title);
    const frame = Site.caller(stack, sites.exclude);
    try {
      if (frame === undefined) {
        throw new DeclarationError(String(id), [
          "could not find the test file in the stack trace",
        ]);
      }
      const declared = Declarations.validate(
        level,
        id,
        title,
        narrative,
        Site.format(frame, sites.root),
      );
      return { valid: true, name, declared, file: frame.path };
    } catch (error) {
      return { valid: false, name, error: error as Error };
    }
  }

  /**
   * Hand a result back to the runner: return for a pass, throw for a
   * failure, and mark a skip with the runner's own skip where it has one.
   */
  static finish(result: RunResult, skip: (reason: string) => void): void {
    if (result.outcome === "pass") return;
    if (result.outcome === "skip") {
      if (result.rethrow !== undefined) throw result.rethrow;
      skip(result.reason);
      return;
    }
    throw result.rethrow;
  }

  /** Run a registered test and write its evidence. */
  static async run<R>(
    registration: Extract<Registration, { valid: true }>,
    body: TestBody<R>,
    runnerContext: R,
    process: ProcessContext,
    runner: RunnerErrors,
  ): Promise<RunResult> {
    const { declaration } = registration.declared;
    const run = Execution.envelope(process.envelope);
    const key = EvidenceFiles.key(declaration.site);
    const records = join(process.evidenceDir, "records");
    const started = process.now();

    const marker: StartedFile = {
      schemaVersion: 1,
      kind: "started",
      run,
      test: {
        ...Execution.redactDeclaration(declaration, process.registry.values()),
        startedAt: started.toISOString(),
      },
    };
    await process.writer.write(
      join(records, EvidenceFiles.marker(run.id, declaration.id, key)),
      JsonText.document(marker, EVIDENCE_SHAPE),
    );

    const policySkip = Policy.skipReason(declaration, process.settings);
    const ctx = new TestContext({
      attachmentLimit: process.settings.attachmentLimit,
      environment: process.settings.environment,
      id: declaration.id,
      level: declaration.level,
      now: () => process.now(),
      readSecret: process.settings.readSecret,
      registry: process.registry,
      runContext: () => ({
        actor: run.actor,
        source: run.source,
        target: run.target,
      }),
      site: () => {
        const frame = Site.caller(new Error().stack, process.sites.exclude);
        return frame
          ? Site.format(frame, process.sites.root)
          : declaration.site;
      },
      warn: (message) => process.warn(message),
    });

    let thrown: undefined | { error: unknown };
    if (policySkip === undefined) {
      try {
        await body(ctx, runnerContext);
      } catch (error) {
        thrown = { error };
      }
      const late = await ctx.settle();
      thrown ??= late;
    }

    const classification =
      policySkip === undefined
        ? Outcomes.classify(thrown, ctx.softFailures().length, runner)
        : { outcome: "skip" as const, skipReason: policySkip };
    const ended = process.now();
    const registered = process.registry.values();

    let error: FailureRecord | undefined;
    if (classification.failure) {
      error = {
        ...classification.failure,
        site: Execution.failureSite(
          thrown,
          ctx,
          registration.file,
          process.sites,
        ),
      };
    }
    const test = Redaction.value(
      {
        ...declaration,
        outcome: classification.outcome,
        ...(classification.skipReason === undefined
          ? {}
          : { skipReason: classification.skipReason }),
        ...(error === undefined ? {} : { error }),
        startedAt: started.toISOString(),
        endedAt: ended.toISOString(),
        durationMs: Math.max(0, ended.getTime() - started.getTime()),
        checks: ctx.checks(),
        attachments: [],
        secretsUsed: ctx.secretsUsed(),
      } as unknown as JsonValue,
      registered,
    ) as unknown as TestRecord;
    test.attachments = ctx
      .attachments()
      .map((pending) => Attachments.finalise(pending, registered));

    const record: RecordFile = { schemaVersion: 1, kind: "record", run, test };
    await process.writer.write(
      join(records, EvidenceFiles.record(run.id, declaration.id, key)),
      JsonText.document(record, EVIDENCE_SHAPE),
    );

    switch (classification.outcome) {
      case "pass":
        return { outcome: "pass" };
      case "skip": {
        const reason = test.skipReason as string;
        return policySkip !== undefined || SkipSignal.is(thrown?.error)
          ? { outcome: "skip", reason }
          : { outcome: "skip", reason, rethrow: thrown?.error };
      }
      default: {
        const failure =
          thrown?.error ??
          new CheckFailed(
            (error as FailureRecord).message,
            (error as FailureRecord).site ?? declaration.site,
          );
        scrub(failure, registered);
        return { outcome: classification.outcome, rethrow: failure };
      }
    }
  }

  /** The envelope as files carry it: pattern rules applied to every string. */
  private static envelope(envelope: RunInfo): RunInfo {
    return Redaction.value(
      envelope as unknown as JsonValue,
      [],
    ) as unknown as RunInfo;
  }

  private static failureSite(
    thrown: undefined | { error: unknown },
    ctx: TestContext,
    file: string,
    sites: SiteContext,
  ): null | string {
    if (thrown === undefined) return ctx.softFailures()[0]?.site ?? null;
    if (CheckFailed.is(thrown.error)) return thrown.error.site;
    const stack =
      typeof thrown.error === "object" && thrown.error !== null
        ? (thrown.error as { stack?: unknown }).stack
        : undefined;
    const frame = Site.inFile(
      typeof stack === "string" ? stack : undefined,
      file,
    );
    return frame ? Site.format(frame, sites.root) : null;
  }

  private static redactDeclaration(
    declaration: Declaration,
    registered: readonly string[],
  ): Declaration {
    return Redaction.value(
      declaration as unknown as JsonValue,
      registered,
    ) as unknown as Declaration;
  }
}
