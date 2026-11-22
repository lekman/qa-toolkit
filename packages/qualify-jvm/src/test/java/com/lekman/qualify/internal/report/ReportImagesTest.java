package com.lekman.qualify.internal.report;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class ReportImagesTest {

  private static final Path REPO = Path.of(System.getProperty("qualify.repoRoot"));
  private static final Path IMAGES = REPO.resolve("spec/qualify/conformance/fixtures/images");

  private static final TextMetrics METRICS =
      new TextMetrics() {
        @Override
        public boolean canDraw(int codePoint, FontSlot font) {
          return true;
        }

        @Override
        public double width(String text, double size, FontSlot font) {
          return text.codePointCount(0, text.length()) * size * 0.5;
        }
      };

  /** A4 with 20 mm margins: the text box is 481.9 by 728.5 points. */
  private static final Geometry A4 = Geometry.of("A4", 20);

  private static byte[] fixture(String name) throws IOException {
    return Files.readAllBytes(IMAGES.resolve(name));
  }

  private static Block image(int index) {
    return new Block.Image(index, "image " + index, "image " + index + " could not be read");
  }

  private static <T extends DrawOp> List<T> ofKind(List<DrawOp> ops, Class<T> kind) {
    List<T> found = new ArrayList<>();
    for (DrawOp op : ops) {
      if (kind.isInstance(op)) {
        found.add(kind.cast(op));
      }
    }
    return found;
  }

  @Test
  void drawsOnlyPngAndJpeg() {
    assertEquals(ReportImages.Format.PNG, ReportImages.format("image/png"));
    assertEquals(ReportImages.Format.JPEG, ReportImages.format("image/jpeg"));
    for (String other : List.of("image/jpg", "IMAGE/PNG", "image/gif", "text/plain")) {
      assertNull(ReportImages.format(other), other);
    }
  }

  @Test
  void checksTheSignature() throws IOException {
    assertTrue(ReportImages.signed(fixture("screen.png"), ReportImages.Format.PNG));
    assertTrue(ReportImages.signed(fixture("tall.jpg"), ReportImages.Format.JPEG));
    assertFalse(ReportImages.signed(fixture("tall.jpg"), ReportImages.Format.PNG));
    assertFalse(ReportImages.signed(fixture("screen.png"), ReportImages.Format.JPEG));
    assertFalse(
        ReportImages.signed(new byte[] {(byte) 0xff, (byte) 0xd8}, ReportImages.Format.JPEG));
  }

  @Test
  void scalesDownKeepsTheAspectRatioAndNeverScalesUp() {
    ReportImages.Size box = new ReportImages.Size(481.9, 364.25);
    ReportImages.Size wide = ReportImages.fit(new ReportImages.Size(1280, 720), box);
    assertEquals(481.9, wide.width(), 0.05);
    assertEquals(271.1, wide.height(), 0.05);
    ReportImages.Size tall = ReportImages.fit(new ReportImages.Size(200, 600), box);
    assertEquals(121.4, tall.width(), 0.05);
    assertEquals(364.25, tall.height(), 0.05);
    assertEquals(
        new ReportImages.Size(48, 48), ReportImages.fit(new ReportImages.Size(48, 48), box));
  }

  @Test
  void captionAndUnreadableLine() {
    Map<String, Object> attachment =
        Map.of(
            "filename", "broken.png",
            "contentType", "image/png",
            "sizeBytes", 12,
            "sha256", "5464533c9647b67eb320c40ccc5959537c09102ae75388f6a7675b433e745c9d");
    assertEquals("broken.png, 12 bytes, SHA-256 5464533c9647", ReportImages.caption(attachment));
    assertEquals(
        "broken.png could not be read as image/png, so it is not drawn.",
        ReportImages.unreadable(attachment));
    ReportImages.Source source =
        new ReportImages.Source(new byte[] {1, 2}, ReportImages.Format.PNG);
    byte[] copy = source.bytes();
    copy[0] = 9;
    assertEquals(1, source.bytes()[0]);
  }

  @Test
  void anImageIsFittedFramedAndCaptioned() {
    List<DrawOp> page =
        Layout.paginate(List.of(image(0)), METRICS, A4, List.of(new ReportImages.Size(1280, 720)))
            .get(0);
    DrawOp.Image drawn = ofKind(page, DrawOp.Image.class).get(0);
    assertEquals(0, drawn.image());
    assertEquals(A4.margin(), drawn.x(), 0.01);
    assertEquals(481.9, drawn.width(), 0.05);
    assertEquals(271.1, drawn.height(), 0.05);
    List<DrawOp.Line> frame = ofKind(page, DrawOp.Line.class);
    assertEquals(4, frame.size());
    assertTrue(frame.stream().allMatch(l -> "rule".equals(l.colour()) && l.thickness() == 0.5));
    DrawOp.Text caption = ofKind(page, DrawOp.Text.class).get(0);
    assertEquals("image 0", caption.text());
    assertEquals("muted", caption.colour());
    assertEquals(Layout.CAPTION, caption.size());
    assertTrue(caption.y() < drawn.y());
  }

  @Test
  void anUnreadableImageBecomesItsLine() {
    List<ReportImages.Size> none = Arrays.asList((ReportImages.Size) null);
    List<DrawOp> page = Layout.paginate(List.of(image(0)), METRICS, A4, none).get(0);
    assertTrue(ofKind(page, DrawOp.Image.class).isEmpty());
    DrawOp.Text line = ofKind(page, DrawOp.Text.class).get(0);
    assertEquals("image 0 could not be read", line.text());
    assertEquals("text", line.colour());
    assertEquals(Layout.BODY, line.size());
    assertEquals(
        "image 3 could not be read",
        ofKind(Layout.paginate(List.of(image(3)), METRICS, A4).get(0), DrawOp.Text.class)
            .get(0)
            .text());
  }

  @Test
  void anImageAndItsCaptionMoveToTheNextPageTogether() {
    ReportImages.Size size = new ReportImages.Size(200, 300);
    List<List<DrawOp>> pages =
        Layout.paginate(
            List.of(image(0), image(1), image(2)), METRICS, A4, List.of(size, size, size));
    assertEquals(2, pages.size());
    List<DrawOp> second = pages.get(1);
    assertEquals(2, ofKind(second, DrawOp.Image.class).get(0).image());
    assertEquals(
        List.of("image 2"), ofKind(second, DrawOp.Text.class).stream().map(t -> t.text()).toList());
  }

  @Test
  void bytesWithTheSignatureThatDoNotDecodeAreNotDrawn() throws IOException {
    try (PDDocument pdf = new PDDocument()) {
      byte[] truncated = Arrays.copyOf(fixture("screen.png"), 40);
      assertNull(
          PdfRenderer.embedImage(
              pdf, new ReportImages.Source(truncated, ReportImages.Format.PNG), "x"));
      byte[] jpeg = Arrays.copyOf(fixture("tall.jpg"), 3);
      assertNull(
          PdfRenderer.embedImage(
              pdf, new ReportImages.Source(jpeg, ReportImages.Format.JPEG), "x"));
      assertNotNull(
          PdfRenderer.embedImage(
              pdf, new ReportImages.Source(fixture("tall.jpg"), ReportImages.Format.JPEG), "x"));
    }
  }

  @Test
  @SuppressWarnings("unchecked")
  void theReportDrawsThePngAndJpegAttachments() throws Exception {
    String json =
        Files.readString(
                REPO.resolve("spec/qualify/conformance/expected/report-images.json"),
                StandardCharsets.UTF_8)
            .replace("<timestamp>", "2026-01-02T03:04:05.006Z");
    Map<String, Object> runFile = (Map<String, Object>) Json.parse(json);
    Theme plain = ThemeLoader.load("plain", REPO);
    ReportDocument document =
        ReportContent.build(
            runFile,
            "d".repeat(64),
            Trace.build(runFile, List.of(), Map.of()),
            plain,
            "qualify 9.9.9",
            new ReportContent.Options(
                Instant.parse("2026-01-02T03:04:05.006Z"), null, null, null, null, null));
    assertEquals(4, document.images().size());
    byte[] bytes = PdfRenderer.render(document, plain);
    try (PDDocument pdf = Loader.loadPDF(bytes)) {
      String text = new PDFTextStripper().getText(pdf);
      int screen = text.indexOf("screen.png, 2820 bytes, SHA-256 54c63f4d7065");
      int tall = text.indexOf("tall.jpg, 6992 bytes, SHA-256 2340c1bc48aa");
      int broken = text.indexOf("broken.png could not be read as image/png, so it is not drawn.");
      int icon = text.indexOf("icon.png, 296 bytes, SHA-256 86e9701fa7c9");
      assertTrue(0 < screen && screen < tall && tall < broken && broken < icon, text);
      assertFalse(text.contains("note.txt,"));
      List<String> placed = new ArrayList<>();
      for (int n = 1; n < pdf.getNumberOfPages(); n++) {
        PDPage page = pdf.getPage(n);
        PDResources resources = page.getResources();
        for (COSName name : resources.getXObjectNames()) {
          PDXObject xobject = resources.getXObject(name);
          if (xobject instanceof PDImageXObject image) {
            placed.add(image.getWidth() + "x" + image.getHeight());
          }
        }
      }
      assertEquals(List.of("960x540", "200x600", "48x48"), placed);
    }
  }
}
