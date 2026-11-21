import type { JsonValue } from "../values";

import { Values } from "../values";

const CUT = 200;

/** How values are written in the report, section 9.2. */
export class ReportText {
  /** Shown for a value that is missing. */
  static readonly MISSING = "-";

  /**
   * Replace every character the font cannot draw with `?`. Tabs become
   * spaces; line breaks stay, for the layout to split on.
   */
  static drawable(
    text: string,
    canDraw: (codePoint: number) => boolean,
  ): string {
    let result = "";
    for (const char of text.replace(/\r\n?/g, "\n").replace(/\t/g, " ")) {
      const code = char.codePointAt(0) as number;
      if (char === "\n") result += char;
      else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) result += "?";
      else result += canDraw(code) ? char : "?";
    }
    return result;
  }

  /** A value as compact JSON, cut after 200 code points. */
  static json(value: JsonValue): string {
    const text = Values.key(value);
    const chars = [...text];
    if (chars.length <= CUT) return text;
    return `${chars.slice(0, CUT).join("")}… (${chars.length - CUT} more characters)`;
  }

  /** A list, or `-` when it is empty. */
  static list(values: readonly string[]): string {
    return values.length === 0 ? ReportText.MISSING : values.join(", ");
  }

  /** A timestamp as `YYYY-MM-DD HH:MM:SS UTC`. */
  static time(value: Date | string): string {
    const iso =
      typeof value === "string"
        ? new Date(value).toISOString()
        : value.toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
  }

  /** The verdict in words. */
  static verdict(verdict: "fail" | "incomplete" | "pass"): string {
    return { pass: "Passed", fail: "Failed", incomplete: "Incomplete" }[
      verdict
    ];
  }
}
