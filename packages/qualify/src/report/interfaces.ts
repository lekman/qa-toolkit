import type { FontSlot } from "../theme";

/** Measures text in the theme's fonts. Implemented over the embedded fonts. */
export interface ITextMetrics {
  /** Whether a font slot can draw a code point. */
  canDraw(codePoint: number, font: FontSlot): boolean;
  /** Width in points of text at a size in a font slot. */
  width(text: string, size: number, font: FontSlot): number;
}
