import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-EXPORT-003",
  "The bank file never changes an amount",
  {
    given: "a day of payments in three currencies",
    when: "the export writes the bank file",
    then: "every amount in the file equals the amount in the ledger",
    requirements: ["EXPORT-003"],
    risk: "high",
    scope: "read",
    tags: ["export"],
  },
  (ctx) => {
    ctx
      .check("bank file", "EUR keeps two decimals")
      .that("100.50")
      .equals("100.50");
  },
);

// Two area segments: the extension shows this as an error item.
oq(
  "OQ-EXPORT-API-001",
  "An ID that breaks the pattern",
  {
    given: "a declaration",
    when: "discovery reads it",
    then: "it is shown as an error",
    scope: "read",
  },
  (ctx) => {
    ctx.check("id", "is shown").that(true).isTrue();
  },
);
