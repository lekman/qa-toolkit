Feature: report-images

  @scope-read
  Scenario: OQ-CONF-024 report-images test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
