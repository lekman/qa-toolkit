import type { CaseFailure, CaseLevel, Outcome, TestCase } from "../evidence";
import type { JUnitReport, XmlElement } from "./types";

import { Declarations } from "../declaration";
import { Redaction } from "../redaction";
import { ImportError } from "./errors";
import { Xml } from "./xml";

/** What every step of one report's walk shares. */
interface Context {
  level: CaseLevel;
  report: JUnitReport;
  where: string;
}

/** A qualify test ID inside a longer name, not touching a letter, digit or hyphen. */
const ID_IN_NAME = new RegExp(
  `(?<![A-Za-z0-9-])${Declarations.ID_PATTERN.source.slice(1, -1)}(?![A-Za-z0-9-])`,
);
const ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const OUTCOMES: Record<string, Outcome> = {
  error: "error",
  failure: "fail",
  skipped: "skip",
};

const elements = (element: XmlElement): XmlElement[] =>
  element.children.filter((c): c is XmlElement => typeof c !== "string");

/** All text inside an element, trimmed. */
const textOf = (element: XmlElement): string =>
  element.children
    .map((c) => (typeof c === "string" ? c : textOf(c)))
    .join("")
    .trim();

/** An attribute's value, trimmed, or `undefined` when it is missing or empty. */
const attribute = (element: XmlElement, name: string): string | undefined => {
  const value = element.attributes[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

const clean = (text: string): string => Redaction.patterns(text);

/**
 * Test cases from a JUnit XML report, section 6.6. Reads the report shapes of
 * bun, vitest, pytest, Gradle, Maven Surefire and xUnit: a `testsuites` or
 * `testsuite` root, suites that may nest, and one `testcase` per test.
 */
export class JUnit {
  /** The first qualify test ID in a test name, or `undefined`. */
  static id(name: string): string | undefined {
    return ID_IN_NAME.exec(name)?.[0];
  }

  /** Parse a report. `where` names the file in error messages. */
  static read(text: string, where: string, level: CaseLevel): JUnitReport {
    const root = Xml.parse(text, where);
    const report: JUnitReport = { cases: [] };
    if (root.name === "testsuite") {
      JUnit.suite(root, [], null, { level, where, report });
    } else if (root.name === "testsuites") {
      JUnit.children(root, [], null, { level, where, report });
    } else {
      throw new ImportError(
        `${where}: the root element is <${root.name}>, not <testsuites> or <testsuite>`,
      );
    }
    return report;
  }

  /** A timestamp in ms since the epoch. One without a zone is read as UTC. */
  static timestamp(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const ms = Date.parse(ZONE.test(value) ? value : `${value}Z`);
    return Number.isNaN(ms) ? undefined : ms;
  }

  private static case(
    element: XmlElement,
    suites: readonly string[],
    file: null | string,
    context: Context,
  ): TestCase {
    const name = attribute(element, "name");
    if (name === undefined)
      throw new ImportError(`${context.where}: a <testcase> without a name`);
    const result = elements(element).find((c) =>
      Object.hasOwn(OUTCOMES, c.name),
    );
    const outcome: Outcome =
      result === undefined ? "pass" : (OUTCOMES[result.name] as Outcome);
    const classname = attribute(element, "classname");
    const ownFile = attribute(element, "file") ?? file;
    const cleanName = clean(name);
    const id = JUnit.id(cleanName);
    const record: TestCase = {
      level: context.level,
      ...(id === undefined ? {} : { id }),
      suite: clean(suites.join(" > ")),
      classname: classname === undefined ? null : clean(classname),
      name: cleanName,
      file: ownFile === null ? null : clean(ownFile),
      outcome,
      durationMs: JUnit.duration(attribute(element, "time")),
    };
    if (result !== undefined && outcome === "skip") {
      record.skipReason = clean(
        attribute(result, "message") || textOf(result) || "no reason given",
      );
    } else if (result !== undefined) {
      record.error = JUnit.failure(result);
    }
    return record;
  }

  private static children(
    element: XmlElement,
    suites: readonly string[],
    file: null | string,
    context: Context,
  ): void {
    for (const child of elements(element)) {
      if (child.name === "testsuite") JUnit.suite(child, suites, file, context);
      else if (child.name === "testcase")
        context.report.cases.push(JUnit.case(child, suites, file, context));
    }
  }

  private static duration(seconds: string | undefined): number {
    const value = Number(seconds);
    return seconds === undefined || !Number.isFinite(value) || value < 0
      ? 0
      : Math.round(value * 1000);
  }

  private static failure(element: XmlElement): CaseFailure {
    const detail = textOf(element);
    const message =
      attribute(element, "message") ?? detail.split("\n")[0]?.trim() ?? "";
    return {
      type: clean(attribute(element, "type") ?? element.name),
      message: clean(message),
      ...(detail.length > 0 ? { detail: clean(detail) } : {}),
    };
  }

  private static suite(
    element: XmlElement,
    suites: readonly string[],
    file: null | string,
    context: Context,
  ): void {
    const start = JUnit.timestamp(attribute(element, "timestamp"));
    if (start !== undefined) {
      const end = start + JUnit.duration(attribute(element, "time"));
      const { report } = context;
      report.startedAt = Math.min(report.startedAt ?? start, start);
      report.endedAt = Math.max(report.endedAt ?? end, end);
    }
    const name = attribute(element, "name");
    JUnit.children(
      element,
      name === undefined ? suites : [...suites, name],
      attribute(element, "file") ?? file,
      context,
    );
  }
}
