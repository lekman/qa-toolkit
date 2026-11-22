Feature: duplicate-id-b

  # duplicate-id-a and duplicate-id-b both declare OQ-CONF-018.
  @scope-read
  Scenario: OQ-CONF-018 duplicate-id test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
