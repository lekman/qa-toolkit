Feature: runtime-skip

  @scope-read
  Scenario: OQ-CONF-006 runtime-skip test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
