Feature: several-requirements

  @scope-read @REQ-1 @REQ-2
  Scenario: OQ-CONF-013 several-requirements test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
