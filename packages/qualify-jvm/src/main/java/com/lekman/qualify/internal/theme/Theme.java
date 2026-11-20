package com.lekman.qualify.internal.theme;

import java.nio.ByteBuffer;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * A theme with its files read, ready to draw with. Slots naming the same font file share one array,
 * so the renderer embeds that font once.
 *
 * @param name the theme name
 * @param pageSize {@code A4} or {@code Letter}
 * @param marginMm the page margin in millimetres
 * @param brandName the text beside the logo, or {@code null}
 * @param logoHeightMm the logo height in millimetres
 * @param logo the logo file, read only, or {@code null}
 * @param fonts the font bytes per slot
 * @param colours colour name to {@code #rrggbb}
 * @param texts text name to template
 * @param coverFields the cover's metadata rows, in order
 * @param signatures signature roles, in order
 */
public record Theme(
    String name,
    String pageSize,
    double marginMm,
    @Nullable String brandName,
    double logoHeightMm,
    @Nullable ByteBuffer logo,
    Map<FontSlot, byte[]> fonts,
    Map<String, String> colours,
    Map<String, String> texts,
    List<String> coverFields,
    List<String> signatures) {

  /** A theme; the maps and lists are kept as given. */
  public Theme {
    fonts = new EnumMap<>(fonts);
  }

  /** A copy of the logo's bytes, or {@code null} when the theme has no logo. */
  public byte @Nullable [] logoBytes() {
    if (logo == null) {
      return null;
    }
    ByteBuffer copy = logo.duplicate();
    byte[] bytes = new byte[copy.remaining()];
    copy.get(bytes);
    return bytes;
  }

  /** One text template by name. */
  public String text(String name) {
    return texts.getOrDefault(name, "");
  }
}
