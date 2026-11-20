import type { ITextMetrics } from "./interfaces";
import type { Block, Column, Page } from "./types";

/** A4 portrait in points, with 20 mm margins. */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: (20 / 25.4) * 72,
} as const;

const CONTENT = PAGE.width - 2 * PAGE.margin;
const TOP = PAGE.height - PAGE.margin;
const BOTTOM = PAGE.margin;
const SIZE = { title: 20, h1: 13, h2: 10.5, body: 9, table: 8 } as const;
const PAD = 3;
const LABEL = 0.24;

const lineHeight = (size: number): number => size * 1.35;

/** Lays out report blocks on A4 pages. Pure: text is measured through a port. */
class Cursor {
  readonly pages: Page[] = [[]];
  y = TOP;

  get page(): Page {
    return this.pages[this.pages.length - 1] as Page;
  }

  /** Space left on the page, in points. */
  get room(): number {
    return this.y - BOTTOM;
  }

  constructor(readonly metrics: ITextMetrics) {}

  /** Draw lines of text from the cursor down, breaking pages between lines. */
  lines(
    lines: readonly string[],
    size: number,
    bold: boolean,
    x = PAGE.margin,
  ): void {
    const lh = lineHeight(size);
    for (const line of lines) {
      if (this.room < lh) this.newPage();
      this.text(line, x, this.y - size, size, bold);
      this.y -= lh;
    }
  }

  /** Start a new page unless the current one is empty. */
  newPage(): void {
    if (this.page.length === 0 && this.y === TOP) return;
    this.pages.push([]);
    this.y = TOP;
  }

  text(text: string, x: number, y: number, size: number, bold: boolean): void {
    if (text.length > 0)
      this.page.push({ kind: "text", text, x, y, size, bold });
  }
}

/** Layout of report blocks into pages of drawing instructions, section 9.2. */
export class Layout {
  /** Lay out the blocks. Every page has room left at the bottom for a footer. */
  static paginate(blocks: readonly Block[], metrics: ITextMetrics): Page[] {
    const cursor = new Cursor(metrics);
    for (const block of blocks) Layout.block(cursor, block);
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
    bold: boolean,
    metrics: ITextMetrics,
  ): string[] {
    const fits = (t: string): boolean => metrics.width(t, size, bold) <= width;
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

  private static block(cursor: Cursor, block: Block): void {
    const { metrics } = cursor;
    switch (block.kind) {
      case "pageBreak":
        cursor.newPage();
        return;
      case "title": {
        cursor.lines(
          Layout.wrap(block.text, CONTENT, SIZE.title, true, metrics),
          SIZE.title,
          true,
        );
        cursor.y -= 10;
        return;
      }
      case "heading": {
        const size = block.level === 1 ? SIZE.h1 : SIZE.h2;
        const lines = Layout.wrap(block.text, CONTENT, size, true, metrics);
        const before = block.level === 1 ? 12 : 6;
        // Keep a heading with at least two lines of what follows.
        const needed =
          before +
          lines.length * lineHeight(size) +
          2 * lineHeight(SIZE.body) +
          2 * PAD;
        if (cursor.room < needed) cursor.newPage();
        else if (cursor.y < TOP) cursor.y -= before;
        cursor.lines(lines, size, true);
        cursor.y -= 3;
        return;
      }
      case "paragraph":
        cursor.lines(
          Layout.wrap(block.text, CONTENT, SIZE.body, false, metrics),
          SIZE.body,
          false,
        );
        cursor.y -= 4;
        return;
      case "list":
        for (const item of block.items) {
          const lines = Layout.wrap(
            item,
            CONTENT - 12,
            SIZE.body,
            false,
            metrics,
          );
          if (cursor.room < lineHeight(SIZE.body)) cursor.newPage();
          cursor.text(
            "•",
            PAGE.margin + 2,
            cursor.y - SIZE.body,
            SIZE.body,
            false,
          );
          cursor.lines(lines, SIZE.body, false, PAGE.margin + 12);
        }
        cursor.y -= 4;
        return;
      case "fields":
        Layout.table(
          cursor,
          [
            { header: "", width: LABEL },
            { header: "", width: 1 - LABEL },
          ],
          block.rows,
          { header: false, boldFirst: true, size: SIZE.body, rules: false },
        );
        cursor.y -= 4;
        return;
      case "table":
        Layout.table(cursor, block.columns, block.rows, {
          header: true,
          boldFirst: false,
          size: SIZE.table,
          rules: true,
        });
        cursor.y -= 6;
        return;
      case "signatures":
        Layout.signatures(cursor, block.roles);
        return;
    }
  }

  private static row(
    cursor: Cursor,
    widths: readonly number[],
    cells: readonly string[][],
    style: {
      bold: (column: number) => boolean;
      fill: boolean;
      rules: boolean;
      size: number;
    },
  ): void {
    const lh = lineHeight(style.size);
    const height = Math.max(1, ...cells.map((c) => c.length)) * lh + 2 * PAD;
    const page = TOP - BOTTOM;
    // A row moves to the next page whole, unless it is taller than a page.
    if (height > cursor.room && height <= page) cursor.newPage();
    let from = 0;
    const total = Math.max(1, ...cells.map((c) => c.length));
    while (from < total) {
      if (cursor.room < lh + 2 * PAD) cursor.newPage();
      const fit = Math.max(1, Math.floor((cursor.room - 2 * PAD) / lh));
      const to = Math.min(total, from + fit);
      const chunk = (to - from) * lh + 2 * PAD;
      if (style.fill) {
        cursor.page.push({
          kind: "fill",
          x: PAGE.margin,
          y: cursor.y - chunk,
          width: CONTENT,
          height: chunk,
        });
      }
      let x = PAGE.margin;
      cells.forEach((lines, column) => {
        lines.slice(from, to).forEach((line, i) => {
          cursor.text(
            line,
            x + PAD,
            cursor.y - PAD - style.size - i * lh,
            style.size,
            style.bold(column),
          );
        });
        x += widths[column] as number;
      });
      cursor.y -= chunk;
      if (style.rules) {
        cursor.page.push({
          kind: "line",
          x1: PAGE.margin,
          x2: PAGE.margin + CONTENT,
          y1: cursor.y,
          y2: cursor.y,
          thickness: 0.4,
        });
      }
      from = to;
    }
  }

  private static signatures(cursor: Cursor, roles: readonly string[]): void {
    const lh = lineHeight(SIZE.body);
    const perRole = lineHeight(SIZE.h2) + 3 * (lh + 12) + 10;
    if (cursor.room < perRole * Math.min(roles.length, 3)) cursor.newPage();
    for (const role of roles) {
      if (cursor.room < perRole) cursor.newPage();
      cursor.lines([role], SIZE.h2, true);
      for (const label of ["Name", "Signature", "Date"]) {
        cursor.y -= 12;
        cursor.text(label, PAGE.margin, cursor.y - SIZE.body, SIZE.body, false);
        const lineY = cursor.y - SIZE.body - 2;
        cursor.page.push({
          kind: "line",
          x1: PAGE.margin + CONTENT * LABEL,
          x2: PAGE.margin + CONTENT,
          y1: lineY,
          y2: lineY,
          thickness: 0.6,
        });
        cursor.y -= lh;
      }
      cursor.y -= 10;
    }
  }

  private static table(
    cursor: Cursor,
    columns: readonly Column[],
    rows: readonly string[][],
    options: {
      boldFirst: boolean;
      header: boolean;
      rules: boolean;
      size: number;
    },
  ): void {
    const widths = columns.map((c) => c.width * CONTENT);
    const wrap = (
      cells: readonly string[],
      bold: (column: number) => boolean,
    ): string[][] =>
      cells.map((cell, column) =>
        Layout.wrap(
          cell,
          (widths[column] as number) - 2 * PAD,
          options.size,
          bold(column),
          cursor.metrics,
        ),
      );
    const header = wrap(
      columns.map((c) => c.header),
      () => true,
    );
    const drawHeader = (): void =>
      Layout.row(cursor, widths, header, {
        bold: () => true,
        fill: true,
        rules: true,
        size: options.size,
      });
    const bold = (column: number): boolean => options.boldFirst && column === 0;
    const wrapped = rows.map((row) => wrap(row, bold));
    if (options.header) {
      // Keep the header with the first row.
      const first = wrapped[0];
      const firstHeight = first
        ? Math.max(1, ...first.map((c) => c.length)) *
            lineHeight(options.size) +
          2 * PAD
        : 0;
      const headerHeight =
        Math.max(1, ...header.map((c) => c.length)) * lineHeight(options.size) +
        2 * PAD;
      if (cursor.room < headerHeight + firstHeight) cursor.newPage();
      drawHeader();
    }
    for (const cells of wrapped) {
      const height =
        Math.max(1, ...cells.map((c) => c.length)) * lineHeight(options.size) +
        2 * PAD;
      if (options.header && height > cursor.room && height <= TOP - BOTTOM) {
        cursor.newPage();
        drawHeader();
      }
      Layout.row(cursor, widths, cells, {
        bold,
        fill: false,
        rules: options.rules,
        size: options.size,
      });
    }
  }
}
