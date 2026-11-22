import { describe, expect, test } from "bun:test";

import { Discovery } from "../../src/discovery";

const FILE = "/repo/lib/tests/test_export.py";

describe("Python discovery", () => {
  test("reads a decorator, its keywords and the test function", () => {
    const [d] = Discovery.parse(
      FILE,
      `import qualify


class TestExport:
    @qualify.oq(
        "OQ-EXPORT-003",
        "The bank file never changes an amount",
        given="a day of payments",
        when="the export runs",
        then="every amount matches",
        and_=["no file is left behind"],
        requirements=["EXPORT-003"],
        risk="high",
        scope="read",
        tags=["export"],
    )
    def test_bank_file_keeps_amounts(self, ctx, ledger):
        pass
`,
    );
    expect(d).toMatchObject({
      className: "TestExport",
      framework: "pytest",
      id: "OQ-EXPORT-003",
      level: "OQ",
      line: 5,
      method: "test_bank_file_keeps_amounts",
      problems: [],
      requirements: ["EXPORT-003"],
      risk: "high",
      tags: ["export"],
    });
  });

  test("reads an imported decorator, implicit string joins and triple-quoted strings", () => {
    const [d] = Discovery.parse(
      FILE,
      `from qualify import iu

# @iu("IU-COMMENT-001", "in a comment")
@iu("IU-ORDER-001", "An order " "is accepted", given="""a basket""", when='the user pays', then="the order is placed")
async def test_order(ctx):
    pass
`,
    );
    expect(d).toMatchObject({
      id: "IU-ORDER-001",
      line: 4,
      method: "test_order",
      problems: [],
      title: "An order is accepted",
    });
  });

  test("reads nothing from a file that does not import qualify", () => {
    expect(
      Discovery.parse(FILE, `@oq("OQ-AB-001", "t")\ndef test_a(): pass\n`),
    ).toEqual([]);
  });

  test("a lower-case ID and a missing scope are errors", () => {
    const [d] = Discovery.parse(
      FILE,
      `import qualify
@qualify.oq("OQ-export-001", "t", given="g", when="w", then="t")
def test_a(ctx): pass
`,
    );
    expect(d?.problems).toEqual([
      "the ID OQ-export-001 does not match ^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$",
      "scope is missing: an OQ test declares read or read-write",
    ]);
  });
});
