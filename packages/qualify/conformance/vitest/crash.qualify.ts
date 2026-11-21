import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-CONF-019",
  "crash test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  () => {
    // vitest replaces process.exit with a function that throws, so the test
    // would record an error instead of crashing. SIGKILL ends the worker
    // process at once, after the marker is written.
    process.kill(process.pid, "SIGKILL");
  },
);
