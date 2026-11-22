import type { CaseOutcome, JunitCase, JunitSummary } from "./types";

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

/** Replaces XML entities and character references. */
const decode = (text: string): string =>
  text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (whole, ref: string) => {
    if (ref.startsWith("#x"))
      return String.fromCodePoint(parseInt(ref.slice(2), 16));
    if (ref.startsWith("#"))
      return String.fromCodePoint(parseInt(ref.slice(1), 10));
    return ENTITIES[ref] ?? whole;
  });

const escape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The attributes of a start tag's text, such as `testcase name="a" time="1"`. */
const attributes = (tag: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out.set(m[1] as string, decode(m[2] ?? m[3] ?? ""));
  }
  return out;
};

/** Every element named `name`, as its start tag's text and its body; scanned without regular expressions over the whole text. */
const elements = (
  text: string,
  name: string,
): { at: number; body: string; closed: boolean; tag: string }[] => {
  const found: { at: number; body: string; closed: boolean; tag: string }[] =
    [];
  const open = `<${name}`;
  const close = `</${name}>`;
  let i = text.indexOf(open);
  while (i >= 0) {
    const after = text[i + open.length];
    const end = text.indexOf(">", i);
    if (end < 0) break;
    if (
      after !== " " &&
      after !== ">" &&
      after !== "/" &&
      after !== "\n" &&
      after !== "\t" &&
      after !== "\r"
    ) {
      i = text.indexOf(open, i + 1);
      continue;
    }
    const tag = text.slice(i + 1, end);
    if (tag.endsWith("/")) {
      found.push({ at: i, body: "", closed: true, tag: tag.slice(0, -1) });
      i = text.indexOf(open, end);
      continue;
    }
    const stop = text.indexOf(close, end);
    const bodyEnd = stop < 0 ? text.length : stop;
    found.push({
      at: i,
      body: text.slice(end + 1, bodyEnd),
      closed: false,
      tag,
    });
    i = text.indexOf(open, stop < 0 ? text.length : stop);
  }
  return found;
};

/** A number attribute, or `undefined`. */
const num = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Reads and merges JUnit XML, the report format every supported runner can
 * write, for tests that have no qualify evidence.
 */
export class JunitXml {
  /** The test cases of a report, each with the suite that holds it. */
  static cases(text: string): JunitCase[] {
    const suites = elements(text, "testsuite").map((s) => ({
      at: s.at,
      name: attributes(s.tag).get("name") ?? "",
    }));
    return elements(text, "testcase").map((c) => {
      const attrs = attributes(c.tag);
      let outcome: CaseOutcome = "pass";
      let message: string | undefined;
      for (const [kind, as] of [
        ["failure", "fail"],
        ["error", "error"],
        ["skipped", "skip"],
      ] as const) {
        const child = elements(c.body, kind)[0];
        if (child === undefined) continue;
        outcome = as;
        const text = decode(
          child.body.replace(/<!\[CDATA\[|\]\]>/g, ""),
        ).trim();
        message =
          attributes(child.tag).get("message") ??
          (text.length > 0 ? text : undefined);
        break;
      }
      const suite = suites.filter((s) => s.at < c.at).pop()?.name ?? "";
      const time = num(attrs.get("time"));
      const line = num(attrs.get("line"));
      const classname = attrs.get("classname");
      const file = attrs.get("file");
      return {
        name: attrs.get("name") ?? "",
        outcome,
        suite,
        ...(classname === undefined ? {} : { classname }),
        ...(file === undefined ? {} : { file }),
        ...(line === undefined ? {} : { line }),
        ...(message === undefined ? {} : { message }),
        ...(time === undefined ? {} : { time }),
      };
    });
  }

  /**
   * One report from several: every `<testsuite>` of each, under one
   * `<testsuites>` with the totals.
   */
  static merge(reports: readonly string[]): string {
    const suites = reports.flatMap((r) =>
      elements(r, "testsuite").map((s) =>
        s.closed ? `<${s.tag}/>` : `<${s.tag}>${s.body}</testsuite>`,
      ),
    );
    const total = JunitXml.summary(reports.flatMap((r) => JunitXml.cases(r)));
    const head = `<testsuites tests="${total.tests}" failures="${total.failures}" errors="${total.errors}" skipped="${total.skipped}" time="${total.time.toFixed(3)}">`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n${head}\n${suites.map((s) => `  ${s}`).join("\n")}\n</testsuites>\n`;
  }

  /** A suite element for a set that left no report, so the merged report still names it. */
  static missing(name: string, reason: string): string {
    return `<testsuite name="${escape(name)}" tests="1" failures="0" errors="1" skipped="0"><testcase name="${escape(name)}"><error message="${escape(reason)}"/></testcase></testsuite>`;
  }

  /** The counts over some test cases. */
  static summary(cases: readonly JunitCase[]): JunitSummary {
    return {
      errors: cases.filter((c) => c.outcome === "error").length,
      failures: cases.filter((c) => c.outcome === "fail").length,
      skipped: cases.filter((c) => c.outcome === "skip").length,
      tests: cases.length,
      time: cases.reduce((t, c) => t + (c.time ?? 0), 0),
    };
  }
}
