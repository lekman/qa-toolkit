import { describe, expect, test } from "bun:test";

import { ImportError, Xml } from "../../src/junit-import";

describe("Xml.parse", () => {
  test("reads elements, attributes, text, CDATA, comments and entities", () => {
    const root = Xml.parse(
      "\uFEFF" +
        `<?xml version="1.0"?>
<!-- a comment -->
<a x="1 &amp; 2" y='&#x41;&#66;'>
  text &lt;here&gt;<b/><![CDATA[<raw> & more]]><?pi data?>
</a>
<!-- after -->
`,
      "t.xml",
    );
    expect(root.name).toBe("a");
    expect(root.attributes).toEqual({ x: "1 & 2", y: "AB" });
    expect(root.children).toEqual([
      "\n  text <here>",
      { name: "b", attributes: {}, children: [] },
      "<raw> & more",
      "\n",
    ]);
  });

  test("a self-closing root element", () => {
    expect(Xml.parse('<testsuite name="x" />', "t.xml")).toEqual({
      name: "testsuite",
      attributes: { name: "x" },
      children: [],
    });
  });

  test("decodes the named entities and refuses unknown ones", () => {
    expect(Xml.decode("&quot;&apos;&lt;&gt;&amp;", "t")).toBe("\"'<>&");
    expect(() => Xml.decode("&nbsp;", "t")).toThrow("unknown entity &nbsp;");
    expect(() => Xml.decode("a & b", "t")).toThrow("a bare & in text");
    expect(() => Xml.decode("&#x110000;", "t")).toThrow("is not a character");
  });

  test.each([
    ['<!DOCTYPE a [<!ENTITY x "y">]><a/>', "document type declaration"],
    ["<a><b></a>", "unexpected closing tag </a>"],
    ["<a>", "<a> is not closed"],
    ["<a/><b/>", "a second root element"],
    ["<a/>text", "text outside the root element"],
    ["text", "text outside the root element"],
    ["", "no root element"],
    ['<a x="1"y="2"/>', "a malformed attribute in <a>"],
    ["<a x=1/>", "a malformed attribute in <a>"],
    ["< a/>", "a tag without a name"],
    ["<a><!-- open", "no closing -->"],
  ])("%p is refused", (text, message) => {
    expect(() => Xml.parse(text, "t.xml")).toThrow(ImportError);
    expect(() => Xml.parse(text, "t.xml")).toThrow(message);
  });

  test("an error names the file and the line", () => {
    expect(() => Xml.parse("<a>\n\n</b>", "r.xml")).toThrow(
      "r.xml:3: unexpected closing tag </b>",
    );
  });
});
