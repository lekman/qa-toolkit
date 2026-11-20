import type { PDFFont } from "pdf-lib";

import { PDFDocument, rgb } from "pdf-lib";

import type { ITextMetrics } from "./interfaces";
import type { Block, ReportDocument, ReportFonts } from "./types";

import { Layout, PAGE } from "./layout";
import { ReportText } from "./report-text";
import { SubsetFix } from "./subset-fix";

const FOOTER_SIZE = 7.5;

/** Metrics over the embedded fonts. */
const metricsOf = (regular: PDFFont, bold: PDFFont): ITextMetrics => {
  const sets = {
    regular: new Set(regular.getCharacterSet()),
    bold: new Set(bold.getCharacterSet()),
  };
  return {
    canDraw: (code, isBold) => (isBold ? sets.bold : sets.regular).has(code),
    width: (text, size, isBold) =>
      (isBold ? bold : regular).widthOfTextAtSize(text, size),
  };
};

/** Replace what the font cannot draw in every text of every block. */
const drawableBlocks = (
  blocks: readonly Block[],
  metrics: ITextMetrics,
): Block[] => {
  // Both weights cover the same characters; a character either can draw is kept
  // only if both can, so a bold cell never falls back differently.
  const can = (code: number): boolean =>
    metrics.canDraw(code, false) && metrics.canDraw(code, true);
  const t = (text: string): string => ReportText.drawable(text, can);
  return blocks.map((block): Block => {
    switch (block.kind) {
      case "fields":
        return {
          ...block,
          rows: block.rows.map(([a, b]): [string, string] => [t(a), t(b)]),
        };
      case "heading":
      case "paragraph":
      case "title":
        return { ...block, text: t(block.text) };
      case "list":
        return { ...block, items: block.items.map(t) };
      case "signatures":
        return { ...block, roles: block.roles.map(t) };
      case "table":
        return {
          ...block,
          columns: block.columns.map((c) => ({ ...c, header: t(c.header) })),
          rows: block.rows.map((row) => row.map(t)),
        };
      case "pageBreak":
        return block;
    }
  });
};

/** Renders a report document to PDF bytes with pdf-lib, in memory. */
export class PdfRenderer {
  /**
   * Lay out and draw the document. The fonts are embedded as subsets, so the
   * PDF carries only the glyphs it uses.
   */
  static async render(
    document: ReportDocument,
    fonts: ReportFonts,
  ): Promise<Uint8Array> {
    const pdf = await PDFDocument.create({ updateMetadata: false });
    pdf.registerFontkit(SubsetFix.fontkit());
    const regular = await pdf.embedFont(fonts.regular, { subset: true });
    const bold = await pdf.embedFont(fonts.bold, { subset: true });
    const metrics = metricsOf(regular, bold);

    const pages = Layout.paginate(
      drawableBlocks(document.blocks, metrics),
      metrics,
    );
    const footer = (n: number): string =>
      ReportText.drawable(
        `${document.footer.documentId}   Page ${n} of ${pages.length}   sha256 ${document.footer.digest}`,
        (code) => metrics.canDraw(code, false),
      );

    pages.forEach((ops, index) => {
      const page = pdf.addPage([PAGE.width, PAGE.height]);
      for (const op of ops) {
        if (op.kind === "text") {
          page.drawText(op.text, {
            x: op.x,
            y: op.y,
            size: op.size,
            font: op.bold ? bold : regular,
          });
        } else if (op.kind === "fill") {
          page.drawRectangle({
            x: op.x,
            y: op.y,
            width: op.width,
            height: op.height,
            color: rgb(0.92, 0.92, 0.92),
          });
        } else {
          page.drawLine({
            start: { x: op.x1, y: op.y1 },
            end: { x: op.x2, y: op.y2 },
            thickness: op.thickness,
            color: rgb(0.6, 0.6, 0.6),
          });
        }
      }
      const text = footer(index + 1);
      page.drawText(text, {
        x:
          PAGE.width -
          PAGE.margin -
          regular.widthOfTextAtSize(text, FOOTER_SIZE),
        y: PAGE.margin / 2,
        size: FOOTER_SIZE,
        font: regular,
        color: rgb(0.35, 0.35, 0.35),
      });
    });

    const { metadata } = document;
    pdf.setTitle(metadata.title);
    pdf.setSubject(metadata.subject);
    pdf.setKeywords([metadata.keywords]);
    pdf.setProducer(metadata.producer);
    pdf.setCreator(metadata.producer);
    pdf.setCreationDate(metadata.creationDate);
    pdf.setModificationDate(metadata.creationDate);
    return pdf.save();
  }
}
