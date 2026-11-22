Feature: thrown-error

  @scope-read
  Scenario: OQ-CONF-004 thrown-error test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
