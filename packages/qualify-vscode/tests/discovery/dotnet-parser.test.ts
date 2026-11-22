import { describe, expect, test } from "bun:test";

import { Discovery } from "../../src/discovery";

const FILE = "/repo/Acme.Tests/BankFileTests.cs";

describe("C# discovery", () => {
  test("reads an attribute, its class and its method", () => {
    const [d] = Discovery.parse(
      FILE,
      `using Lekman.Qualify;

public class BankFileTests
{
    [OQ("OQ-EXPORT-003", "The bank file never changes an amount",
        Given = "a day of payments",
        When = "the export runs",
        Then = "every amount matches",
        Requirements = ["EXPORT-003"], Risk = Risk.High, Scope = Scope.ReadWrite,
        Tags = new[] { "export" })]
    [Trait("Area", "export")]
    public async Task BankFileKeepsAmounts()
    {
    }
}
`,
    );
    expect(d).toMatchObject({
      className: "BankFileTests",
      framework: "xunit",
      id: "OQ-EXPORT-003",
      language: "dotnet",
      line: 5,
      method: "BankFileKeepsAmounts",
      problems: [],
      requirements: ["EXPORT-003"],
      risk: "high",
      scope: "read-write",
      tags: ["export"],
    });
  });

  test("reads an attribute in a list, with a verbatim string", () => {
    const [d] = Discovery.parse(
      FILE,
      `using Lekman.Qualify;
public class A {
    [Trait("x", "y"), IU("IU-PAY-001", @"A ""quoted"" title", Given = "g", When = "w", Then = "t")]
    public void Pays() {}
}
`,
    );
    expect(d).toMatchObject({
      id: "IU-PAY-001",
      method: "Pays",
      problems: [],
      title: 'A "quoted" title',
    });
  });

  test("an IQ attribute that declares a scope is an error", () => {
    const [d] = Discovery.parse(
      FILE,
      `using Lekman.Qualify;
public class A {
    [IQAttribute("IQ-SETUP-001", "t", Given = "g", When = "w", Then = "t", Scope = Scope.Read)]
    public void Starts() {}
}
`,
    );
    expect(d?.problems).toEqual([
      "an IQ test does not declare a scope: IQ is always read and IU always read-write",
    ]);
  });
});
