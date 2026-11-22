package com.lekman.qualify.internal.report;

import com.lekman.qualify.internal.report.Block.Column;
import com.lekman.qualify.internal.report.Block.Field;
import com.lekman.qualify.internal.theme.FontSlot;
import java.util.ArrayList;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Layout of the report on pages, section 9.2 of the specification: the cover, the content pages
 * after it, and their header and footer. Pure: text is measured through {@link TextMetrics}.
 */
public final class Layout {

  /** Body text size in points. */
  public static final double BODY = 9;

  /** Mono runs wide; at 8.5 pt a SHA-256 digest fits the value column on A4. */
  public static final double MONO = 8.5;

  /** Header and footer size in points. */
  public static final double CHROME = 8.5;

  /** Image caption size in points. */
  public static final double CAPTION = 8.5;

  private static final double H1 = 20;
  private static final double H2 = 14;
  private static final double H3 = 11;
  private static final double PAD_Y = 3.5;
  private static final double PAD_X = 4;
  private static final double LABEL = 0.28;

  private Layout() {}

  /** A cell's font and colour. */
  private record Style(FontSlot font, String colour) {}

  /**
   * The logo's drawn size in points.
   *
   * @param width width
   * @param height height
   */
  public record LogoSize(double width, double height) {}

  /**
   * The header and footer of one content page: the header text on the left and the classification
   * on the right above a hairline, and the footer text right-aligned below a hairline.
   */
  public static List<DrawOp> chrome(
      String header, String classification, String footer, TextMetrics metrics, Geometry g) {
    double size = CHROME;
    double left = g.margin();
    double right = g.width() - g.margin();
    double headerY = g.height() - g.margin() / 2 - size / 2;
    double footerY = g.margin() / 2 - size;
    double width = right - left;
    List<DrawOp> ops = new ArrayList<>();
    String c =
        fit(clean(metrics, classification, FontSlot.BODY), width / 2, size, FontSlot.BODY, metrics);
    double room = c.isEmpty() ? width : width - metrics.width(c, size, FontSlot.BODY) - 12;
    String h = fit(clean(metrics, header, FontSlot.BODY), room, size, FontSlot.BODY, metrics);
    String f = fit(clean(metrics, footer, FontSlot.BODY), width, size, FontSlot.BODY, metrics);
    if (!h.isEmpty()) {
      ops.add(new DrawOp.Text(h, left, headerY, size, FontSlot.BODY, "muted"));
    }
    if (!c.isEmpty()) {
      ops.add(
          new DrawOp.Text(
              c,
              right - metrics.width(c, size, FontSlot.BODY),
              headerY,
              size,
              FontSlot.BODY,
              "muted"));
    }
    ops.add(new DrawOp.Line(left, headerY - 5, right, headerY - 5, 0.5, "rule"));
    ops.add(new DrawOp.Line(left, footerY + size + 5, right, footerY + size + 5, 0.5, "rule"));
    if (!f.isEmpty()) {
      ops.add(
          new DrawOp.Text(
              f,
              right - metrics.width(f, size, FontSlot.BODY),
              footerY,
              size,
              FontSlot.BODY,
              "muted"));
    }
    return ops;
  }

  /**
   * The cover, section 9.1: logo and brand name at the top left, the title at 40% of the page
   * height with an accent rule and the subtitle below it, and the metadata rows above the bottom
   * margin under a hairline. A long title moves up, and then shrinks, so it never runs into the
   * rows.
   */
  public static List<DrawOp> cover(
      ReportDocument.Cover cover, @Nullable LogoSize logo, TextMetrics metrics, Geometry g) {
    List<DrawOp> ops = new ArrayList<>();
    double width = g.width() - 2 * g.margin();
    double top = g.height() - g.margin();
    double mm = Geometry.MM;

    // Brand: the logo, and the name beside it, vertically centred.
    double brandBottom = top;
    double brandSize = 14;
    if (logo != null) {
      ops.add(new DrawOp.Image(g.margin(), top - logo.height(), logo.width(), logo.height()));
      brandBottom = top - logo.height();
    }
    String brandName = cover.brandName();
    if (brandName != null && !brandName.isEmpty()) {
      double x = g.margin() + (logo == null ? 0 : logo.width() + 10);
      double y = logo == null ? top - brandSize * 0.8 : top - logo.height() / 2 - brandSize * 0.35;
      ops.add(
          new DrawOp.Text(
              clean(metrics, brandName, FontSlot.HEADING),
              x,
              y,
              brandSize,
              FontSlot.HEADING,
              "muted"));
      brandBottom = Math.min(brandBottom, y - brandSize * 0.3);
    }

    // Metadata rows at the bottom margin, under a hairline.
    double rowSize = 9;
    double rowHeight = rowSize * 1.75;
    double labelWidth = 28 * mm;
    for (Field f : cover.fields()) {
      labelWidth =
          Math.max(
              labelWidth,
              metrics.width(
                      clean(metrics, f.label(), FontSlot.BODY_BOLD), rowSize, FontSlot.BODY_BOLD)
                  + 12);
    }
    int count = cover.fields().size();
    double blockTop = g.margin() + (count - 1) * rowHeight + rowSize + 10;
    ops.add(new DrawOp.Line(g.margin(), blockTop, g.margin() + width, blockTop, 0.5, "rule"));
    for (int i = 0; i < count; i++) {
      Field field = cover.fields().get(i);
      double y = g.margin() + (count - 1 - i) * rowHeight;
      ops.add(
          new DrawOp.Text(
              clean(metrics, field.label(), FontSlot.BODY_BOLD),
              g.margin(),
              y,
              rowSize,
              FontSlot.BODY_BOLD,
              "text"));
      String value = clean(metrics, field.value(), FontSlot.BODY);
      List<String> lines = wrap(value, width - labelWidth, rowSize, FontSlot.BODY, metrics);
      ops.add(
          new DrawOp.Text(
              lines.size() > 1 ? lines.get(0) + "…" : value,
              g.margin() + labelWidth,
              y,
              rowSize,
              FontSlot.BODY,
              "muted"));
    }

    // Title, accent rule and subtitle, placed as a block.
    double subtitleSize = 13;
    List<String> wrappedSubtitle =
        wrap(
            clean(metrics, cover.subtitle(), FontSlot.BODY),
            width,
            subtitleSize,
            FontSlot.BODY,
            metrics);
    List<String> subtitle = new ArrayList<>();
    for (String line : wrappedSubtitle) {
      if (!line.isEmpty() || wrappedSubtitle.size() == 1) {
        subtitle.add(line);
      }
    }
    double floor = blockTop + 12 * mm;
    double ceiling = brandBottom - 10 * mm;
    TitleBlock layout = placeTitle(cover, subtitle, 30, g.height() * 0.6, width, metrics);
    for (double size : new double[] {30, 26, 22, 18}) {
      layout = placeTitle(cover, subtitle, size, g.height() * 0.6, width, metrics);
      if (layout.bottom() < floor) {
        layout =
            placeTitle(
                cover,
                subtitle,
                size,
                Math.min(ceiling, g.height() * 0.6 + (floor - layout.bottom())),
                width,
                metrics);
      }
      if (layout.bottom() >= floor) {
        break;
      }
    }
    for (int i = 0; i < layout.lines().size(); i++) {
      ops.add(
          new DrawOp.Text(
              layout.lines().get(i),
              g.margin(),
              layout.baselines().get(i),
              layout.size(),
              FontSlot.HEADING,
              "title"));
    }
    ops.add(
        new DrawOp.Line(
            g.margin(), layout.ruleY(), g.margin() + 30 * mm, layout.ruleY(), 1.5, "accent"));
    if (!cover.subtitle().isEmpty()) {
      for (int i = 0; i < subtitle.size(); i++) {
        ops.add(
            new DrawOp.Text(
                subtitle.get(i),
                g.margin(),
                layout.subBaselines().get(i),
                subtitleSize,
                FontSlot.BODY,
                "muted"));
      }
    }
    return ops;
  }

  /**
   * The order to draw a page in: fills first, then images, lines and text, so a row's fill never
   * covers the hairline of the row above it. The order within each kind is kept.
   */
  public static List<DrawOp> drawOrder(List<DrawOp> page) {
    List<DrawOp> sorted = new ArrayList<>(page);
    sorted.sort(java.util.Comparator.comparingInt(Layout::rank));
    return sorted;
  }

  /** Shorten text to a width, ending it with {@code …} when it had to be cut. */
  public static String fit(
      String text, double width, double size, FontSlot font, TextMetrics metrics) {
    if (metrics.width(text, size, font) <= width) {
      return text;
    }
    int[] codes = text.codePoints().toArray();
    int keep = codes.length;
    while (keep > 0
        && metrics.width(new String(codes, 0, keep).stripTrailing() + "…", size, font) > width) {
      keep--;
    }
    return keep == 0 ? "" : new String(codes, 0, keep).stripTrailing() + "…";
  }

  /** Lay out the content blocks on the pages after the cover, with no images. */
  public static List<List<DrawOp>> paginate(List<Block> blocks, TextMetrics metrics, Geometry g) {
    return paginate(blocks, metrics, g, List.of());
  }

  /**
   * Lay out the content blocks on the pages after the cover. {@code images} holds the pixel size of
   * each image the blocks refer to, or {@code null} for one the PDF library could not read.
   */
  public static List<List<DrawOp>> paginate(
      List<Block> blocks,
      TextMetrics metrics,
      Geometry g,
      List<ReportImages.@Nullable Size> images) {
    Cursor cursor = new Cursor(metrics, g, images);
    for (int i = 0; i < blocks.size(); i++) {
      block(cursor, blocks.get(i), i + 1 < blocks.size() ? blocks.get(i + 1) : null);
    }
    return cursor.pages;
  }

  /**
   * Wrap text to a width: at spaces where possible, inside a word that is wider than the line on
   * its own. Line breaks in the text are kept.
   */
  public static List<String> wrap(
      String text, double width, double size, FontSlot font, TextMetrics metrics) {
    List<String> lines = new ArrayList<>();
    for (String paragraph : text.split("\n", -1)) {
      StringBuilder line = new StringBuilder();
      for (String word : paragraph.split(" ", -1)) {
        String candidate = line.length() == 0 ? word : line + " " + word;
        if (metrics.width(candidate, size, font) <= width) {
          line.setLength(0);
          line.append(candidate);
          continue;
        }
        if (line.length() > 0) {
          lines.add(line.toString());
        }
        line.setLength(0);
        if (metrics.width(word, size, font) <= width) {
          line.append(word);
          continue;
        }
        int[] codes = word.codePoints().toArray();
        for (int code : codes) {
          String next = line + new String(Character.toChars(code));
          if (line.length() > 0 && metrics.width(next, size, font) > width) {
            lines.add(line.toString());
            line.setLength(0);
          }
          line.appendCodePoint(code);
        }
      }
      lines.add(line.toString());
    }
    return lines;
  }

  private static void block(Cursor cursor, Block block, @Nullable Block next) {
    TextMetrics metrics = cursor.metrics;
    Style body = new Style(FontSlot.BODY, "text");
    if (block instanceof Block.Heading heading) {
      double size = heading.level() == 1 ? H1 : heading.level() == 2 ? H2 : H3;
      Style style = new Style(FontSlot.HEADING, heading.level() == 1 ? "title" : "heading");
      List<String> lines =
          wrap(
              clean(metrics, heading.text(), FontSlot.HEADING),
              cursor.width(),
              size,
              FontSlot.HEADING,
              metrics);
      double before = heading.level() == 1 ? 0 : heading.level() == 2 ? 16 : 9;
      double after = heading.level() == 1 ? 18 : 4;
      // Keep a heading with the start of what follows: a whole field list, a table's header and
      // first row, a list's first item, or the first three signature roles, as far as that fits
      // on a page.
      double follow =
          Math.min(
              leadHeight(cursor, next),
              cursor.top() - cursor.bottom() - before - lines.size() * lineHeight(size) - after);
      double needed = before + lines.size() * lineHeight(size) + after + follow;
      if (cursor.room() < needed) {
        cursor.newPage();
      } else if (cursor.y < cursor.top()) {
        cursor.y -= before;
      }
      cursor.lines(lines, size, style, cursor.g.margin());
      if (heading.level() == 1) {
        cursor
            .page()
            .add(
                new DrawOp.Line(
                    cursor.g.margin(),
                    cursor.y - 2,
                    cursor.g.margin() + cursor.width(),
                    cursor.y - 2,
                    1,
                    "accent"));
      }
      cursor.y -= after;
    } else if (block instanceof Block.Paragraph paragraph) {
      cursor.lines(
          wrap(
              clean(metrics, paragraph.text(), FontSlot.BODY),
              cursor.width(),
              BODY,
              FontSlot.BODY,
              metrics),
          BODY,
          body,
          cursor.g.margin());
      cursor.y -= 4;
    } else if (block instanceof Block.Bullets bullets) {
      String bullet = metrics.canDraw(0x2022, FontSlot.BODY) ? "•" : "-";
      for (String item : bullets.items()) {
        List<String> lines =
            wrap(
                clean(metrics, item, FontSlot.BODY),
                cursor.width() - 12,
                BODY,
                FontSlot.BODY,
                metrics);
        if (cursor.room() < lineHeight(BODY)) {
          cursor.newPage();
        }
        cursor.text(bullet, cursor.g.margin() + 2, cursor.y - BODY, BODY, body);
        cursor.lines(lines, BODY, body, cursor.g.margin() + 12);
      }
      cursor.y -= 4;
    } else if (block instanceof Block.Fields fields) {
      fields(cursor, fields.fields());
      cursor.y -= 4;
    } else if (block instanceof Block.Table table) {
      table(cursor, table.columns(), table.rows());
      cursor.y -= 6;
    } else if (block instanceof Block.Image image) {
      image(cursor, image);
    } else if (block instanceof Block.Signatures signatures) {
      signatures(cursor, signatures.roles());
    }
  }

  private static String clean(TextMetrics metrics, String text, FontSlot font) {
    return ReportText.drawable(text, code -> metrics.canDraw(code, font));
  }

  private static void fields(Cursor cursor, List<Field> fields) {
    TextMetrics metrics = cursor.metrics;
    double labelWidth = cursor.width() * LABEL;
    double lh = lineHeight(BODY);
    for (Field field : fields) {
      FontSlot font = field.mono() ? FontSlot.MONO : FontSlot.BODY;
      List<String> label =
          wrap(
              clean(metrics, field.label(), FontSlot.BODY_BOLD),
              labelWidth - PAD_X,
              BODY,
              FontSlot.BODY_BOLD,
              metrics);
      List<String> value =
          wrap(
              clean(metrics, field.value(), font),
              cursor.width() - labelWidth,
              sizeOf(font),
              font,
              metrics);
      int rows = Math.max(label.size(), value.size());
      double height = rows * lh + 2;
      if (height > cursor.room() && height <= cursor.top() - cursor.bottom()) {
        cursor.newPage();
      }
      for (int i = 0; i < rows; i++) {
        if (cursor.room() < lh) {
          cursor.newPage();
        }
        double y = cursor.y - BODY;
        if (i < label.size()) {
          cursor.text(
              label.get(i), cursor.g.margin(), y, BODY, new Style(FontSlot.BODY_BOLD, "text"));
        }
        if (i < value.size()) {
          cursor.text(
              value.get(i),
              cursor.g.margin() + labelWidth,
              y,
              sizeOf(font),
              new Style(font, "text"));
        }
        cursor.y -= lh;
      }
      cursor.y -= 2;
    }
  }

  /** The height a field list takes when laid out whole. */
  private static double fieldsHeight(Cursor cursor, List<Field> fields) {
    TextMetrics metrics = cursor.metrics;
    double labelWidth = cursor.width() * LABEL;
    double total = 0;
    for (Field field : fields) {
      FontSlot font = field.mono() ? FontSlot.MONO : FontSlot.BODY;
      int label =
          wrap(
                  clean(metrics, field.label(), FontSlot.BODY_BOLD),
                  labelWidth - PAD_X,
                  BODY,
                  FontSlot.BODY_BOLD,
                  metrics)
              .size();
      int value =
          wrap(
                  clean(metrics, field.value(), font),
                  cursor.width() - labelWidth,
                  sizeOf(font),
                  font,
                  metrics)
              .size();
      total += Math.max(label, value) * lineHeight(BODY) + 2;
    }
    return total;
  }

  /**
   * An image attachment, section 9.2: scaled into the text width and half the text height, framed
   * in the rule colour, with its caption below, and both kept on one page. An image that cannot be
   * read becomes a line of text.
   */
  private static void image(Cursor cursor, Block.Image block) {
    ReportImages.Size pixels =
        block.image() >= 0 && block.image() < cursor.images.size()
            ? cursor.images.get(block.image())
            : null;
    if (pixels == null) {
      block(cursor, new Block.Paragraph(block.unreadable()), null);
      return;
    }
    ReportImages.Size size =
        ReportImages.fit(
            pixels, new ReportImages.Size(cursor.width(), (cursor.top() - cursor.bottom()) / 2));
    List<String> caption =
        wrap(
            clean(cursor.metrics, block.caption(), FontSlot.BODY),
            cursor.width(),
            CAPTION,
            FontSlot.BODY,
            cursor.metrics);
    double before = 6;
    double gap = 4;
    double height = before + size.height() + gap + caption.size() * lineHeight(CAPTION);
    if (cursor.room() < height) {
      cursor.newPage();
    } else if (cursor.y < cursor.top()) {
      cursor.y -= before;
    }
    double x = cursor.g.margin();
    double y = cursor.y - size.height();
    double right = x + size.width();
    double top = y + size.height();
    List<DrawOp> page = cursor.page();
    page.add(new DrawOp.Image(x, y, size.width(), size.height(), block.image()));
    page.add(new DrawOp.Line(x, y, right, y, 0.5, "rule"));
    page.add(new DrawOp.Line(right, y, right, top, 0.5, "rule"));
    page.add(new DrawOp.Line(right, top, x, top, 0.5, "rule"));
    page.add(new DrawOp.Line(x, top, x, y, 0.5, "rule"));
    cursor.y = y - gap;
    cursor.lines(caption, CAPTION, new Style(FontSlot.BODY, "muted"), x);
    cursor.y -= 8;
  }

  /** The height of what a heading must keep with: the start of the next block. */
  private static double leadHeight(Cursor cursor, @Nullable Block next) {
    double lh = lineHeight(BODY);
    if (next instanceof Block.Fields fields) {
      return fieldsHeight(cursor, fields.fields());
    }
    if (next instanceof Block.Table table) {
      TableCells cells =
          tableCells(
              cursor,
              table.columns(),
              table.rows().isEmpty() ? List.of() : table.rows().subList(0, 1));
      return heightOf(cells.header())
          + (cells.wrapped().isEmpty() ? 0 : heightOf(cells.wrapped().get(0)));
    }
    if (next instanceof Block.Bullets bullets) {
      String first = bullets.items().isEmpty() ? "" : bullets.items().get(0);
      return wrap(
                  clean(cursor.metrics, first, FontSlot.BODY),
                  cursor.width() - 12,
                  BODY,
                  FontSlot.BODY,
                  cursor.metrics)
              .size()
          * lh;
    }
    if (next instanceof Block.Signatures signatures) {
      return signatureHeight() * Math.min(signatures.roles().size(), 3);
    }
    return 2 * lh + 2 * PAD_Y;
  }

  private static double lineHeight(double size) {
    return size * 1.4;
  }

  /** Draw one table row, filled or not, splitting it only when it is taller than a page. */
  private static void row(
      Cursor cursor,
      List<Double> widths,
      List<List<String>> cells,
      List<Style> styles,
      @Nullable String fill,
      Runnable onNewPage) {
    double lh = lineHeight(BODY);
    int total = Math.max(1, cells.stream().mapToInt(List::size).max().orElse(1));
    double height = total * lh + 2 * PAD_Y;
    if (height > cursor.room() && height <= cursor.top() - cursor.bottom()) {
      cursor.newPage();
      onNewPage.run();
    }
    int from = 0;
    while (from < total) {
      if (cursor.room() < lh + 2 * PAD_Y) {
        cursor.newPage();
        onNewPage.run();
      }
      int fit = Math.max(1, (int) Math.floor((cursor.room() - 2 * PAD_Y) / lh));
      int to = Math.min(total, from + fit);
      double chunk = (to - from) * lh + 2 * PAD_Y;
      if (fill != null) {
        cursor
            .page()
            .add(new DrawOp.Fill(cursor.g.margin(), cursor.y - chunk, cursor.width(), chunk, fill));
      }
      double x = cursor.g.margin();
      for (int column = 0; column < cells.size(); column++) {
        List<String> lines = cells.get(column);
        Style style = styles.get(column);
        for (int i = from; i < Math.min(to, lines.size()); i++) {
          cursor.text(
              lines.get(i),
              x + PAD_X,
              cursor.y - PAD_Y - BODY - (i - from) * lh + 1,
              sizeOf(style.font()),
              style);
        }
        x += widths.get(column);
      }
      cursor.y -= chunk;
      cursor
          .page()
          .add(
              new DrawOp.Line(
                  cursor.g.margin(),
                  cursor.y,
                  cursor.g.margin() + cursor.width(),
                  cursor.y,
                  0.5,
                  "rule"));
      from = to;
    }
  }

  private static int rank(DrawOp op) {
    if (op instanceof DrawOp.Fill) {
      return 0;
    }
    if (op instanceof DrawOp.Image) {
      return 1;
    }
    return op instanceof DrawOp.Line ? 2 : 3;
  }

  /** The height one signature role takes. */
  private static double signatureHeight() {
    return lineHeight(H3) + 3 * (lineHeight(BODY) + 14) + 12;
  }

  private static void signatures(Cursor cursor, List<String> roles) {
    double lh = lineHeight(BODY);
    double perRole = signatureHeight();
    if (cursor.room() < perRole * Math.min(roles.size(), 3)) {
      cursor.newPage();
    }
    for (String role : roles) {
      if (cursor.room() < perRole) {
        cursor.newPage();
      }
      cursor.lines(
          List.of(clean(cursor.metrics, role, FontSlot.HEADING)),
          H3,
          new Style(FontSlot.HEADING, "heading"),
          cursor.g.margin());
      for (String label : List.of("Name", "Signature", "Date")) {
        cursor.y -= 14;
        cursor.text(
            label, cursor.g.margin(), cursor.y - BODY, BODY, new Style(FontSlot.BODY, "muted"));
        double lineY = cursor.y - BODY - 2;
        cursor
            .page()
            .add(
                new DrawOp.Line(
                    cursor.g.margin() + cursor.width() * LABEL,
                    lineY,
                    cursor.g.margin() + cursor.width(),
                    lineY,
                    0.6,
                    "rule"));
        cursor.y -= lh;
      }
      cursor.y -= 12;
    }
  }

  private static double sizeOf(FontSlot font) {
    return font == FontSlot.MONO ? MONO : BODY;
  }

  /** A table's column widths and fonts, and its header and rows wrapped to them. */
  private record TableCells(
      List<Double> widths,
      List<FontSlot> fonts,
      List<List<String>> header,
      List<List<List<String>>> wrapped) {}

  private static TableCells tableCells(
      Cursor cursor, List<Column> columns, List<List<String>> rows) {
    TextMetrics metrics = cursor.metrics;
    List<Double> widths = columns.stream().map(c -> c.width() * cursor.width()).toList();
    List<FontSlot> fonts =
        columns.stream().map(c -> c.mono() ? FontSlot.MONO : FontSlot.BODY).toList();
    List<List<String>> header = new ArrayList<>();
    for (int column = 0; column < columns.size(); column++) {
      header.add(
          wrap(
              clean(metrics, columns.get(column).header(), FontSlot.BODY_BOLD),
              widths.get(column) - 2 * PAD_X,
              BODY,
              FontSlot.BODY_BOLD,
              metrics));
    }
    List<List<List<String>>> wrapped = new ArrayList<>();
    for (List<String> row : rows) {
      List<List<String>> cells = new ArrayList<>();
      for (int column = 0; column < row.size(); column++) {
        FontSlot font = fonts.get(column);
        cells.add(
            wrap(
                clean(metrics, row.get(column), font),
                widths.get(column) - 2 * PAD_X,
                sizeOf(font),
                font,
                metrics));
      }
      wrapped.add(cells);
    }
    return new TableCells(widths, fonts, header, wrapped);
  }

  private static void table(Cursor cursor, List<Column> columns, List<List<String>> rows) {
    TableCells cells = tableCells(cursor, columns, rows);
    List<Double> widths = cells.widths();
    List<List<String>> header = cells.header();
    List<List<List<String>>> wrapped = cells.wrapped();
    List<FontSlot> fonts = cells.fonts();
    List<Style> headerStyles =
        columns.stream().map(c -> new Style(FontSlot.BODY_BOLD, "tableHeaderText")).toList();
    List<Style> bodyStyles = fonts.stream().map(f -> new Style(f, "text")).toList();
    Runnable drawHeader = () -> row(cursor, widths, header, headerStyles, "tableHeader", () -> {});
    double first = wrapped.isEmpty() ? 0 : heightOf(wrapped.get(0));
    // Keep the header with the first row.
    if (cursor.room() < heightOf(header) + first) {
      cursor.newPage();
    }
    drawHeader.run();
    for (int index = 0; index < wrapped.size(); index++) {
      row(
          cursor,
          widths,
          wrapped.get(index),
          bodyStyles,
          index % 2 == 1 ? "tableStripe" : null,
          drawHeader);
    }
  }

  private static double heightOf(List<List<String>> cells) {
    return Math.max(1, cells.stream().mapToInt(List::size).max().orElse(1)) * lineHeight(BODY)
        + 2 * PAD_Y;
  }

  private static TitleBlock placeTitle(
      ReportDocument.Cover cover,
      List<String> subtitle,
      double size,
      double firstTop,
      double width,
      TextMetrics metrics) {
    double mm = Geometry.MM;
    double subtitleSize = 13;
    List<String> lines =
        wrap(
            clean(metrics, cover.title(), FontSlot.HEADING),
            width,
            size,
            FontSlot.HEADING,
            metrics);
    double lh = size * 1.15;
    List<Double> baselines = new ArrayList<>();
    for (int i = 0; i < lines.size(); i++) {
      baselines.add(firstTop - size * 0.78 - i * lh);
    }
    double ruleY = baselines.get(baselines.size() - 1) - size * 0.22 - 6 * mm;
    double subTop = ruleY - 6 * mm;
    List<Double> subBaselines = new ArrayList<>();
    for (int i = 0; i < subtitle.size(); i++) {
      subBaselines.add(subTop - subtitleSize * 0.8 - i * lineHeight(subtitleSize));
    }
    double bottom =
        !cover.subtitle().isEmpty() && !subBaselines.isEmpty()
            ? subBaselines.get(subBaselines.size() - 1) - subtitleSize * 0.25
            : ruleY;
    return new TitleBlock(lines, size, baselines, ruleY, subBaselines, bottom);
  }

  /** Where the cover's title, rule and subtitle go. */
  private record TitleBlock(
      List<String> lines,
      double size,
      List<Double> baselines,
      double ruleY,
      List<Double> subBaselines,
      double bottom) {}

  /** The write position while content pages are laid out. */
  private static final class Cursor {
    final List<List<DrawOp>> pages = new ArrayList<>();
    final TextMetrics metrics;
    final Geometry g;
    final List<ReportImages.@Nullable Size> images;
    double y;

    Cursor(TextMetrics metrics, Geometry g, List<ReportImages.@Nullable Size> images) {
      this.metrics = metrics;
      this.g = g;
      this.images = images;
      this.pages.add(new ArrayList<>());
      this.y = top();
    }

    double bottom() {
      return g.margin();
    }

    /** Draw wrapped lines from the cursor down, breaking pages between lines. */
    void lines(List<String> lines, double size, Style style, double x) {
      double lh = lineHeight(size);
      for (String line : lines) {
        if (room() < lh) {
          newPage();
        }
        text(line, x, y - size, size, style);
        y -= lh;
      }
    }

    void newPage() {
      if (page().isEmpty()) {
        y = top();
        return;
      }
      pages.add(new ArrayList<>());
      y = top();
    }

    List<DrawOp> page() {
      return pages.get(pages.size() - 1);
    }

    double room() {
      return y - bottom();
    }

    void text(String text, double x, double baseline, double size, Style style) {
      if (!text.isEmpty()) {
        page().add(new DrawOp.Text(text, x, baseline, size, style.font(), style.colour()));
      }
    }

    double top() {
      return g.height() - g.margin();
    }

    double width() {
      return g.width() - 2 * g.margin();
    }
  }
}
