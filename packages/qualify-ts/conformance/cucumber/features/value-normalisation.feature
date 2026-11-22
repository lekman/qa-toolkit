Feature: value-normalisation

  @scope-read
  Scenario: OQ-CONF-017 value-normalisation test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
