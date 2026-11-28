package com.lekman.qualify.internal.report;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lekman.qualify.internal.json.Json;
import com.lekman.qualify.internal.theme.FontSlot;
import com.lekman.qualify.internal.theme.Theme;
import com.lekman.qualify.internal.theme.ThemeLoader;
import com.lekman.qualify.internal.trace.Trace;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.apache.fontbox.ttf.TTFParser;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class FontTablesTest {
  private static final Path REPO = Path.of(System.getProperty("qualify.repoRoot"));

  private static byte[] body(String theme) throws IOException {
    return Objects.requireNonNull(ThemeLoader.load(theme, REPO).fonts().get(FontSlot.BODY));
  }

  @Test
  void theGsubTableIsHiddenAndTheGlyphsStay() throws IOException {
    byte[] font = body("lekman");
    try (TrueTypeFont before = new TTFParser().parse(new RandomAccessReadBuffer(font));
        TrueTypeFont after =
            new TTFParser()
                .parse(new RandomAccessReadBuffer(FontTables.withoutGlyphSubstitution(font)))) {
      assertNotNull(before.getGsub());
      assertNull(after.getGsub());
      assertEquals(before.getNumberOfGlyphs(), after.getNumberOfGlyphs());
    }
    assertNotSame(font, FontTables.withoutGlyphSubstitution(font));
  }

  @Test
  void bytesThatAreNotAFontWithGsubComeBackUnchanged() {
    byte[] tiny = {1, 2, 3};
    assertSame(tiny, FontTables.withoutGlyphSubstitution(tiny));
    byte[] noTables = new byte[12];
    assertSame(noTables, FontTables.withoutGlyphSubstitution(noTables));
    byte[] cut = {0, 1, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0};
    assertSame(cut, FontTables.withoutGlyphSubstitution(cut));
    byte[] other = new byte[28];
    other[5] = 1;
    System.arraycopy("GPOS".getBytes(StandardCharsets.US_ASCII), 0, other, 12, 4);
    assertArrayEquals(other.clone(), FontTables.withoutGlyphSubstitution(other));
  }

  @Test
  @SuppressWarnings("unchecked")
  void aDigestWithFfReadsBackFromTheFooterAndTheRunDetails() throws Exception {
    String json =
        Files.readString(
                REPO.resolve("spec/qualify/conformance/expected/all-pass.json"),
                StandardCharsets.UTF_8)
            .replace("<timestamp>", "2026-01-02T03:04:05.006Z");
    Map<String, Object> runFile = (Map<String, Object>) Json.parse(json);
    String digest = "cb4ff1b28a4d" + "f".repeat(52);
    for (String name : List.of("lekman", "plain")) {
      Theme theme = ThemeLoader.load(name, REPO);
      ReportDocument document =
          ReportContent.build(
              runFile,
              digest,
              Trace.build(runFile, List.of(), Map.of()),
              theme,
              "qualify 9.9.9",
              new ReportContent.Options(
                  Instant.parse("2026-01-02T03:04:05.006Z"), null, null, null, null, null));
      try (PDDocument pdf = Loader.loadPDF(PdfRenderer.render(document, theme))) {
        String text = new PDFTextStripper().getText(pdf);
        assertTrue(text.contains("sha256 cb4ff1b28a4d"), name + ": " + text);
        assertTrue(text.contains(digest), name + ": " + text);
      }
    }
  }
}
