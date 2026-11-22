import type { RunFile } from "../evidence";
import type { ColourName, FontSlot, ThemeFile, TokenValues } from "../theme";
import type { TraceFile } from "../trace";

/** One column of a table: its header, its share of the text width, and its font. */
export interface Column {
  header: string;
  /** Draw the column's cells in the mono font. */
  mono?: boolean;
  /** Fraction of the text width; the columns of a table add up to 1. */
  width: number;
}

/** One label and value of a field list. */
export interface Field {
  label: string;
  /** Draw the value in the mono font. */
  mono?: boolean;
  value: string;
}

/** A piece of report content after the cover, laid out in order. */
export type Block =
  | { columns: Column[]; kind: "table"; rows: string[][] }
  | { fields: Field[]; kind: "fields" }
  | {
      /** The line under the image. */
      caption: string;
      /** Index into the document's images. */
      image: number;
      kind: "image";
      /** The line drawn instead when the image cannot be read. */
      unreadable: string;
    }
  | { items: string[]; kind: "list" }
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "signatures"; roles: string[] };

/** An image format the report draws. */
export type ImageFormat = "jpeg" | "png";

/** A width and a height: pixels for an image file, points on a page. */
export interface ImageSize {
  height: number;
  width: number;
}

/** The bytes of an image attachment, as the evidence holds them. */
export interface ImageSource {
  bytes: Uint8Array;
  format: ImageFormat;
}

/** What the cover page shows, section 9.1. */
export interface Cover {
  brandName: null | string;
  fields: Field[];
  subtitle: string;
  title: string;
}

/** The PDF's document information. */
export interface ReportMetadata {
  creationDate: Date;
  keywords: string;
  producer: string;
  subject: string;
  title: string;
}

/** Everything the renderer needs: cover, content, page texts and metadata. */
export interface ReportDocument {
  blocks: Block[];
  /** The classification, drawn on the right of every header. */
  classification: string;
  cover: Cover;
  /** The footer template; `{page}` and `{pages}` are filled per page. */
  footer: string;
  /** The header template; `{page}` and `{pages}` are filled per page. */
  header: string;
  /** The image attachments, in the order the image blocks refer to them. */
  images: ImageSource[];
  metadata: ReportMetadata;
  /** Token values for the header and footer templates. */
  tokens: TokenValues;
}

/** What the caller asked for. A value left out comes from the theme. */
export interface ReportOptions {
  classification?: string;
  documentId?: string;
  /** The generation time. */
  generatedAt: Date;
  /** Signature roles, `null` for no signature block, or left out for the theme's. */
  signatures?: null | string[];
  subtitle?: string;
  title?: string;
}

/** What the report shows about a run. */
export interface ReportInput {
  /** SHA-256 of the run file exactly as read. */
  digest: string;
  options: ReportOptions;
  run: RunFile;
  /** The theme file; its texts are the templates. */
  theme: ThemeFile;
  /** The name and version of the tool writing the report. */
  tool: { name: string; version: string };
  /** The trace of this run, with the protocol and map applied. */
  trace: TraceFile;
}

/** Page size and margin in points. */
export interface Geometry {
  height: number;
  margin: number;
  width: number;
}

/** A drawing instruction on one page, in points from the bottom left. */
export type DrawOp =
  | {
      colour: ColourName;
      font: FontSlot;
      kind: "text";
      size: number;
      text: string;
      x: number;
      y: number;
    }
  | {
      colour: ColourName;
      kind: "line";
      thickness: number;
      x1: number;
      x2: number;
      y1: number;
      y2: number;
    }
  | {
      colour: ColourName;
      height: number;
      kind: "fill";
      width: number;
      x: number;
      y: number;
    }
  | {
      height: number;
      /** Index into the document's images; absent for the theme's logo. */
      image?: number;
      kind: "image";
      width: number;
      x: number;
      y: number;
    };

/** One laid-out page. */
export type Page = DrawOp[];
