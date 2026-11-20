package com.lekman.qualify.internal.theme;

/** The four font slots of a theme. */
public enum FontSlot {
  /** Body text. */
  BODY("body"),
  /** Labels and table headers. */
  BODY_BOLD("bodyBold"),
  /** Titles and headings. */
  HEADING("heading"),
  /** IDs, digests and check values. */
  MONO("mono");

  private final String json;

  FontSlot(String json) {
    this.json = json;
  }

  /** The key in {@code theme.json}. */
  public String json() {
    return json;
  }
}
