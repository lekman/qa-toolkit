/**
 * Text extraction from a PDF with pdfjs-dist, for the report scenario and the
 * unit tests. Not part of the package: pdfjs-dist is a dev dependency.
 *
 * Text on one baseline of a page becomes one line, left to right. Runs of
 * whitespace collapse to one space and empty lines are dropped, as scenario
 * 21 describes.
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** The extracted text and document information of a PDF. */
export interface PdfText {
  info: Record<string, unknown>;
  /** Every page's lines, in page order. */
  lines: string[];
  pageLines: string[][];
  pages: number;
}

interface Item {
  str: string;
  transform: number[];
}

/** Extract the text lines, the page count and the document information. */
export async function extractPdf(bytes: Uint8Array): Promise<PdfText> {
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const pdf = await task.promise;
  const pageLines: string[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const lines: string[] = [];
    pageLines.push(lines);
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const rows = new Map<number, Item[]>();
    for (const item of content.items as Item[]) {
      if (typeof item.str !== "string") continue;
      const y = Math.round((item.transform[5] as number) * 10) / 10;
      rows.set(y, [...(rows.get(y) ?? []), item]);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const line = (rows.get(y) as Item[])
        .sort((a, b) => (a.transform[4] as number) - (b.transform[4] as number))
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line.length > 0) lines.push(line);
    }
  }
  const { info } = await pdf.getMetadata();
  const pages = pdf.numPages;
  await task.destroy();
  return {
    info: info as Record<string, unknown>,
    lines: pageLines.flat(),
    pageLines,
    pages,
  };
}

/**
 * Check that every outline line appears in the text, in order: each is found
 * inside a line at or after the line where the previous one was found.
 * Returns the first outline line that is missing, or `undefined`.
 */
export function missingFromOutline(
  lines: readonly string[],
  outline: readonly string[],
): string | undefined {
  let at = 0;
  let offset = 0;
  for (const wanted of outline) {
    let found = false;
    for (; at < lines.length; at++, offset = 0) {
      const index = (lines[at] as string).indexOf(wanted, offset);
      if (index >= 0) {
        offset = index + wanted.length;
        found = true;
        break;
      }
    }
    if (!found) return wanted;
  }
  return undefined;
}
