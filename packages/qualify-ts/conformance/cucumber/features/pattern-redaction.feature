Feature: pattern-redaction

  @scope-read
  Scenario: OQ-CONF-012 pattern-redaction test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
