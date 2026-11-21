/**
 * Harness-only setup file: records which worker ran each test file, so the
 * parallel-determinism scenario can prove it ran on at least two workers.
 * Writes nothing when CONFORMANCE_WORKER_LOG is not set.
 */

import { appendFileSync } from "node:fs";
import { threadId } from "node:worker_threads";

const log = process.env.CONFORMANCE_WORKER_LOG;
if (log !== undefined && log.length > 0) {
  appendFileSync(log, `${process.pid}:${threadId}\n`);
}
