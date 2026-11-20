package com.lekman.qualify.internal.report;

import com.lekman.qualify.internal.theme.FontSlot;

/** A drawing instruction on one page, in points from the bottom left. */
public sealed interface DrawOp permits DrawOp.Text, DrawOp.Line, DrawOp.Fill, DrawOp.Image {

  /**
   * Text on one baseline.
   *
   * @param text the text, already drawable in the font
   * @param x left edge
   * @param y baseline
   * @param size font size
   * @param font font slot
   * @param colour colour name
   */
  record Text(String text, double x, double y, double size, FontSlot font, String colour)
      implements DrawOp {}

  /**
   * A straight line.
   *
   * @param x1 start x
   * @param y1 start y
   * @param x2 end x
   * @param y2 end y
   * @param thickness line width
   * @param colour colour name
   */
  record Line(double x1, double y1, double x2, double y2, double thickness, String colour)
      implements DrawOp {}

  /**
   * A filled rectangle.
   *
   * @param x left edge
   * @param y bottom edge
   * @param width width
   * @param height height
   * @param colour colour name
   */
  record Fill(double x, double y, double width, double height, String colour) implements DrawOp {}

  /**
   * The theme's logo.
   *
   * @param x left edge
   * @param y bottom edge
   * @param width width
   * @param height height
   */
  record Image(double x, double y, double width, double height) implements DrawOp {}
}
