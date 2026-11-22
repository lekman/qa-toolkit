Feature: control-pair

  @scope-read
  Scenario: OQ-CONF-022 an unsigned call is refused
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file

  @scope-read @controls-OQ-CONF-022
  Scenario: OQ-CONF-023 a signed call is accepted
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
