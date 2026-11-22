@support
Feature: Support
  Where a team asks for help and follows each request to its end.

  # Intended use: the team sees every open request in one list.
  @REQ-SUPPORT-001 @risk-high
  Scenario: IU-SUPPORT-001 Support lists every open request
    Given I open the app
    When I go to "Support"
    Then the list shows "PROJ-123"

  Scenario: A scenario without an ID is not a qualification test
    Given I open the app
    When I go to "Help"
    Then I see the "Help" heading
