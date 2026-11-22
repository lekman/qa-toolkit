Feature: crash

  @scope-read
  Scenario: OQ-CONF-019 crash test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
