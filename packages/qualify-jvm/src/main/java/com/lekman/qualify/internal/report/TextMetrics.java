package com.lekman.qualify.internal.report;

import com.lekman.qualify.internal.theme.FontSlot;

/** Measures text in the theme's fonts. Implemented over the embedded fonts. */
public interface TextMetrics {

  /** Whether a font slot can draw a code point. */
  boolean canDraw(int codePoint, FontSlot font);

  /** Width in points of text at a size in a font slot. */
  double width(String text, double size, FontSlot font);
}
