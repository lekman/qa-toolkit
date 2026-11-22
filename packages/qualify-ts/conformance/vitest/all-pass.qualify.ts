import { iq } from "@lekman/qualify/vitest";

iq(
  "IQ-CONF-001",
  "all-pass test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
  },
  (ctx) => {
    ctx.check("fixture", "one equals one").that(1).equals(1);
    ctx
      .check("fixture", "text contains a word")
      .that("qualify")
      .contains("ali");
  },
);
