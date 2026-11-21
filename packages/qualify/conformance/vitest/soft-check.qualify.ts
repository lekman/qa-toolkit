import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-CONF-003",
  "soft-check test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    ctx.check("fixture", "soft fails").soft().that("a").equals("b");
    ctx.check("fixture", "still runs").that(true).isTrue();
  },
);
