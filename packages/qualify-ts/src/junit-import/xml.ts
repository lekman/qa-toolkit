import type { XmlElement } from "./types";

import { ImportError } from "./errors";

const NAME = /[A-Za-z_:][\w:.-]*/y;
const SPACE = /\s*/y;
const ATTRIBUTE = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/y;
const NAMED: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

/** Match a sticky expression at a position, without copying the text. */
const match = (
  pattern: RegExp,
  text: string,
  index: number,
): null | RegExpExecArray => {
  pattern.lastIndex = index;
  return pattern.exec(text);
};

/**
 * A small XML reader for JUnit reports: elements, attributes, text, CDATA,
 * comments and processing instructions. A document type declaration is
 * refused, so no entity is ever expanded. Pure: it reads a string.
 */
export class Xml {
  /** Replace the five named entities and numeric character references. */
  static decode(text: string, where: string): string {
    return text.replace(
      /&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);|&/g,
      (all, ref) => {
        if (ref === undefined)
          throw new ImportError(`${where}: a bare & in text`);
        const name = ref as string;
        if (name.startsWith("#")) {
          const code = name.startsWith("#x")
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
          if (code > 0x10ffff)
            throw new ImportError(`${where}: ${all} is not a character`);
          return String.fromCodePoint(code);
        }
        const value = NAMED[name];
        if (value === undefined)
          throw new ImportError(`${where}: unknown entity ${all}`);
        return value;
      },
    );
  }

  /** Parse a document and return its root element. */
  static parse(text: string, where: string): XmlElement {
    let at = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    const fail = (message: string): never => {
      const line = text.slice(0, at).split("\n").length;
      throw new ImportError(`${where}:${line}: ${message}`);
    };
    const skip = (end: string): void => {
      const close = text.indexOf(end, at);
      if (close < 0) fail(`no closing ${end}`);
      at = close + end.length;
    };
    const stack: XmlElement[] = [];
    let root: undefined | XmlElement;
    const addText = (value: string): void => {
      const parent = stack.at(-1);
      if (parent !== undefined) parent.children.push(value);
      else if (value.trim().length > 0) fail("text outside the root element");
    };

    while (at < text.length) {
      const open = text.indexOf("<", at);
      const end = open < 0 ? text.length : open;
      if (end > at) addText(Xml.decode(text.slice(at, end), where));
      if (open < 0) break;
      at = open;
      if (text.startsWith("<!--", at)) skip("-->");
      else if (text.startsWith("<![CDATA[", at)) {
        const start = at + 9;
        skip("]]>");
        addText(text.slice(start, at - 3));
      } else if (text.startsWith("<!", at)) {
        fail("a document type declaration is not accepted");
      } else if (text.startsWith("<?", at)) skip("?>");
      else if (text.startsWith("</", at)) {
        const name = match(NAME, text, at + 2)?.[0] ?? "";
        if (stack.pop()?.name !== name)
          fail(`unexpected closing tag </${name}>`);
        skip(">");
      } else {
        if (stack.length === 0 && root !== undefined)
          fail("a second root element");
        const tag = Xml.element(text, at + 1, fail, where);
        at = tag.end;
        const parent = stack.at(-1);
        if (parent === undefined) root = tag.element;
        else parent.children.push(tag.element);
        if (!tag.closed) stack.push(tag.element);
      }
    }
    if (stack.length > 0) fail(`<${stack.at(-1)?.name}> is not closed`);
    if (root === undefined) return fail("no root element");
    return root;
  }

  /**
   * Read one start tag from just after its `<`: the element, the position
   * after the tag, and whether the tag closes itself.
   */
  private static element(
    text: string,
    from: number,
    fail: (message: string) => never,
    where: string,
  ): { closed: boolean; element: XmlElement; end: number } {
    const name = match(NAME, text, from)?.[0];
    if (name === undefined) return fail("a tag without a name");
    const element: XmlElement = { name, attributes: {}, children: [] };
    let index = from + name.length;
    for (;;) {
      const space = match(SPACE, text, index)?.[0].length ?? 0;
      index += space;
      if (text.startsWith("/>", index))
        return { element, end: index + 2, closed: true };
      if (text.startsWith(">", index))
        return { element, end: index + 1, closed: false };
      const attribute = space > 0 ? match(ATTRIBUTE, text, index) : null;
      if (attribute === null) return fail(`a malformed attribute in <${name}>`);
      element.attributes[attribute[1] as string] = Xml.decode(
        attribute[3] ?? attribute[4] ?? "",
        where,
      );
      index += attribute[0].length;
    }
  }
}
