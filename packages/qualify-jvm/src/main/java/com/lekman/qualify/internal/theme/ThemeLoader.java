package com.lekman.qualify.internal.theme;

import com.lekman.qualify.internal.json.Json;
import com.lekman.qualify.internal.json.JsonFormatException;
import com.lekman.qualify.internal.schema.Schemas;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/**
 * Loads a report theme by bundled name or by path, section 9.3 of the specification: the schema,
 * the tokens in its texts, and every file it names. Any problem throws {@link ThemeError}.
 */
public final class ThemeLoader {

  /** The bundled theme names. */
  public static final List<String> BUNDLED = List.of("lekman", "plain");

  /** The default theme. */
  public static final String DEFAULT = "lekman";

  /** Where the bundled themes sit on the classpath. */
  public static final String RESOURCE_ROOT = "/com/lekman/qualify/themes/";

  private ThemeLoader() {}

  /** Reads the files of one theme. */
  public interface ThemeFiles {
    /** The bytes of the theme file. */
    byte[] theme() throws IOException;

    /** The bytes of a file the theme names, by its path relative to the theme file's folder. */
    byte[] read(String relative) throws IOException;
  }

  /** Load a theme by bundled name, or by a path relative to the working directory. */
  public static Theme load(String reference, Path cwd) {
    if (BUNDLED.contains(reference)) {
      String base = RESOURCE_ROOT + reference + "/";
      return load(
          base + "theme.json",
          new ThemeFiles() {
            @Override
            public byte[] theme() throws IOException {
              return resource(base + "theme.json");
            }

            @Override
            public byte[] read(String relative) throws IOException {
              return resource(
                  Path.of(base).resolve(relative).normalize().toString().replace('\\', '/'));
            }
          });
    }
    Path file = cwd.resolve(reference).toAbsolutePath().normalize();
    Path dir = Objects.requireNonNull(file.getParent(), "a theme file has a folder");
    return load(
        file.toString(),
        new ThemeFiles() {
          @Override
          public byte[] theme() throws IOException {
            return Files.readAllBytes(file);
          }

          @Override
          public byte[] read(String relative) throws IOException {
            return Files.readAllBytes(dir.resolve(relative).normalize());
          }
        });
  }

  /** Load a theme whose files a reader supplies; {@code where} names it in errors. */
  public static Theme load(String where, ThemeFiles files) {
    byte[] themeBytes;
    try {
      themeBytes = files.theme();
    } catch (IOException e) {
      throw new ThemeError(where + ": the theme file cannot be read (" + e.getMessage() + ")");
    }
    JsonNode node;
    try {
      node = Json.parseNode(new String(themeBytes, StandardCharsets.UTF_8));
    } catch (JsonFormatException e) {
      throw new ThemeError(where + ": not valid JSON (" + e.getMessage() + ")");
    }
    List<String> problems = Schemas.theme(node);
    if (!problems.isEmpty()) {
      throw new ThemeError(where + ": " + String.join("; ", problems));
    }
    Map<String, String> texts = strings(node.get("texts"));
    Template.validate(texts, where);

    Map<String, byte[]> loaded = new HashMap<>();
    Map<FontSlot, byte[]> fonts = new EnumMap<>(FontSlot.class);
    for (FontSlot slot : FontSlot.values()) {
      String file = node.get("fonts").get(slot.json()).stringValue();
      byte[] bytes = loaded.get(file);
      if (bytes == null) {
        bytes = read(files, file, where, "fonts." + slot.json());
        String problem = fontProblem(bytes);
        if (problem != null) {
          throw new ThemeError(where + ": fonts." + slot.json() + " " + file + " " + problem);
        }
        loaded.put(file, bytes);
      }
      fonts.put(slot, bytes);
    }

    JsonNode brand = node.get("brand");
    byte[] logo = null;
    if (!brand.get("logo").isNull()) {
      String file = brand.get("logo").stringValue();
      logo = read(files, file, where, "brand.logo");
      if (!startsWith(logo, 0x89, 0x50, 0x4E, 0x47) && !startsWith(logo, 0xFF, 0xD8, 0xFF)) {
        throw new ThemeError(where + ": brand.logo " + file + " is not a PNG or JPEG image");
      }
    }
    JsonNode page = node.get("page");
    return new Theme(
        node.get("name").stringValue(),
        page.get("size").stringValue(),
        page.get("marginMm").doubleValue(),
        brand.get("name").isNull() ? null : brand.get("name").stringValue(),
        brand.get("logoHeightMm").doubleValue(),
        logo == null ? null : ByteBuffer.wrap(logo).asReadOnlyBuffer(),
        fonts,
        strings(node.get("colours")),
        texts,
        list(node.get("cover").get("fields")),
        list(node.get("signatures")));
  }

  /** Why a file is not a static TrueType or OpenType font, or {@code null} when it is one. */
  static @Nullable String fontProblem(byte[] bytes) {
    String tag = bytes.length < 4 ? "" : new String(bytes, 0, 4, StandardCharsets.ISO_8859_1);
    if (!startsWith(bytes, 0, 1, 0, 0) && !tag.equals("true") && !tag.equals("OTTO")) {
      return "is not a TrueType or OpenType font";
    }
    if (bytes.length < 12) {
      return "is not a TrueType or OpenType font";
    }
    int tables = ((bytes[4] & 0xFF) << 8) | (bytes[5] & 0xFF);
    for (int i = 0; i < tables; i++) {
      int at = 12 + 16 * i;
      if (at + 4 <= bytes.length
          && new String(bytes, at, 4, StandardCharsets.ISO_8859_1).equals("fvar")) {
        return "is a variable font, which is not supported";
      }
    }
    return null;
  }

  private static List<String> list(JsonNode node) {
    List<String> list = new ArrayList<>();
    node.forEach(item -> list.add(item.stringValue()));
    return List.copyOf(list);
  }

  private static byte[] read(ThemeFiles files, String relative, String where, String what) {
    try {
      return files.read(relative);
    } catch (IOException e) {
      throw new ThemeError(
          where + ": " + what + " " + relative + " cannot be read (" + e.getMessage() + ")");
    }
  }

  private static byte[] resource(String path) throws IOException {
    try (InputStream in = ThemeLoader.class.getResourceAsStream(path)) {
      if (in == null) {
        throw new IOException("not in the jar");
      }
      return in.readAllBytes();
    }
  }

  private static boolean startsWith(byte[] bytes, int... prefix) {
    if (bytes.length < prefix.length) {
      return false;
    }
    for (int i = 0; i < prefix.length; i++) {
      if ((bytes[i] & 0xFF) != prefix[i]) {
        return false;
      }
    }
    return true;
  }

  private static Map<String, String> strings(JsonNode node) {
    Map<String, String> map = new LinkedHashMap<>();
    for (Map.Entry<String, JsonNode> entry : node.properties()) {
      map.put(entry.getKey(), entry.getValue().stringValue());
    }
    return map;
  }
}
