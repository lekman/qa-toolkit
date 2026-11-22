import type { Argument, Syntax } from "./types";

const OPENERS: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
};
const ESCAPES: Readonly<Record<string, string>> = { n: "\n", r: "\r", t: "\t" };
/** A string literal in masked text: an optional prefix, then the quotes. */
const LITERAL = /(@\$|\$@|@|\$|[rRbBuUfF]{1,2})?("""|'''|"|'|`)/y;
const KEY =
  /^\s*(?:([A-Za-z_$][\w$]*)|`([^`]+)`|(["'])\s*\3)\s*(?::(?!:)|=(?![=>]))/;
/** Characters after which a `/` starts a regular expression, not a division. */
const BEFORE_REGEX = /[(,=:[!&|?{};+\-*%<>~^]$|^$|\breturn$/;

/** Replaces every character except line breaks with spaces. */
const blank = (s: string): string => s.replace(/[^\n]/g, " ");

/**
 * Reads source text without parsing it: masks comments and the inside of
 * strings, so a search over the masked text only finds code, then reads
 * literal values back from the original text at the same offsets.
 */
export class SourceScanner {
  /** The offset of the bracket that closes the one at `open`, or the end of the text. */
  static close(masked: string, open: number): number {
    const stack: string[] = [];
    for (let i = open; i < masked.length; i++) {
      const c = masked[i] as string;
      const closer = OPENERS[c];
      if (closer !== undefined) stack.push(closer);
      else if (c === stack[stack.length - 1]) {
        stack.pop();
        if (stack.length === 0) return i;
      }
    }
    return masked.length;
  }

  /** The last identifier of a value such as `Risk.HIGH`, lower-cased with `_` as `-`. */
  static identifier(text: string): string | undefined {
    const match = /([A-Za-z_]\w*)\s*$/.exec(text);
    if (!match) return undefined;
    const word = (match[1] as string).replace(/_/g, "-");
    return word === "ReadWrite" ? "read-write" : word.toLowerCase();
  }

  /** The 1-based line of an offset. */
  static line(text: string, offset: number): number {
    let line = 1;
    for (let i = 0; i < offset && i < text.length; i++) {
      if (text[i] === "\n") line++;
    }
    return line;
  }

  /**
   * The value of an argument made only of string literals, joined by `+` or
   * by white space; `undefined` for any other expression.
   */
  static literal(
    text: string,
    masked: string,
    arg: Argument,
  ): string | undefined {
    const end = arg.start + arg.text.length;
    const rest = masked.slice(arg.start, end);
    if (
      !/^(?:\s*\+?\s*(?:@\$|\$@|@|\$|[rRbBuUfF]{0,2})("""|'''|"|'|`)\s*\1)+\s*$/.test(
        rest,
      )
    ) {
      return undefined;
    }
    const values = SourceScanner.strings(text, masked, arg.start, end);
    return values.join("");
  }

  /**
   * A copy of the text with comments and the inside of strings replaced by
   * spaces. Quotes and line breaks stay, so offsets and lines are the same.
   */
  static mask(text: string, syntax: Syntax, regex = false): string {
    let out = "";
    let i = 0;
    while (i < text.length) {
      const c = text[i] as string;
      if (text.startsWith(syntax.lineComment, i)) {
        const end = text.indexOf("\n", i);
        const stop = end < 0 ? text.length : end;
        out += blank(text.slice(i, stop));
        i = stop;
        continue;
      }
      const block = syntax.blockComment;
      if (block && text.startsWith(block[0], i)) {
        const end = text.indexOf(block[1], i + block[0].length);
        const stop = end < 0 ? text.length : end + block[1].length;
        out += blank(text.slice(i, stop));
        i = stop;
        continue;
      }
      if (syntax.verbatim && text.startsWith('@"', i)) {
        let k = i + 2;
        while (k < text.length) {
          if (text[k] === '"' && text[k + 1] === '"') k += 2;
          else if (text[k] === '"') break;
          else k++;
        }
        out += `@"${blank(text.slice(i + 2, k))}"`;
        i = k + 1;
        continue;
      }
      if (regex && c === "/" && BEFORE_REGEX.test(out.trimEnd())) {
        const k = SourceScanner.regexEnd(text, i);
        if (k > 0) {
          out += `/${blank(text.slice(i + 1, k))}/`;
          i = k + 1;
          continue;
        }
      }
      const quote = syntax.quotes.find((q) => q === c);
      if (quote === undefined) {
        out += c;
        i++;
        continue;
      }
      const delim =
        syntax.triple && text.startsWith(quote.repeat(3), i)
          ? quote.repeat(3)
          : quote;
      let k = i + delim.length;
      while (k < text.length) {
        if (syntax.escapes && text[k] === "\\") k += 2;
        else if (text.startsWith(delim, k)) break;
        else if (delim.length === 1 && quote !== "`" && text[k] === "\n") break;
        else k++;
      }
      const closed = text.startsWith(delim, k);
      out +=
        delim + blank(text.slice(i + delim.length, Math.min(k, text.length)));
      if (closed) out += delim;
      i = closed ? k + delim.length : k;
    }
    return out;
  }

  /** The key of a named argument (`key: value` or `key = value`), lower-cased. */
  static named(text: string, masked: string, arg: Argument): Argument {
    const end = arg.start + arg.text.length;
    const match = KEY.exec(masked.slice(arg.start, end));
    if (!match) return arg;
    let key = match[1] ?? match[2];
    if (key === undefined) {
      const open = arg.start + match[0].indexOf(match[3] as string);
      key = text.slice(open + 1, masked.indexOf(match[3] as string, open + 1));
    }
    const start = arg.start + match[0].length;
    const value = text.slice(start, end);
    const lead = value.length - value.trimStart().length;
    return {
      key: key.toLowerCase(),
      start: start + lead,
      text: value.trim(),
    };
  }

  /**
   * The arguments between the bracket at `open` and the one at `close`,
   * split at top-level commas.
   */
  static split(
    text: string,
    masked: string,
    open: number,
    close: number,
  ): Argument[] {
    const args: Argument[] = [];
    let depth = 0;
    let from = open + 1;
    const push = (to: number): void => {
      const raw = text.slice(from, to);
      const lead = raw.length - raw.trimStart().length;
      if (raw.trim().length > 0) {
        args.push({ start: from + lead, text: raw.trim() });
      }
    };
    for (let i = open + 1; i < close; i++) {
      const c = masked[i] as string;
      if (c in OPENERS) depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
      else if (c === "," && depth === 0) {
        push(i);
        from = i + 1;
      }
    }
    push(close);
    return args;
  }

  /** Every string literal value between two offsets, in order. */
  static strings(
    text: string,
    masked: string,
    from: number,
    to: number,
  ): string[] {
    const values: string[] = [];
    let i = from;
    while (i < to) {
      LITERAL.lastIndex = i;
      const match = LITERAL.exec(masked);
      if (
        !match ||
        match.index !== i ||
        (match[1] && i > 0 && /\w/.test(masked[i - 1] as string))
      ) {
        i++;
        continue;
      }
      const prefix = match[1] ?? "";
      const delim = match[2] as string;
      const start = i + match[0].length;
      const end = masked.indexOf(delim, start);
      if (end < 0 || end > to) break;
      const raw = text.slice(start, end);
      const verbatim = prefix.includes("@") || /[rR]/.test(prefix);
      values.push(
        verbatim
          ? raw.replace(/""/g, '"')
          : raw.replace(/\\(.)/g, (_, e: string) => ESCAPES[e] ?? e),
      );
      i = end + delim.length;
    }
    return values;
  }

  /** The offset of the `/` that ends a regular expression starting at `start`, or -1. */
  private static regexEnd(text: string, start: number): number {
    let inClass = false;
    for (let k = start + 1; k < text.length; k++) {
      const c = text[k];
      if (c === "\n") return -1;
      if (c === "\\") k++;
      else if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) return k;
    }
    return -1;
  }
}
