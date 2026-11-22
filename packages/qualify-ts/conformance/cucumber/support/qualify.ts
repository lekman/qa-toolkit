// The support file a project writes: one call adds qualify's hooks.
import { Before } from "@cucumber/cucumber";
import { install } from "@lekman/qualify/cucumber";
import { appendFileSync } from "node:fs";

install();

// Harness only: records which parallel worker ran each scenario, so the
// parallel scenario can prove it ran on at least two workers.
Before(function () {
  const log = process.env.CONFORMANCE_WORKER_LOG;
  const worker = process.env.CUCUMBER_WORKER_ID;
  if (log !== undefined && log.length > 0 && worker !== undefined) {
    appendFileSync(log, `${worker}\n`);
  }
});
