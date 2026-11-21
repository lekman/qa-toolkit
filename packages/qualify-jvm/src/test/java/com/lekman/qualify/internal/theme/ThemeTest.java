package com.lekman.qualify.internal.theme;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ThemeTest {

  private static final Path SPEC_THEMES =
      Path.of(System.getProperty("qualify.repoRoot"), "spec/qualify/report/themes");

  @TempDir Path temp;

  @Test
  void theBundledThemesAreTheSpecificationsByteForByte() throws IOException {
    List<Path> files;
    try (Stream<Path> walk = Files.walk(SPEC_THEMES)) {
      files = walk.filter(Files::isRegularFile).toList();
    }
    assertTrue(files.size() >= 10, "found " + files.size());
    for (Path file : files) {
      String resource =
          ThemeLoader.RESOURCE_ROOT + SPEC_THEMES.relativize(file).toString().replace('\\', '/');
      try (InputStream in = ThemeLoader.class.getResourceAsStream(resource)) {
        assertNotNull(in, resource);
        assertArrayEquals(
            Files.readAllBytes(file), in.readAllBytes(), resource + " differs from the spec");
      }
    }
  }

  @Test
  void bundledThemesLoadByName() {
    Theme lekman = ThemeLoader.load("lekman", temp);
    assertEquals("lekman.com", lekman.brandName());
    assertNotNull(lekman.logoBytes());
    assertSame(lekman.fonts().get(FontSlot.BODY_BOLD), lekman.fonts().get(FontSlot.HEADING));
    Theme plain = ThemeLoader.load("plain", temp);
    assertNull(plain.logoBytes());
    assertEquals("A4", plain.pageSize());
    assertEquals("", plain.text("unknown"));
  }

  @Test
  void aThemeFileLoadsByPathAndIsChecked() throws IOException {
    Path dir = temp.resolve("mine");
    Files.createDirectories(dir.resolve("fonts"));
    Path plain = SPEC_THEMES.resolve("plain");
    Files.copy(
        plain.resolve("fonts/NotoSans-Regular.ttf"), dir.resolve("fonts/NotoSans-Regular.ttf"));
    Files.copy(plain.resolve("fonts/NotoSans-Bold.ttf"), dir.resolve("fonts/NotoSans-Bold.ttf"));
    String json = Files.readString(plain.resolve("theme.json"));
    Files.writeString(
        dir.resolve("theme.json"), json.replace("\"size\": \"A4\"", "\"size\": \"Letter\""));
    assertEquals("Letter", ThemeLoader.load("mine/theme.json", temp).pageSize());

    Files.writeString(
        dir.resolve("theme.json"), json.replace("{documentId}   Page", "{nope} Page"));
    ThemeError token =
        assertThrows(ThemeError.class, () -> ThemeLoader.load("mine/theme.json", temp));
    assertTrue(token.getMessage().contains("{nope}"));
    Files.writeString(dir.resolve("theme.json"), "{");
    assertThrows(ThemeError.class, () -> ThemeLoader.load("mine/theme.json", temp));
    Files.writeString(dir.resolve("theme.json"), "{}");
    assertTrue(
        assertThrows(ThemeError.class, () -> ThemeLoader.load("mine/theme.json", temp))
            .getMessage()
            .contains("required"));
    Files.writeString(
        dir.resolve("theme.json"), json.replace("\"logo\": null", "\"logo\": \"logo.png\""));
    assertTrue(
        assertThrows(ThemeError.class, () -> ThemeLoader.load("mine/theme.json", temp))
            .getMessage()
            .contains("cannot be read"));
    Files.writeString(dir.resolve("logo.png"), "not an image");
    assertTrue(
        assertThrows(ThemeError.class, () -> ThemeLoader.load("mine/theme.json", temp))
            .getMessage()
            .contains("not a PNG or JPEG"));
    Files.writeString(dir.resolve("fonts/NotoSans-Bold.ttf"), "not a font");
    Files.writeString(dir.resolve("theme.json"), json);
    assertTrue(
        assertThrows(ThemeError.class, () -> ThemeLoader.load("mine/theme.json", temp))
            .getMessage()
            .contains("not a TrueType"));
    assertThrows(ThemeError.class, () -> ThemeLoader.load("absent.json", temp));
  }

  @Test
  void variableFontsAreRefused() {
    byte[] font = new byte[28];
    font[1] = 1;
    font[5] = 1;
    System.arraycopy("fvar".getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, font, 12, 4);
    assertEquals("is a variable font, which is not supported", ThemeLoader.fontProblem(font));
    assertEquals("is not a TrueType or OpenType font", ThemeLoader.fontProblem(new byte[2]));
    assertEquals(
        "is not a TrueType or OpenType font",
        ThemeLoader.fontProblem("OTTO".getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
  }

  @Test
  void templatesSubstituteTokensAndEscapeBraces() {
    assertEquals(
        "{a} 3 of 9 }",
        Template.render("{{a}} {page} of {pages} }}", Map.of("page", "3", "pages", "9")));
    assertEquals("", Template.render("{unknown}", Map.of()));
    assertTrue(
        assertThrows(ThemeError.class, () -> Template.parse("{open", "t"))
            .getMessage()
            .contains("not closed"));
    assertTrue(
        assertThrows(ThemeError.class, () -> Template.parse("close}", "t"))
            .getMessage()
            .contains("has no"));
    assertThrows(ThemeError.class, () -> Template.validate(Map.of("title", "{title}"), "t"));
    assertThrows(ThemeError.class, () -> Template.validate(Map.of("subtitle", "{page}"), "t"));
    Template.validate(Map.of("footer", "{title} {page}", "classification", "{date}"), "t");
    TokenValues tokens = new TokenValues("T", "C", "D", "E", "L", "2026", "V", "Failed", "R", "S");
    assertEquals("T", tokens.asMap().get("title"));
    assertEquals("X", tokens.with("X", "Y").title());
  }
}
