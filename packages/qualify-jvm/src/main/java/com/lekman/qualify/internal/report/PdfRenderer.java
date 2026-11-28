package com.lekman.qualify.internal.report;

import com.lekman.qualify.internal.theme.FontSlot;
import com.lekman.qualify.internal.theme.Template;
import com.lekman.qualify.internal.theme.Theme;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.EnumMap;
import java.util.GregorianCalendar;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TimeZone;
import org.apache.fontbox.ttf.TTFParser;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.jspecify.annotations.Nullable;

/**
 * Renders a report document with a theme to PDF bytes with Apache PDFBox, in memory. The fonts are
 * embedded as subsets, so the PDF carries only the glyphs it uses.
 */
public final class PdfRenderer {

  private PdfRenderer() {}

  /**
   * Lay out and draw the document: the cover without header or footer, then the content pages with
   * both. Pages count from the cover.
   */
  public static byte[] render(ReportDocument document, Theme theme) {
    List<TrueTypeFont> opened = new ArrayList<>();
    try (PDDocument pdf = new PDDocument()) {
      IdentityHashMap<byte[], TrueTypeFont> parsed = new IdentityHashMap<>();
      IdentityHashMap<byte[], PDType0Font> embedded = new IdentityHashMap<>();
      Map<FontSlot, TrueTypeFont> ttfs = new EnumMap<>(FontSlot.class);
      Map<FontSlot, PDType0Font> fonts = new EnumMap<>(FontSlot.class);
      for (FontSlot slot : FontSlot.values()) {
        byte[] bytes = Objects.requireNonNull(theme.fonts().get(slot));
        TrueTypeFont ttf = parsed.get(bytes);
        if (ttf == null) {
          ttf =
              new TTFParser()
                  .parse(new RandomAccessReadBuffer(FontTables.withoutGlyphSubstitution(bytes)));
          opened.add(ttf);
          parsed.put(bytes, ttf);
          embedded.put(bytes, PDType0Font.load(pdf, ttf, true));
        }
        ttfs.put(slot, ttf);
        fonts.put(slot, Objects.requireNonNull(embedded.get(bytes)));
      }
      TextMetrics metrics = metrics(ttfs, fonts);

      PDImageXObject logo = null;
      byte[] logoBytes = theme.logoBytes();
      if (logoBytes != null) {
        logo = PDImageXObject.createFromByteArray(pdf, logoBytes, "logo");
      }
      Geometry g = Geometry.of(theme.pageSize(), theme.marginMm());
      double logoHeight = theme.logoHeightMm() * Geometry.MM;
      List<List<DrawOp>> pages = new ArrayList<>();
      pages.add(
          Layout.cover(
              document.cover(),
              logo == null
                  ? null
                  : new Layout.LogoSize(
                      logoHeight * logo.getWidth() / logo.getHeight(), logoHeight),
              metrics,
              g));
      List<@Nullable PDImageXObject> images = new ArrayList<>();
      List<ReportImages.@Nullable Size> sizes = new ArrayList<>();
      for (ReportImages.Source source : document.images()) {
        PDImageXObject image = embedImage(pdf, source, "image" + images.size());
        images.add(image);
        sizes.add(
            image == null ? null : new ReportImages.Size(image.getWidth(), image.getHeight()));
      }
      pages.addAll(Layout.paginate(document.blocks(), metrics, g, sizes));

      String total = String.valueOf(pages.size());
      for (int index = 0; index < pages.size(); index++) {
        List<DrawOp> ops = new ArrayList<>(pages.get(index));
        if (index > 0) {
          Map<String, String> values = document.tokens().asMap();
          values.put("page", String.valueOf(index + 1));
          values.put("pages", total);
          ops.addAll(
              Layout.chrome(
                  Template.render(document.header(), values),
                  document.classification(),
                  Template.render(document.footer(), values),
                  metrics,
                  g));
        }
        PDPage page = new PDPage(new PDRectangle((float) g.width(), (float) g.height()));
        pdf.addPage(page);
        try (PDPageContentStream content = new PDPageContentStream(pdf, page)) {
          for (DrawOp op : Layout.drawOrder(ops)) {
            draw(content, op, fonts, theme.colours(), logo, images);
          }
        }
      }

      PDDocumentInformation info = pdf.getDocumentInformation();
      ReportDocument.Metadata metadata = document.metadata();
      info.setTitle(metadata.title());
      info.setSubject(metadata.subject());
      info.setKeywords(metadata.keywords());
      info.setProducer(metadata.producer());
      info.setCreator(metadata.producer());
      Calendar created = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
      created.setTimeInMillis(metadata.creationDate().toEpochMilli());
      info.setCreationDate(created);
      info.setModificationDate(created);

      ByteArrayOutputStream out = new ByteArrayOutputStream();
      pdf.save(out);
      return out.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException("qualify: cannot render the report", e);
    } finally {
      for (TrueTypeFont ttf : opened) {
        try {
          ttf.close();
        } catch (IOException e) {
          // The PDF is written; a font that will not close only holds memory.
        }
      }
    }
  }

  private static Color colour(Map<String, String> colours, String name) {
    String hex = colours.getOrDefault(name, "#000000");
    return new Color(Integer.parseInt(hex.substring(1), 16));
  }

  private static void draw(
      PDPageContentStream content,
      DrawOp op,
      Map<FontSlot, PDType0Font> fonts,
      Map<String, String> colours,
      @Nullable PDImageXObject logo,
      List<@Nullable PDImageXObject> images)
      throws IOException {
    if (op instanceof DrawOp.Text text) {
      content.beginText();
      content.setFont(Objects.requireNonNull(fonts.get(text.font())), (float) text.size());
      content.setNonStrokingColor(colour(colours, text.colour()));
      content.newLineAtOffset((float) text.x(), (float) text.y());
      content.showText(text.text());
      content.endText();
    } else if (op instanceof DrawOp.Line line) {
      content.setStrokingColor(colour(colours, line.colour()));
      content.setLineWidth((float) line.thickness());
      content.moveTo((float) line.x1(), (float) line.y1());
      content.lineTo((float) line.x2(), (float) line.y2());
      content.stroke();
    } else if (op instanceof DrawOp.Fill fill) {
      content.setNonStrokingColor(colour(colours, fill.colour()));
      content.addRect(
          (float) fill.x(), (float) fill.y(), (float) fill.width(), (float) fill.height());
      content.fill();
    } else if (op instanceof DrawOp.Image image) {
      PDImageXObject drawn =
          image.image() == DrawOp.Image.LOGO
              ? logo
              : image.image() < images.size() ? images.get(image.image()) : null;
      if (drawn != null) {
        content.drawImage(
            drawn,
            (float) image.x(),
            (float) image.y(),
            (float) image.width(),
            (float) image.height());
      }
    }
  }

  /**
   * Embed an image attachment, or return {@code null} when its bytes do not start with its format's
   * signature or PDFBox cannot read them.
   */
  static @Nullable PDImageXObject embedImage(
      PDDocument pdf, ReportImages.Source source, String name) {
    if (!ReportImages.signed(source.bytes(), source.format())) {
      return null;
    }
    try {
      return source.format() == ReportImages.Format.PNG
          ? PDImageXObject.createFromByteArray(pdf, source.bytes(), name)
          : JPEGFactory.createFromByteArray(pdf, source.bytes());
    } catch (IOException | RuntimeException e) {
      return null;
    }
  }

  private static TextMetrics metrics(
      Map<FontSlot, TrueTypeFont> ttfs, Map<FontSlot, PDType0Font> fonts) {
    return new TextMetrics() {
      @Override
      public boolean canDraw(int codePoint, FontSlot font) {
        try {
          return Objects.requireNonNull(ttfs.get(font)).getUnicodeCmapLookup().getGlyphId(codePoint)
              > 0;
        } catch (IOException e) {
          return false;
        }
      }

      @Override
      public double width(String text, double size, FontSlot font) {
        try {
          return Objects.requireNonNull(fonts.get(font)).getStringWidth(text) / 1000 * size;
        } catch (IOException e) {
          throw new UncheckedIOException(e);
        }
      }
    };
  }
}
