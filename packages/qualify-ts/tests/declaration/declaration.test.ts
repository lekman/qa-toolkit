import { describe, expect, test } from "bun:test";

import { DeclarationError, Declarations } from "../../src/declaration";

const narrative = { given: "g", when: "w", then: "t" };

const problems = (fn: () => unknown): readonly string[] => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DeclarationError);
    return (error as DeclarationError).problems;
  }
  throw new Error("expected a DeclarationError");
};

describe("Declarations.validate", () => {
  test("a full OQ declaration", () => {
    const { declaration, timeoutMs } = Declarations.validate(
      "OQ",
      "OQ-EXPORT-003",
      "The bank file never changes an amount",
      {
        ...narrative,
        and: ["more"],
        scope: "read",
        requirements: ["EXPORT-003"],
        risk: "high",
        tags: ["b", "a", "b"],
        controls: "OQ-EXPORT-004",
        timeoutMs: 500,
      },
      "x.ts:1",
    );
    expect(declaration).toEqual({
      id: "OQ-EXPORT-003",
      level: "OQ",
      title: "The bank file never changes an amount",
      given: "g",
      when: "w",
      then: "t",
      and: ["more"],
      scope: "read",
      requirements: ["EXPORT-003"],
      risk: "high",
      tags: ["a", "b"],
      controls: "OQ-EXPORT-004",
      site: "x.ts:1",
    });
    expect(timeoutMs).toBe(500);
  });

  test("IQ is read and IU read-write without declaring a scope", () => {
    expect(
      Declarations.validate("IQ", "IQ-A1-001", "t", narrative, "s:1")
        .declaration.scope,
    ).toBe("read");
    expect(
      Declarations.validate("IU", "IU-A1-001", "t", narrative, "s:1")
        .declaration.scope,
    ).toBe("read-write");
    expect(
      problems(() =>
        Declarations.validate(
          "IQ",
          "IQ-A1-001",
          "t",
          { ...narrative, scope: "read" },
          "s:1",
        ),
      ),
    ).toEqual([
      "scope must not be declared for IQ tests, which are always read",
    ]);
  });

  test("OQ and PQ need a scope", () => {
    expect(
      problems(() =>
        Declarations.validate("PQ", "PQ-A1-001", "t", narrative, "s:1"),
      ),
    ).toEqual(["scope is required for PQ tests (read or read-write)"]);
    expect(
      problems(() =>
        Declarations.validate(
          "OQ",
          "OQ-A1-001",
          "t",
          { ...narrative, scope: "write" as never },
          "s:1",
        ),
      ),
    ).toEqual(["scope must be read or read-write"]);
  });

  test("the error names the ID", () => {
    expect(() =>
      Declarations.validate("OQ", "OQ-CONF-008", "t", narrative, "s:1"),
    ).toThrow("qualify declaration OQ-CONF-008: scope is required");
  });

  test("bad IDs", () => {
    expect(
      problems(() =>
        Declarations.validate(
          "OQ",
          "OQ-conf-009",
          "t",
          { ...narrative, scope: "read" },
          "s:1",
        ),
      )[0],
    ).toContain("does not match the pattern");
    expect(
      problems(() =>
        Declarations.validate(
          "OQ",
          "IQ-CONF-010",
          "t",
          { ...narrative, scope: "read" },
          "s:1",
        ),
      ),
    ).toEqual(["ID prefix IQ does not match the declared level OQ"]);
    expect(
      problems(() =>
        Declarations.validate(
          "OQ",
          "OQ-EXPORT-API-001",
          "t",
          { ...narrative, scope: "read" },
          "s:1",
        ),
      ),
    ).toHaveLength(1);
    expect(
      problems(() =>
        Declarations.validate(
          "OQ",
          7,
          "t",
          { ...narrative, scope: "read" },
          "s:1",
        ),
      ),
    ).toHaveLength(1);
  });

  test("collects every problem at once", () => {
    const found = problems(() =>
      Declarations.validate(
        "OQ",
        "OQ-A1-001",
        "two\nlines",
        {
          given: "",
          when: " ",
          then: "t",
          and: [""],
          requirements: ["R", "R", "x".repeat(65)],
          risk: "huge" as never,
          tags: [""],
          controls: "nope",
          timeoutMs: -1,
          extra: 1,
        } as never,
        "s:1",
      ),
    );
    expect(found).toEqual([
      "title must be one line",
      "unknown field extra",
      "given must not be empty",
      "when must not be empty",
      "and must be a list of clauses, each not empty",
      "scope is required for OQ tests (read or read-write)",
      "each requirement ID must be 1 to 64 characters",
      "requirements are duplicated: R",
      "risk must be high, medium or low",
      "tags must be a list of strings, each not empty",
      "controls must be the ID of another qualification test",
      "timeoutMs must be a positive number",
    ]);
  });

  test("other invalid shapes", () => {
    expect(
      problems(() =>
        Declarations.validate("OQ", "OQ-A1-001", "", undefined, "s:1"),
      ),
    ).toEqual([
      "title must not be empty",
      "the narrative (given, when, then) is missing",
    ]);
    expect(
      problems(() =>
        Declarations.validate(
          "XQ" as never,
          "OQ-A1-001",
          "t",
          narrative,
          "s:1",
        ),
      )[0],
    ).toBe("unknown level XQ");
    expect(
      problems(() =>
        Declarations.validate(
          "OQ",
          "OQ-A1-001",
          "t",
          { ...narrative, scope: "read", requirements: "R" as never },
          "s:1",
        ),
      ),
    ).toEqual(["requirements must be a list of requirement IDs"]);
    expect(
      problems(() =>
        Declarations.validate(
          "OQ",
          "OQ-A1-001",
          "t",
          { ...narrative, scope: "read", controls: "OQ-A1-001" },
          "s:1",
        ),
      ),
    ).toEqual(["a test cannot be the control for itself"]);
  });
});

describe("Declarations helpers", () => {
  test("display name and ID check", () => {
    expect(Declarations.displayName("OQ-A1-001", "Title")).toBe(
      "[OQ-A1-001] Title",
    );
    expect(Declarations.isTestId("IU-AB-123")).toBe(true);
    expect(Declarations.isTestId("IU-AB-12")).toBe(false);
  });
});
