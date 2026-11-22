Feature: missing-scope

  # No @scope- tag on purpose: an OQ test must declare its scope.
  Scenario: OQ-CONF-008 missing-scope test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
