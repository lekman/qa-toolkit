import fontkit from "@pdf-lib/fontkit";

/** The parts of fontkit's TrueType subset this fix touches. */
interface TrueTypeSubset {
  _addGlyph(gid: number): number;
  glyf?: Uint8Array[];
  offset: number;
}

/** The parts of a fontkit font this fix touches. */
interface FontkitFont {
  createSubset(): TrueTypeSubset;
}

/**
 * A fontkit for pdf-lib whose TrueType subsets keep every glyph record at an
 * even length.
 *
 * @pdf-lib/fontkit 1.1.1 copies each glyph record as it is, then writes the
 * subset's `loca` table in the short format, which stores offset / 2, when
 * the subset is small. Noto Sans has 1323 records of odd length, so every
 * glyph after one of them is read from the wrong place and drawn wrong or not
 * at all. Text extraction still works, which is why only a rendered page
 * shows it. Padding a record with one zero byte is valid TrueType.
 */
export class SubsetFix {
  /** The fontkit to register with `PDFDocument.registerFontkit`. */
  static fontkit(): typeof fontkit {
    return {
      ...fontkit,
      create: (buffer: Uint8Array, postscriptName?: string) => {
        const font = fontkit.create(
          buffer,
          postscriptName,
        ) as unknown as FontkitFont;
        const createSubset = font.createSubset.bind(font);
        font.createSubset = () => SubsetFix.pad(createSubset());
        return font as never;
      },
    };
  }

  /** Pad each glyph record the subset adds to an even length. */
  static pad(subset: TrueTypeSubset): TrueTypeSubset {
    if (typeof subset._addGlyph !== "function") return subset;
    const add = subset._addGlyph.bind(subset);
    subset._addGlyph = (gid: number): number => {
      const index = add(gid);
      const records = subset.glyf;
      const record = records?.[index];
      if (
        records !== undefined &&
        record !== undefined &&
        record.length % 2 === 1
      ) {
        // fontkit's bundle carries its own Buffer class and accepts only it,
        // so the padded copy is made with the record's own constructor.
        const Kind = record.constructor as unknown as {
          alloc(size: number): Uint8Array;
        };
        const padded = Kind.alloc(record.length + 1);
        padded.set(record);
        records[index] = padded;
        subset.offset += 1;
      }
      return index;
    };
    return subset;
  }
}
