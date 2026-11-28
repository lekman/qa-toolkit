import type { ColourName, FontSlot } from "../theme";
import type { ITextMetrics } from "./interfaces";
import type { Block, Column, Field, Geometry, ImageSize, Page } from "./types";

import { ReportImages } from "./report-images";
import { ReportText } from "./report-text";

/** Font sizes in points, section 9.2. */
export const SIZE = {
  body: 9,
  caption: 8.5,
  /** Mono runs wide; at 8.5 pt a SHA-256 digest fits the value column on A4. */
  mono: 8.5,
  chrome: 8.5,
  h1: 20,
  h2: 14,
  h3: 11,
} as const;

const PAD_Y = 3.5;
const PAD_X = 4;
const LABEL = 0.28;
const lineHeight = (size: number): number => size * 1.4;
const sizeOf = (font: FontSlot): number =>
  font === "mono" ? SIZE.mono : SIZE.body;

/** The text a font slot can draw: anything else becomes `?`. */
const clean = (metrics: ITextMetrics, text: string, font: FontSlot): string =>
  ReportText.drawable(text, (code) => metrics.canDraw(code, font));

interface CellStyle {
  colour: ColourName;
  font: FontSlot;
}

/** The write position while content pages are laid out. */
class Cursor {
  readonly pages: Page[] = [[]];
  y: number;

  get bottom(): number {
    return this.g.margin;
  }

  get page(): Page {
    return this.pages[this.pages.length - 1] as Page;
  }

  get room(): number {
    return this.y - this.bottom;
  }

  get top(): number {
    return this.g.height - this.g.margin;
  }

  get width(): number {
    return this.g.width - 2 * this.g.margin;
  }

  constructor(
    readonly metrics: ITextMetrics,
    readonly g: Geometry,
    /** The pixel size of each image, or `null` for one that cannot be read. */
    readonly images: readonly (ImageSize | null)[] = [],
  ) {
    this.y = g.height - g.margin;
  }

  /** Draw wrapped lines from the cursor down, breaking pages between lines. */
  lines(
    lines: readonly string[],
    size: number,
    style: CellStyle,
    x = this.g.margin,
  ): void {
    const lh = lineHeight(size);
    for (const line of lines) {
      if (this.room < lh) this.newPage();
      this.text(line, x, this.y - size, size, style);
      this.y -= lh;
    }
  }

  newPage(): void {
    if (this.page.length === 0) {
      this.y = this.top;
      return;
    }
    this.pages.push([]);
    this.y = this.top;
  }

  text(
    text: string,
    x: number,
    y: number,
    size: number,
    style: CellStyle,
  ): void {
    if (text.length > 0)
      this.page.push({ kind: "text", text, x, y, size, ...style });
  }
}

/**
 * Layout of the report on pages, section 9.2: the cover, the content pages
 * after it, and the header and footer. Pure: text is measured through a port.
 */
export class Layout {
  /**
   * The header and footer of one content page: the header text on the left
   * and the classification on the right above a hairline, and the footer
   * text right-aligned below a hairline.
   */
  static chrome(
    header: string,
    classification: string,
    footer: string,
    metrics: ITextMetrics,
    g: Geometry,
  ): Page {
    const size = SIZE.chrome;
    const left = g.margin;
    const right = g.width - g.margin;
    const headerY = g.height - g.margin / 2 - size / 2;
    const footerY = g.margin / 2 - size;
    const ops: Page = [];
    const muted: CellStyle = { font: "body", colour: "muted" };
    const width = right - left;
    const c = Layout.fit(
      clean(metrics, classification, "body"),
      width / 2,
      size,
      "body",
      metrics,
    );
    const room =
      c.length === 0 ? width : width - metrics.width(c, size, "body") - 12;
    const h = Layout.fit(
      clean(metrics, header, "body"),
      room,
      size,
      "body",
      metrics,
    );
    const f = Layout.fit(
      clean(metrics, footer, "body"),
      width,
      size,
      "body",
      metrics,
    );
    if (h.length > 0)
      ops.push({ kind: "text", text: h, x: left, y: headerY, size, ...muted });
    if (c.length > 0) {
      ops.push({
        kind: "text",
        text: c,
        x: right - metrics.width(c, size, "body"),
        y: headerY,
        size,
        ...muted,
      });
    }
    ops.push({
      kind: "line",
      x1: left,
      x2: right,
      y1: headerY - 5,
      y2: headerY - 5,
      thickness: 0.5,
      colour: "rule",
    });
    ops.push({
      kind: "line",
      x1: left,
      x2: right,
      y1: footerY + size + 5,
      y2: footerY + size + 5,
      thickness: 0.5,
      colour: "rule",
    });
    if (f.length > 0) {
      ops.push({
        kind: "text",
        text: f,
        x: right - metrics.width(f, size, "body"),
        y: footerY,
        size,
        ...muted,
      });
    }
    return ops;
  }

  /**
   * The cover, section 9.1: logo and brand name at the top left, the title at
   * 40% of the page height with an accent rule and the subtitle below it,
   * and the metadata rows above the bottom margin under a hairline. A long
   * title moves up, and then shrinks, so it never runs into the rows.
   */
  static cover(
    cover: {
      brandName: null | string;
      fields: readonly Field[];
      subtitle: string;
      title: string;
    },
    logo: null | { height: number; width: number },
    metrics: ITextMetrics,
    g: Geometry,
  ): Page {
    const ops: Page = [];
    const width = g.width - 2 * g.margin;
    const top = g.height - g.margin;
    const mm = 72 / 25.4;

    // Brand: the logo, and the name beside it, vertically centred.
    let brandBottom = top;
    const brandSize = 14;
    if (logo !== null) {
      ops.push({
        kind: "image",
        x: g.margin,
        y: top - logo.height,
        width: logo.width,
        height: logo.height,
      });
      brandBottom = top - logo.height;
    }
    if (cover.brandName !== null && cover.brandName.length > 0) {
      const name = clean(metrics, cover.brandName, "heading");
      const x = g.margin + (logo === null ? 0 : logo.width + 10);
      const y =
        logo === null
          ? top - brandSize * 0.8
          : top - logo.height / 2 - brandSize * 0.35;
      ops.push({
        kind: "text",
        text: name,
        x,
        y,
        size: brandSize,
        font: "heading",
        colour: "muted",
      });
      brandBottom = Math.min(brandBottom, y - brandSize * 0.3);
    }

    // Metadata rows at the bottom margin, under a hairline.
    const rowSize = 9;
    const rowHeight = rowSize * 1.75;
    const labelWidth = Math.max(
      28 * mm,
      ...cover.fields.map(
        (f) =>
          metrics.width(
            clean(metrics, f.label, "bodyBold"),
            rowSize,
            "bodyBold",
          ) + 12,
      ),
    );
    const rows = cover.fields.map((field, i) => ({
      field,
      y: g.margin + (cover.fields.length - 1 - i) * rowHeight,
    }));
    const blockTop =
      g.margin + (cover.fields.length - 1) * rowHeight + rowSize + 10;
    ops.push({
      kind: "line",
      x1: g.margin,
      x2: g.margin + width,
      y1: blockTop,
      y2: blockTop,
      thickness: 0.5,
      colour: "rule",
    });
    for (const { field, y } of rows) {
      ops.push({
        kind: "text",
        text: clean(metrics, field.label, "bodyBold"),
        x: g.margin,
        y,
        size: rowSize,
        font: "bodyBold",
        colour: "text",
      });
      const value = clean(metrics, field.value, "body");
      const lines = Layout.wrap(
        value,
        width - labelWidth,
        rowSize,
        "body",
        metrics,
      );
      ops.push({
        kind: "text",
        text: lines.length > 1 ? `${lines[0] as string}…` : value,
        x: g.margin + labelWidth,
        y,
        size: rowSize,
        font: "body",
        colour: "muted",
      });
    }

    // Title, accent rule and subtitle, placed as a block.
    const subtitleSize = 13;
    const subtitle = Layout.wrap(
      clean(metrics, cover.subtitle, "body"),
      width,
      subtitleSize,
      "body",
      metrics,
    ).filter((line, i, all) => line.length > 0 || all.length === 1);
    const floor = blockTop + 12 * mm;
    const ceiling = brandBottom - 10 * mm;
    const place = (size: number, firstTop: number) => {
      const lines = Layout.wrap(
        clean(metrics, cover.title, "heading"),
        width,
        size,
        "heading",
        metrics,
      );
      const lh = size * 1.15;
      const baselines = lines.map((_, i) => firstTop - size * 0.78 - i * lh);
      const ruleY = (baselines.at(-1) as number) - size * 0.22 - 6 * mm;
      const subTop = ruleY - 6 * mm;
      const subBaselines = subtitle.map(
        (_, i) => subTop - subtitleSize * 0.8 - i * lineHeight(subtitleSize),
      );
      const bottom =
        cover.subtitle.length > 0
          ? (subBaselines.at(-1) as number) - subtitleSize * 0.25
          : ruleY;
      return {
        lines,
        size,
        baselines,
        ruleY,
        subBaselines,
        bottom,
        height: firstTop - bottom,
      };
    };
    let layout = place(30, g.height * 0.6);
    for (const size of [30, 26, 22, 18]) {
      layout = place(size, g.height * 0.6);
      if (layout.bottom < floor)
        layout = place(
          size,
          Math.min(ceiling, g.height * 0.6 + (floor - layout.bottom)),
        );
      if (layout.bottom >= floor) break;
    }
    layout.lines.forEach((line, i) => {
      ops.push({
        kind: "text",
        text: line,
        x: g.margin,
        y: layout.baselines[i] as number,
        size: layout.size,
        font: "heading",
        colour: "title",
      });
    });
    ops.push({
      kind: "line",
      x1: g.margin,
      x2: g.margin + 30 * mm,
      y1: layout.ruleY,
      y2: layout.ruleY,
      thickness: 1.5,
      colour: "accent",
    });
    if (cover.subtitle.length > 0) {
      subtitle.forEach((line, i) => {
        ops.push({
          kind: "text",
          text: line,
          x: g.margin,
          y: layout.subBaselines[i] as number,
          size: subtitleSize,
          font: "body",
          colour: "muted",
        });
      });
    }
    return ops;
  }

  /**
   * The order to draw a page in: fills first, then images, lines and text,
   * so a row's fill never covers the hairline of the row above it.
   */
  static drawOrder(page: Page): Page {
    const rank = { fill: 0, image: 1, line: 2, text: 3 } as const;
    return [...page].sort((a, b) => rank[a.kind] - rank[b.kind]);
  }

  /** Shorten text to a width, ending it with `…` when it had to be cut. */
  static fit(
    text: string,
    width: number,
    size: number,
    font: FontSlot,
    metrics: ITextMetrics,
  ): string {
    if (metrics.width(text, size, font) <= width) return text;
    const chars = [...text];
    while (
      chars.length > 0 &&
      metrics.width(`${chars.join("").trimEnd()}…`, size, font) > width
    )
      chars.pop();
    return chars.length === 0 ? "" : `${chars.join("").trimEnd()}…`;
  }

  /**
   * Lay out the content blocks on pages after the cover. `images` holds the
   * pixel size of each image the blocks refer to, or `null` for one the PDF
   * library could not read.
   */
  static paginate(
    blocks: readonly Block[],
    metrics: ITextMetrics,
    g: Geometry,
    images: readonly (ImageSize | null)[] = [],
  ): Page[] {
    const cursor = new Cursor(metrics, g, images);
    blocks.forEach((block, i) => Layout.block(cursor, block, blocks[i + 1]));
    return cursor.pages;
  }

  /**
   * Wrap text to a width: at spaces where possible, inside a word that is
   * wider than the line on its own. Line breaks in the text are kept.
   */
  static wrap(
    text: string,
    width: number,
    size: number,
    font: FontSlot,
    metrics: ITextMetrics,
  ): string[] {
    const fits = (t: string): boolean => metrics.width(t, size, font) <= width;
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const candidate = line.length === 0 ? word : `${line} ${word}`;
        if (fits(candidate)) {
          line = candidate;
          continue;
        }
        if (line.length > 0) lines.push(line);
        line = "";
        if (fits(word)) {
          line = word;
          continue;
        }
        for (const char of word) {
          if (line.length > 0 && !fits(line + char)) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  private static block(cursor: Cursor, block: Block, next?: Block): void {
    const { metrics } = cursor;
    const body: CellStyle = { font: "body", colour: "text" };
    switch (block.kind) {
      case "heading": {
        const size =
          block.level === 1 ? SIZE.h1 : block.level === 2 ? SIZE.h2 : SIZE.h3;
        const style: CellStyle = {
          font: "heading",
          colour: block.level === 1 ? "title" : "heading",
        };
        const lines = Layout.wrap(
          clean(metrics, block.text, "heading"),
          cursor.width,
          size,
          "heading",
          metrics,
        );
        const before = block.level === 1 ? 0 : block.level === 2 ? 16 : 9;
        const after = block.level === 1 ? 18 : 4;
        // Keep a heading with the start of what follows: a whole field list,
        // a table's header and first row, a list's first item, or the first
        // three signature roles, as far as that fits on a page.
        const follow = Math.min(
          Layout.leadHeight(cursor, next),
          cursor.top -
            cursor.bottom -
            before -
            lines.length * lineHeight(size) -
            after,
        );
        const needed =
          before + lines.length * lineHeight(size) + after + follow;
        if (cursor.room < needed) cursor.newPage();
        else if (cursor.y < cursor.top) cursor.y -= before;
        cursor.lines(lines, size, style);
        if (block.level === 1) {
          cursor.page.push({
            kind: "line",
            x1: cursor.g.margin,
            x2: cursor.g.margin + cursor.width,
            y1: cursor.y - 2,
            y2: cursor.y - 2,
            thickness: 1,
            colour: "accent",
          });
        }
        cursor.y -= after;
        return;
      }
      case "image":
        Layout.image(cursor, block);
        return;
      case "paragraph": {
        const font: FontSlot = block.mono === true ? "mono" : "body";
        const size = sizeOf(font);
        cursor.lines(
          Layout.wrap(
            clean(metrics, block.text, font),
            cursor.width,
            size,
            font,
            metrics,
          ),
          size,
          { font, colour: "text" },
        );
        cursor.y -= 4;
        return;
      }
      case "list": {
        const bullet = metrics.canDraw(0x2022, "body") ? "•" : "-";
        for (const item of block.items) {
          const lines = Layout.wrap(
            clean(metrics, item, "body"),
            cursor.width - 12,
            SIZE.body,
            "body",
            metrics,
          );
          if (cursor.room < lineHeight(SIZE.body)) cursor.newPage();
          cursor.text(
            bullet,
            cursor.g.margin + 2,
            cursor.y - SIZE.body,
            SIZE.body,
            body,
          );
          cursor.lines(lines, SIZE.body, body, cursor.g.margin + 12);
        }
        cursor.y -= 4;
        return;
      }
      case "fields":
        Layout.fields(cursor, block.fields);
        cursor.y -= 4;
        return;
      case "table":
        Layout.table(cursor, block.columns, block.rows);
        cursor.y -= 6;
        return;
      case "signatures":
        Layout.signatures(cursor, block.roles);
        return;
    }
  }

  private static fields(cursor: Cursor, fields: readonly Field[]): void {
    const { metrics } = cursor;
    const labelWidth = cursor.width * LABEL;
    const lh = lineHeight(SIZE.body);
    for (const field of fields) {
      const font: FontSlot = field.mono === true ? "mono" : "body";
      const label = Layout.wrap(
        clean(metrics, field.label, "bodyBold"),
        labelWidth - PAD_X,
        SIZE.body,
        "bodyBold",
        metrics,
      );
      const value = Layout.wrap(
        clean(metrics, field.value, font),
        cursor.width - labelWidth,
        sizeOf(font),
        font,
        metrics,
      );
      const height = Math.max(label.length, value.length) * lh + 2;
      if (height > cursor.room && height <= cursor.top - cursor.bottom)
        cursor.newPage();
      const rows = Math.max(label.length, value.length);
      for (let i = 0; i < rows; i++) {
        if (cursor.room < lh) cursor.newPage();
        const y = cursor.y - SIZE.body;
        if (label[i] !== undefined)
          cursor.text(label[i] as string, cursor.g.margin, y, SIZE.body, {
            font: "bodyBold",
            colour: "text",
          });
        if (value[i] !== undefined)
          cursor.text(
            value[i] as string,
            cursor.g.margin + labelWidth,
            y,
            sizeOf(font),
            { font, colour: "text" },
          );
        cursor.y -= lh;
      }
      cursor.y -= 2;
    }
  }

  /** The height a field list takes when laid out whole. */
  private static fieldsHeight(
    cursor: Cursor,
    fields: readonly Field[],
  ): number {
    const { metrics } = cursor;
    const labelWidth = cursor.width * LABEL;
    return fields.reduce((total, field) => {
      const font: FontSlot = field.mono === true ? "mono" : "body";
      const label = Layout.wrap(
        clean(metrics, field.label, "bodyBold"),
        labelWidth - PAD_X,
        SIZE.body,
        "bodyBold",
        metrics,
      );
      const value = Layout.wrap(
        clean(metrics, field.value, font),
        cursor.width - labelWidth,
        sizeOf(font),
        font,
        metrics,
      );
      return (
        total + Math.max(label.length, value.length) * lineHeight(SIZE.body) + 2
      );
    }, 0);
  }

  /**
   * An image attachment, section 9.2: scaled into the text width and half the
   * text height, framed in the rule colour, with its caption below, and both
   * kept on one page. An image that cannot be read becomes a line of text.
   */
  private static image(
    cursor: Cursor,
    block: Extract<Block, { kind: "image" }>,
  ): void {
    const { metrics } = cursor;
    const pixels = cursor.images[block.image] ?? null;
    if (pixels === null) {
      Layout.block(cursor, { kind: "paragraph", text: block.unreadable });
      return;
    }
    const size = ReportImages.fit(pixels, {
      width: cursor.width,
      height: (cursor.top - cursor.bottom) / 2,
    });
    const caption = Layout.wrap(
      clean(metrics, block.caption, "body"),
      cursor.width,
      SIZE.caption,
      "body",
      metrics,
    );
    const before = 6;
    const gap = 4;
    const height =
      before + size.height + gap + caption.length * lineHeight(SIZE.caption);
    if (cursor.room < height) cursor.newPage();
    else if (cursor.y < cursor.top) cursor.y -= before;
    const x = cursor.g.margin;
    const y = cursor.y - size.height;
    cursor.page.push({ kind: "image", image: block.image, x, y, ...size });
    const frame = (x1: number, y1: number, x2: number, y2: number): void => {
      cursor.page.push({
        kind: "line",
        x1,
        y1,
        x2,
        y2,
        thickness: 0.5,
        colour: "rule",
      });
    };
    const right = x + size.width;
    const top = y + size.height;
    frame(x, y, right, y);
    frame(right, y, right, top);
    frame(right, top, x, top);
    frame(x, top, x, y);
    cursor.y = y - gap;
    cursor.lines(caption, SIZE.caption, { font: "body", colour: "muted" });
    cursor.y -= 8;
  }

  /** The height of what a heading must keep with: the start of the next block. */
  private static leadHeight(cursor: Cursor, next: Block | undefined): number {
    const lh = lineHeight(SIZE.body);
    switch (next?.kind) {
      case "fields":
        return Layout.fieldsHeight(cursor, next.fields);
      case "table": {
        const { header, wrapped } = Layout.tableCells(
          cursor,
          next.columns,
          next.rows.slice(0, 1),
        );
        const height = (cells: string[][]): number =>
          Math.max(1, ...cells.map((c) => c.length)) * lh + 2 * PAD_Y;
        return height(header) + (wrapped[0] ? height(wrapped[0]) : 0);
      }
      case "list": {
        const first = next.items[0] ?? "";
        const lines = Layout.wrap(
          clean(cursor.metrics, first, "body"),
          cursor.width - 12,
          SIZE.body,
          "body",
          cursor.metrics,
        );
        return lines.length * lh;
      }
      case "signatures":
        return Layout.signatureHeight() * Math.min(next.roles.length, 3);
      default:
        return 2 * lh + 2 * PAD_Y;
    }
  }

  /** Draw one table row, filled or not, splitting it only when it is taller than a page. */
  private static row(
    cursor: Cursor,
    widths: readonly number[],
    cells: readonly string[][],
    styles: readonly CellStyle[],
    fill: ColourName | null,
    onNewPage: () => void,
  ): void {
    const lh = lineHeight(SIZE.body);
    const total = Math.max(1, ...cells.map((c) => c.length));
    const height = total * lh + 2 * PAD_Y;
    if (height > cursor.room && height <= cursor.top - cursor.bottom) {
      cursor.newPage();
      onNewPage();
    }
    let from = 0;
    while (from < total) {
      if (cursor.room < lh + 2 * PAD_Y) {
        cursor.newPage();
        onNewPage();
      }
      const fit = Math.max(1, Math.floor((cursor.room - 2 * PAD_Y) / lh));
      const to = Math.min(total, from + fit);
      const chunk = (to - from) * lh + 2 * PAD_Y;
      if (fill !== null) {
        cursor.page.push({
          kind: "fill",
          x: cursor.g.margin,
          y: cursor.y - chunk,
          width: cursor.width,
          height: chunk,
          colour: fill,
        });
      }
      let x = cursor.g.margin;
      cells.forEach((lines, column) => {
        lines.slice(from, to).forEach((line, i) => {
          const style = styles[column] as CellStyle;
          cursor.text(
            line,
            x + PAD_X,
            cursor.y - PAD_Y - SIZE.body - i * lh + 1,
            sizeOf(style.font),
            style,
          );
        });
        x += widths[column] as number;
      });
      cursor.y -= chunk;
      cursor.page.push({
        kind: "line",
        x1: cursor.g.margin,
        x2: cursor.g.margin + cursor.width,
        y1: cursor.y,
        y2: cursor.y,
        thickness: 0.5,
        colour: "rule",
      });
      from = to;
    }
  }

  /** The height one signature role takes. */
  private static signatureHeight(): number {
    return lineHeight(SIZE.h3) + 3 * (lineHeight(SIZE.body) + 14) + 12;
  }

  private static signatures(cursor: Cursor, roles: readonly string[]): void {
    const lh = lineHeight(SIZE.body);
    const perRole = Layout.signatureHeight();
    if (cursor.room < perRole * Math.min(roles.length, 3)) cursor.newPage();
    for (const role of roles) {
      if (cursor.room < perRole) cursor.newPage();
      cursor.lines([clean(cursor.metrics, role, "heading")], SIZE.h3, {
        font: "heading",
        colour: "heading",
      });
      for (const label of ["Name", "Signature", "Date"]) {
        cursor.y -= 14;
        cursor.text(label, cursor.g.margin, cursor.y - SIZE.body, SIZE.body, {
          font: "body",
          colour: "muted",
        });
        const lineY = cursor.y - SIZE.body - 2;
        cursor.page.push({
          kind: "line",
          x1: cursor.g.margin + cursor.width * LABEL,
          x2: cursor.g.margin + cursor.width,
          y1: lineY,
          y2: lineY,
          thickness: 0.6,
          colour: "rule",
        });
        cursor.y -= lh;
      }
      cursor.y -= 12;
    }
  }

  private static table(
    cursor: Cursor,
    columns: readonly Column[],
    rows: readonly string[][],
  ): void {
    const { widths, fonts, header, wrapped } = Layout.tableCells(
      cursor,
      columns,
      rows,
    );
    const headerStyles = columns.map((): CellStyle => ({
      font: "bodyBold",
      colour: "tableHeaderText",
    }));
    const bodyStyles = fonts.map((font): CellStyle => ({
      font,
      colour: "text",
    }));
    const drawHeader = (): void =>
      Layout.row(
        cursor,
        widths,
        header,
        headerStyles,
        "tableHeader",
        () => undefined,
      );
    const heightOf = (cells: string[][]): number =>
      Math.max(1, ...cells.map((c) => c.length)) * lineHeight(SIZE.body) +
      2 * PAD_Y;

    const first = wrapped[0];
    // Keep the header with the first row.
    if (cursor.room < heightOf(header) + (first ? heightOf(first) : 0))
      cursor.newPage();
    drawHeader();
    wrapped.forEach((cells, index) => {
      Layout.row(
        cursor,
        widths,
        cells,
        bodyStyles,
        index % 2 === 1 ? "tableStripe" : null,
        drawHeader,
      );
    });
  }

  /** A table's column widths and fonts, and its header and rows wrapped to them. */
  private static tableCells(
    cursor: Cursor,
    columns: readonly Column[],
    rows: readonly string[][],
  ): {
    fonts: FontSlot[];
    header: string[][];
    widths: number[];
    wrapped: string[][][];
  } {
    const { metrics } = cursor;
    const widths = columns.map((c) => c.width * cursor.width);
    const fonts: FontSlot[] = columns.map((c) =>
      c.mono === true ? "mono" : "body",
    );
    const wrap = (
      cells: readonly string[],
      font: (column: number) => FontSlot,
    ): string[][] =>
      cells.map((cell, column) =>
        Layout.wrap(
          clean(metrics, cell, font(column)),
          (widths[column] as number) - 2 * PAD_X,
          sizeOf(font(column)),
          font(column),
          metrics,
        ),
      );
    return {
      widths,
      fonts,
      header: wrap(
        columns.map((c) => c.header),
        () => "bodyBold",
      ),
      wrapped: rows.map((row) =>
        wrap(row, (column) => fonts[column] as FontSlot),
      ),
    };
  }
}
