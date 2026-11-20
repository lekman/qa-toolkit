package com.lekman.qualify.internal.report;

import java.util.List;

/** A piece of report content after the cover, laid out in order. */
public sealed interface Block
    permits Block.Heading,
        Block.Paragraph,
        Block.Bullets,
        Block.Fields,
        Block.Table,
        Block.Signatures {

  /**
   * A heading.
   *
   * @param level 1, 2 or 3
   * @param text the heading text
   */
  record Heading(int level, String text) implements Block {}

  /**
   * A paragraph of body text.
   *
   * @param text the text
   */
  record Paragraph(String text) implements Block {}

  /**
   * A bulleted list.
   *
   * @param items the items
   */
  record Bullets(List<String> items) implements Block {}

  /**
   * Labels and values, without fill.
   *
   * @param fields the fields
   */
  record Fields(List<Field> fields) implements Block {}

  /**
   * A table with a header row.
   *
   * @param columns the columns
   * @param rows the cells of each row
   */
  record Table(List<Column> columns, List<List<String>> rows) implements Block {}

  /**
   * The signature block.
   *
   * @param roles one row per role
   */
  record Signatures(List<String> roles) implements Block {}

  /**
   * One label and value of a field list.
   *
   * @param label the label
   * @param value the value
   * @param mono whether the value is drawn in the mono font
   */
  record Field(String label, String value, boolean mono) {
    /** A field with its value in the body font. */
    public Field(String label, String value) {
      this(label, value, false);
    }
  }

  /**
   * One column of a table.
   *
   * @param header the header text
   * @param width the share of the text width; a table's columns add up to 1
   * @param mono whether the cells are drawn in the mono font
   */
  record Column(String header, double width, boolean mono) {
    /** A column in the body font. */
    public Column(String header, double width) {
      this(header, width, false);
    }
  }
}
