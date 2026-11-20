import type { RunFile } from "../evidence";
import type { TraceFile } from "../trace";

/** One column of a table: its header and its share of the content width. */
export interface Column {
  header: string;
  /** Fraction of the content width; the columns of a table add up to 1. */
  width: number;
}

/** A piece of report content, laid out in order. */
export type Block =
  | { columns: Column[]; kind: "table"; rows: string[][] }
  | { items: string[]; kind: "list" }
  | { kind: "fields"; rows: [string, string][] }
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "pageBreak" }
  | { kind: "paragraph"; text: string }
  | { kind: "signatures"; roles: string[] }
  | { kind: "title"; text: string };

/** The PDF's document information. */
export interface ReportMetadata {
  creationDate: Date;
  keywords: string;
  producer: string;
  subject: string;
  title: string;
}

/** Everything the renderer needs: content, metadata and the footer text. */
export interface ReportDocument {
  blocks: Block[];
  /** Footer parts: document ID and the first 12 hex digits of the digest. */
  footer: { digest: string; documentId: string };
  metadata: ReportMetadata;
}

/** What the caller asked for, after defaults. */
export interface ReportOptions {
  documentId?: string;
  /** The generation time. */
  generatedAt: Date;
  /** Signature roles, or `null` for no signature block. */
  signatures: null | string[];
  title?: string;
}

/** The bundled font files. */
export interface ReportFonts {
  bold: Uint8Array;
  regular: Uint8Array;
}

/** A drawing instruction on one page, in points from the bottom left. */
export type DrawOp =
  | {
      bold: boolean;
      kind: "text";
      size: number;
      text: string;
      x: number;
      y: number;
    }
  | { height: number; kind: "fill"; width: number; x: number; y: number }
  | {
      kind: "line";
      thickness: number;
      x1: number;
      x2: number;
      y1: number;
      y2: number;
    };

/** One laid-out page. */
export type Page = DrawOp[];

/** What the report shows about a run. */
export interface ReportInput {
  /** SHA-256 of the run file exactly as read. */
  digest: string;
  options: ReportOptions;
  run: RunFile;
  /** The name and version of the tool writing the report. */
  tool: { name: string; version: string };
  /** The trace of this run, with the protocol and map applied. */
  trace: TraceFile;
}
