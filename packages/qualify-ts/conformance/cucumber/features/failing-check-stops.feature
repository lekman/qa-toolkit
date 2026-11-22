Feature: failing-check-stops

  @scope-read
  Scenario: OQ-CONF-002 failing-check-stops test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
