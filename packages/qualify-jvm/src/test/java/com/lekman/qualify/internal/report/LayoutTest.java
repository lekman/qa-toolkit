package com.lekman.qualify.internal.report;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lekman.qualify.internal.theme.FontSlot;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

class LayoutTest {

  /** Every character is half the font size wide; nothing above U+2FFF can be drawn. */
  private static final TextMetrics METRICS =
      new TextMetrics() {
        @Override
        public boolean canDraw(int codePoint, FontSlot font) {
          return codePoint < 0x3000;
        }

        @Override
        public double width(String text, double size, FontSlot font) {
          return text.codePointCount(0, text.length()) * size * 0.5;
        }
      };

  private static final Geometry A4 = Geometry.of("A4", 20);

  private static List<String> texts(List<DrawOp> ops) {
    List<String> texts = new ArrayList<>();
    for (DrawOp op : ops) {
      if (op instanceof DrawOp.Text text) {
        texts.add(text.text());
      }
    }
    return texts;
  }

  @Test
  void wrapBreaksAtSpacesAndInsideLongWords() {
    assertEquals(List.of("aa bb", "cc"), Layout.wrap("aa bb cc", 25, 10, FontSlot.BODY, METRICS));
    assertEquals(List.of("abcde", "fgh"), Layout.wrap("abcdefgh", 25, 10, FontSlot.BODY, METRICS));
    assertEquals(List.of("a", "", "b"), Layout.wrap("a\n\nb", 25, 10, FontSlot.BODY, METRICS));
    assertEquals("abc…", Layout.fit("abcdefgh", 20, 10, FontSlot.BODY, METRICS));
    assertEquals("", Layout.fit("abcdefgh", 2, 10, FontSlot.BODY, METRICS));
    assertEquals("ab", Layout.fit("ab", 20, 10, FontSlot.BODY, METRICS));
  }

  @Test
  void chromeCutsLongTextsAndPutsTheClassificationRight() {
    List<DrawOp> ops = Layout.chrome("h".repeat(300), "Internal", "f".repeat(300), METRICS, A4);
    List<String> texts = texts(ops);
    assertTrue(texts.get(0).endsWith("…"));
    assertEquals("Internal", texts.get(1));
    assertTrue(texts.get(2).endsWith("…"));
    assertEquals(List.of("footer"), texts(Layout.chrome("", "", "footer", METRICS, A4)));
  }

  @Test
  void theCoverPlacesBrandTitleAndRows() {
    ReportDocument.Cover cover =
        new ReportDocument.Cover(
            "brand",
            "A very long title ".repeat(12),
            "sub",
            List.of(new Block.Field("Label", "v".repeat(400))));
    List<DrawOp> ops = Layout.cover(cover, new Layout.LogoSize(30, 20), METRICS, A4);
    assertTrue(ops.get(0) instanceof DrawOp.Image);
    List<String> texts = texts(ops);
    assertEquals("brand", texts.get(0));
    assertTrue(texts.stream().anyMatch(t -> t.endsWith("…")));
    assertTrue(texts.contains("sub"));
    List<DrawOp> plain =
        Layout.cover(
            new ReportDocument.Cover(null, "T", "", List.of(new Block.Field("L", "V"))),
            null,
            METRICS,
            A4);
    assertEquals(List.of("L", "V", "T"), texts(plain));
  }

  @Test
  void contentBreaksPagesAndRepeatsTableHeaders() {
    List<List<String>> rows = new ArrayList<>();
    for (int i = 0; i < 120; i++) {
      rows.add(List.of("row " + i, "x"));
    }
    List<Block> blocks =
        List.of(
            new Block.Heading(1, "Title"),
            new Block.Heading(2, "Fields"),
            new Block.Fields(
                List.of(
                    new Block.Field("Label", "value", true),
                    new Block.Field("Long", "w ".repeat(400)))),
            new Block.Heading(3, "List"),
            new Block.Bullets(List.of("one", "一 two")),
            new Block.Paragraph("None"),
            new Block.Table(
                List.of(new Block.Column("Name", 0.5), new Block.Column("Value", 0.5, true)), rows),
            new Block.Table(
                List.of(new Block.Column("Tall", 1.0)),
                List.of(List.of(String.join(" ", Collections.nCopies(3000, "word"))))),
            new Block.Signatures(List.of("Prepared by", "Reviewed by", "Approved by")));
    List<List<DrawOp>> pages = Layout.paginate(blocks, METRICS, A4);
    assertTrue(pages.size() > 4, "pages: " + pages.size());
    long headers = pages.stream().flatMap(p -> texts(p).stream()).filter("Name"::equals).count();
    assertTrue(headers >= 3, "headers: " + headers);
    assertTrue(texts(pages.get(0)).contains("? two"));
    assertTrue(
        pages.stream()
            .flatMap(p -> p.stream())
            .anyMatch(op -> op instanceof DrawOp.Fill f && f.colour().equals("tableStripe")));
    assertEquals(
        "Approved by",
        texts(pages.get(pages.size() - 1)).get(texts(pages.get(pages.size() - 1)).size() - 4));
  }

  @Test
  void reportTextFormatsValues() {
    assertEquals("-", ReportText.list(List.of()));
    assertEquals("a, b", ReportText.list(List.of("a", "b")));
    assertEquals("-", ReportText.orMissing(""));
    assertEquals(
        "2026-01-02 03:04:05 UTC", ReportText.time(Instant.parse("2026-01-02T03:04:05.999Z")));
    assertEquals("Passed", ReportText.verdict("pass"));
    assertEquals("Incomplete", ReportText.verdict("incomplete"));
    assertEquals("a b?\nc?", ReportText.drawable("a\tb\u0001\r\nc\u4e00", c -> c < 0x3000));
    String cut = ReportText.json("x".repeat(250));
    assertTrue(cut.endsWith("… (52 more characters)"), cut);
    assertEquals(Geometry.of("Letter", 10).width(), 612);
  }
}
