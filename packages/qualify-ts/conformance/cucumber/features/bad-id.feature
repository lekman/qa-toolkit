Feature: bad-id

  # Lower case: the ID does not match the pattern. The level is the ID's prefix,
  # so a prefix that differs from the level cannot be written here.
  @scope-read
  Scenario: OQ-conf-009 bad-id test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
