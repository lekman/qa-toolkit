/** Colour names a theme defines, section 9.3. */
export type ColourName =
  | "accent"
  | "heading"
  | "muted"
  | "rule"
  | "tableHeader"
  | "tableHeaderText"
  | "tableStripe"
  | "text"
  | "title";

/** The four font slots of a theme. */
export type FontSlot = "body" | "bodyBold" | "heading" | "mono";

/** Rows the cover's metadata block can hold. */
export type CoverField =
  | "classification"
  | "commit"
  | "date"
  | "documentId"
  | "environment"
  | "tests"
  | "verdict"
  | "version";

/** Text templates of a theme. */
export interface ThemeTexts {
  classification: string;
  footer: string;
  header: string;
  subtitle: string;
  title: string;
}

/** `theme.json`, as `report-theme.schema.json` defines it. */
export interface ThemeFile {
  brand: { logo: null | string; logoHeightMm: number; name: null | string };
  colours: Record<ColourName, string>;
  cover: { fields: CoverField[] };
  fonts: Record<FontSlot, string>;
  name: string;
  page: { marginMm: number; size: "A4" | "Letter" };
  schemaVersion: 1;
  signatures: string[];
  texts: ThemeTexts;
}

/** A theme with its files read, ready to draw with. */
export interface Theme {
  /** The logo bytes and their format, or `null`. */
  logo: null | { bytes: Uint8Array; format: "jpeg" | "png" };
  /** Font bytes per slot. Slots naming the same file share one array. */
  fonts: Record<FontSlot, Uint8Array>;
  /** The parsed theme file. */
  spec: ThemeFile;
}

/** The values tokens stand for, section 9.3. */
export interface TokenValues {
  classification: string;
  date: string;
  documentId: string;
  environment: string;
  levels: string;
  runId: string;
  sha12: string;
  title: string;
  verdict: string;
  version: string;
}
