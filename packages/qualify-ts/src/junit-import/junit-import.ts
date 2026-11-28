import type { RunFile } from "../evidence";
import type { ImportRequest } from "./types";

import { Merge } from "../merge";
import { JUnit } from "./junit";
import { Lcov } from "./lcov";

/** The run file of `qualify import junit` and the exit code its verdict implies. */
export interface ImportResult {
  exitCode: 0 | 1 | 3;
  file: RunFile;
}

/**
 * `qualify import junit`: a run file from JUnit XML and LCOV, section 6.6.
 * Pure: the caller reads the files and supplies the envelope and the time.
 */
export class JUnitImport {
  /** Build the run file. Throws `ImportError` for input that cannot be read. */
  static build(request: ImportRequest): ImportResult {
    const reports = request.junit.map((source) =>
      JUnit.read(source.text, source.path, request.level),
    );
    const cases = reports.flatMap((r) => r.cases);
    const starts = reports.flatMap((r) =>
      r.startedAt === undefined ? [] : [r.startedAt],
    );
    const ends = reports.flatMap((r) =>
      r.endedAt === undefined ? [] : [r.endedAt],
    );
    const now = request.now.getTime();
    const startedAt = starts.length > 0 ? Math.min(...starts) : now;
    const endedAt = ends.length > 0 ? Math.max(...ends) : now;

    const summary = Merge.summary(cases);
    const file: RunFile = {
      schemaVersion: 1,
      kind: "run",
      run: {
        ...request.envelope,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
      },
      summary,
      tests: [],
      imported: [
        ...request.junit.map((s) => ({
          kind: "junit" as const,
          path: s.path,
          sha256: s.sha256,
        })),
        ...request.coverage.map((s) => ({
          kind: "lcov" as const,
          path: s.path,
          sha256: s.sha256,
        })),
      ],
      cases,
    };
    if (request.coverage.length > 0) {
      file.coverage = Lcov.coverage(
        request.coverage.flatMap((s) => Lcov.parse(s.text, s.path)),
        request.cwd,
      );
    }
    const exitCode =
      summary.verdict === "fail" ? 1 : summary.verdict === "incomplete" ? 3 : 0;
    return { exitCode, file };
  }
}
