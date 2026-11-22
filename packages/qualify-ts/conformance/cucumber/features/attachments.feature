Feature: attachments

  # The harness runs OQ-CONF-015 and OQ-CONF-016 in two invocations, because
  # OQ-CONF-016 needs QUALIFY_ATTACHMENT_LIMIT=16 and OQ-CONF-015 would exceed it.
  @scope-read
  Scenario: OQ-CONF-015 attachments test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file

  @scope-read
  Scenario: OQ-CONF-016 attachments test
    Given a conformance fixture
    When the scenario runs
    Then the evidence matches the expected file
