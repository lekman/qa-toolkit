import type { IResultFiles, IResultReader, TestResult } from "../results";
import type { ResolvedTest } from "../workspace";

/** Runs a shell command. */
export interface IProcessRunner {
  /** Runs the command and resolves with its exit code, or `null` when it was stopped. */
  run(
    command: string,
    options: {
      cwd: string;
      env: Readonly<Record<string, string>>;
      onOutput: (text: string) => void;
      signal: AbortSignal;
    },
  ): Promise<null | number>;
}

/** Shows a run's progress and results, such as in the Testing view. */
export interface IRunReporter {
  /** A test that cannot run, with the reason. */
  errored(test: ResolvedTest, message: string): void;
  /** Output of the run, not tied to one test. */
  output(text: string): void;
  /** The result of a test, from its evidence. */
  result(test: ResolvedTest, result: TestResult): void;
  /** A test whose command has started. */
  started(test: ResolvedTest): void;
}

/** The ports a run uses. */
export interface RunPorts {
  /** The current time in milliseconds. */
  clock: () => number;
  files: IResultFiles;
  process: IProcessRunner;
  /** Result readers by format; qualify evidence when left out. */
  readers?: readonly IResultReader[];
  reporter: IRunReporter;
}
