import { describe, expect, test } from "bun:test";

import { Discovery } from "../../src/discovery";

const FILE = "/repo/web/features/support.feature";

describe("Gherkin discovery", () => {
  test("reads scenarios named with an ID, with feature and scenario tags", () => {
    const found = Discovery.parse(
      FILE,
      `@support
Feature: Support

  # Intended use: the team sees every request.
  @REQ-SUPPORT-001 @risk-medium
  Scenario: IU-SUPPORT-001 Support lists the tickets of every customer
    Given I open the app
    When I go to "Support"
    Then I see the "Support" heading
    And the list shows "ACME-12"

  Scenario: A scenario without an ID is not a qualification test
    Given a
    When b
    Then c
`,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      framework: "cucumber",
      id: "IU-SUPPORT-001",
      language: "gherkin",
      level: "IU",
      line: 6,
      problems: [],
      requirements: ["REQ-SUPPORT-001"],
      risk: "medium",
      tags: ["support"],
      title: "Support lists the tickets of every customer",
    });
  });

  test("a rule's tags apply to its scenarios, and doc strings are skipped", () => {
    const [d] = Discovery.parse(
      FILE,
      `Feature: f
  @scope-read @nightly
  Rule: r
    @REQ-1 @REQ-2 @controls-OQ-CONF-022
    Scenario: OQ-CONF-023 a signed call is accepted # not a comment in a name
      Given a fixture
        """
        Scenario: IU-FAKE-001 inside a doc string
        """
      When the scenario runs
      Then the evidence matches
`,
    );
    expect(d).toMatchObject({
      id: "OQ-CONF-023",
      problems: [],
      requirements: ["REQ-1", "REQ-2"],
      scope: "read",
      tags: ["nightly"],
    });
  });

  test("a bad ID, a missing scope, an outline and steps out of order are errors", () => {
    const [bad, outline] = Discovery.parse(
      FILE,
      `Feature: f
  Scenario: OQ-conf-009 bad-id test
    Given a
    Then c
    When b

  @scope-read @risk-high @risk-low
  Scenario Outline: OQ-CONF-010 one per example
    Given a <x>
    When b
    Then c
    Examples:
      | x |
      | 1 |
`,
    );
    expect(bad?.problems).toEqual([
      "the steps must be one or more Given steps, then one or more When steps, then a Then step",
      "the ID OQ-conf-009 does not match ^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$",
      "scope is missing: an OQ test declares read or read-write",
    ]);
    expect(outline?.problems).toEqual([
      "more than one @risk- tag: high, low",
      "a Scenario Outline runs once per example, and one ID must map to one record; write a Scenario for each ID",
    ]);
  });
});
