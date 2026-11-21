package com.lekman.qualify.internal.report;

/**
 * Page size and margin in points.
 *
 * @param width page width
 * @param height page height
 * @param margin margin on every side
 */
public record Geometry(double width, double height, double margin) {

  /** Points per millimetre. */
  public static final double MM = 72 / 25.4;

  /** The geometry of a theme's page size and margin. */
  public static Geometry of(String size, double marginMm) {
    return size.equals("Letter")
        ? new Geometry(612, 792, marginMm * MM)
        : new Geometry(595.28, 841.89, marginMm * MM);
  }
}
