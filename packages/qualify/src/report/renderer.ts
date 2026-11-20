import type { PDFFont, PDFImage } from "pdf-lib";

import { PDFDocument, rgb } from "pdf-lib";

import type { ColourName, FontSlot, Theme } from "../theme";
import type { ITextMetrics } from "./interfaces";
import type { Geometry, Page, ReportDocument } from "./types";

import { Template } from "../theme";
import { Layout } from "./layout";
import { SubsetFix } from "./subset-fix";

const MM = 72 / 25.4;
const SIZES = { A4: [595.28, 841.89], Letter: [612, 792] } as const;
const SLOTS: readonly FontSlot[] = ["body", "bodyBold", "heading", "mono"];

const colour = (hex: string): ReturnType<typeof rgb> =>
  rgb(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  );

/** Renders a report document with a theme to PDF bytes, with pdf-lib, in memory. */
export class PdfRenderer {
  /** The page size and margin a theme asks for, in points. */
  static geometry(theme: Theme): Geometry {
    const [width, height] = SIZES[theme.spec.page.size];
    return { width, height, margin: theme.spec.page.marginMm * MM };
  }

  /**
   * Lay out and draw the document: the cover without header or footer, then
   * the content pages with both. Pages count from the cover. The fonts are
   * embedded as subsets, so the PDF carries only the glyphs it uses.
   */
  static async render(
    document: ReportDocument,
    theme: Theme,
  ): Promise<Uint8Array> {
    const pdf = await PDFDocument.create({ updateMetadata: false });
    pdf.registerFontkit(SubsetFix.fontkit());

    const embedded = new Map<Uint8Array, PDFFont>();
    const fonts = {} as Record<FontSlot, PDFFont>;
    for (const slot of SLOTS) {
      const bytes = theme.fonts[slot];
      let font = embedded.get(bytes);
      if (font === undefined) {
        font = await pdf.embedFont(bytes, { subset: true });
        embedded.set(bytes, font);
      }
      fonts[slot] = font;
    }
    const sets = new Map<PDFFont, Set<number>>(
      [...embedded.values()].map((font) => [
        font,
        new Set(font.getCharacterSet()),
      ]),
    );
    const metrics: ITextMetrics = {
      canDraw: (code, slot) => (sets.get(fonts[slot]) as Set<number>).has(code),
      width: (text, size, slot) => fonts[slot].widthOfTextAtSize(text, size),
    };

    let logo: null | PDFImage = null;
    if (theme.logo !== null) {
      logo =
        theme.logo.format === "png"
          ? await pdf.embedPng(theme.logo.bytes)
          : await pdf.embedJpg(theme.logo.bytes);
    }
    const g = PdfRenderer.geometry(theme);
    const logoHeight = theme.spec.brand.logoHeightMm * MM;
    const cover = Layout.cover(
      document.cover,
      logo === null
        ? null
        : {
            height: logoHeight,
            width: (logoHeight * logo.width) / logo.height,
          },
      metrics,
      g,
    );
    const content = Layout.paginate(document.blocks, metrics, g);
    const pages = [cover, ...content];
    const total = String(pages.length);

    const palette = Object.fromEntries(
      Object.entries(theme.spec.colours).map(([name, hex]) => [
        name,
        colour(hex),
      ]),
    ) as Record<ColourName, ReturnType<typeof rgb>>;

    pages.forEach((ops, index) => {
      const page = pdf.addPage([g.width, g.height]);
      let all: Page = ops;
      if (index > 0) {
        const values = {
          ...document.tokens,
          page: String(index + 1),
          pages: total,
        };
        all = [
          ...ops,
          ...Layout.chrome(
            Template.render(document.header, values),
            document.classification,
            Template.render(document.footer, values),
            metrics,
            g,
          ),
        ];
      }
      for (const op of Layout.drawOrder(all)) {
        switch (op.kind) {
          case "text":
            page.drawText(op.text, {
              x: op.x,
              y: op.y,
              size: op.size,
              font: fonts[op.font],
              color: palette[op.colour],
            });
            break;
          case "fill":
            page.drawRectangle({
              x: op.x,
              y: op.y,
              width: op.width,
              height: op.height,
              color: palette[op.colour],
            });
            break;
          case "line":
            page.drawLine({
              start: { x: op.x1, y: op.y1 },
              end: { x: op.x2, y: op.y2 },
              thickness: op.thickness,
              color: palette[op.colour],
            });
            break;
          case "image":
            if (logo !== null)
              page.drawImage(logo, {
                x: op.x,
                y: op.y,
                width: op.width,
                height: op.height,
              });
            break;
        }
      }
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
