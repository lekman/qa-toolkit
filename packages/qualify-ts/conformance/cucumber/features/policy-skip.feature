Feature: policy-skip

  @scope-read-write
  Scenario: OQ-CONF-007 policy-skip test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
