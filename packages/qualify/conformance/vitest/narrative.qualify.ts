import { pq } from "@lekman/qualify/vitest";

pq(
  "PQ-CONF-014",
  "narrative test",
  {
    given: "données d’entrée — 入力",
    when: "the run 🚀 starts",
    then: "“quoted” output",
    and: ["first", "second", "third — 3"],
    scope: "read",
  },
  (ctx) => {
    ctx.check("fixture", "one equals one").that(1).equals(1);
  },
);
