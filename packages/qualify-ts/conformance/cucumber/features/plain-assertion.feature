Feature: plain-assertion

  @scope-read
  Scenario: OQ-CONF-005 plain-assertion test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
