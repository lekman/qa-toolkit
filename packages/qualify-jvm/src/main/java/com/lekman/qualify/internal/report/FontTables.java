package com.lekman.qualify.internal.report;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

/**
 * Edits to a TrueType or OpenType font's table directory before PDFBox reads it.
 *
 * <p>PDFBox 3 applies the font's GSUB ligatures when it draws text, so Geist draws "ff" as one
 * glyph. The text layer then maps that glyph to a wrong character: a footer digest such as {@code
 * cb4ff1b28a4d} reads back as {@code cb4 1b28a4d}. The report reads the font without its GSUB
 * table, so each character is drawn, and read back, as itself.
 */
final class FontTables {

  /** The tag a hidden GSUB table gets: no reader looks for it. */
  private static final byte[] HIDDEN = "xSUB".getBytes(StandardCharsets.US_ASCII);

  private static final byte[] GSUB = "GSUB".getBytes(StandardCharsets.US_ASCII);

  private FontTables() {}

  /**
   * A copy of the font with its GSUB table renamed in the table directory, so it is not read. The
   * glyphs, metrics and every other table stay as they are. Bytes that are not a font, or a font
   * without GSUB, come back unchanged.
   */
  static byte[] withoutGlyphSubstitution(byte[] font) {
    if (font.length < 12) {
      return font;
    }
    int tables = ByteBuffer.wrap(font).getShort(4) & 0xffff;
    if (font.length < 12 + 16 * tables) {
      return font;
    }
    byte[] copy = font.clone();
    for (int i = 0; i < tables; i++) {
      int record = 12 + 16 * i;
      if (startsWith(copy, record, GSUB)) {
        System.arraycopy(HIDDEN, 0, copy, record, HIDDEN.length);
        return copy;
      }
    }
    return font;
  }

  private static boolean startsWith(byte[] bytes, int at, byte[] tag) {
    for (int i = 0; i < tag.length; i++) {
      if (bytes[at + i] != tag[i]) {
        return false;
      }
    }
    return true;
  }
}
