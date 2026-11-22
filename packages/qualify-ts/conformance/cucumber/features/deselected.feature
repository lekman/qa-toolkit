Feature: deselected

  # The harness selects only OQ-CONF-020 with cucumber's own name filter.
  @scope-read
  Scenario: OQ-CONF-020 deselected test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file

  @scope-read
  Scenario: OQ-CONF-021 deselected test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
