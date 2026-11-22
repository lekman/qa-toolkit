Feature: soft-check

  @scope-read
  Scenario: OQ-CONF-003 soft-check test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
