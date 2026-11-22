Feature: all-pass

  Scenario: IQ-CONF-001 all-pass test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
