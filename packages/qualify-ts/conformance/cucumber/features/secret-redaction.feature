Feature: secret-redaction

  @scope-read
  Scenario: OQ-CONF-011 secret-redaction test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
