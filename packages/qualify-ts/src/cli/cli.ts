#!/usr/bin/env node
/**
 * qualify command line entrypoint. Wiring only: the commands live in
 * `commands.ts` and are covered by tests; this file is excluded from coverage.
 */

import { SystemCliIO } from "./cli.system";
import { Commands } from "./commands";

Commands.run(process.argv.slice(2), SystemCliIO.create()).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `qualify: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 2;
  },
);
