/** Measures text in the report's fonts. Implemented over the embedded fonts. */
export interface ITextMetrics {
  /** Whether the font can draw a code point. */
  canDraw(codePoint: number, bold: boolean): boolean;
  /** Width in points of text at a size. */
  width(text: string, size: number, bold: boolean): number;
}
