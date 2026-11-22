import Ajv2020 from "ajv/dist/2020";
import { parse } from "yaml";

import type {
  ParsedTestSets,
  ResultFormat,
  SetFilter,
  SetLevel,
  TestSet,
  TestSetFile,
} from "./types";

import schema from "../../schema/test-sets.schema.json";

const QUALIFICATION: readonly SetLevel[] = ["IQ", "OQ", "PQ", "IU"];
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
  schema,
);

/** Turns a glob of folders, with `*` and `**`, into a regular expression. */
const folderGlob = (glob: string): RegExp => {
  let out = "";
  const g = TestSets.normalise(glob);
  for (let i = 0; i < g.length; i++) {
    const c = g[i] as string;
    if (g.startsWith("**", i)) {
      out += ".*";
      i++;
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^$(){}|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
};

/**
 * Reads `qa.yaml`, the file of test sets, and answers which sets apply to a
 * package folder.
 */
export class TestSets {
  /** The file name, at the repository root. */
  static readonly FILE = "qa.yaml";

  /** The JSON Schema of the file. */
  static readonly SCHEMA: object = schema;

  /** Whether a set covers a package folder, given relative to the repository root. */
  static covers(set: TestSet, folder: string): boolean {
    const path = TestSets.normalise(folder);
    return set.paths.some((p) => folderGlob(p).test(path));
  }

  /** Every set that covers a package folder, in file order. */
  static forFolder(file: TestSetFile, folder: string): TestSet[] {
    return file.sets.filter((s) => TestSets.covers(s, folder));
  }

  /** Whether a level is one of the qualification levels, whose results are qualify evidence. */
  static isQualification(level: SetLevel): boolean {
    return QUALIFICATION.includes(level);
  }

  /** A relative folder with `/`, without `./` or a trailing `/`; `.` for the root. */
  static normalise(path: string): string {
    let p = path.replace(/\\/g, "/");
    while (p.startsWith("./")) p = p.slice(2);
    while (p.endsWith("/")) p = p.slice(0, -1);
    return p.length === 0 ? "." : p;
  }

  /**
   * The sets in the file's text, checked against the schema, with set names
   * unique. Text that is not YAML is a problem, never an exception.
   */
  static parse(text: string): ParsedTestSets {
    let doc: unknown;
    try {
      doc = parse(text);
    } catch (error) {
      return { problems: [`not YAML: ${(error as Error).message}`] };
    }
    if (!validate(doc)) {
      return {
        problems: (validate.errors ?? []).map(
          (e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`,
        ),
      };
    }
    const file = doc as unknown as TestSetFile;
    const seen = new Set<string>();
    const problems: string[] = [];
    file.sets.forEach((set, index) => {
      if (seen.has(set.name)) {
        problems.push(
          `/sets/${index}/name ${set.name} is used by an earlier set`,
        );
      }
      seen.add(set.name);
    });
    return problems.length > 0 ? { problems } : { file, problems };
  }

  /** The result format of a set: qualify evidence for a qualification level, JUnit XML otherwise. */
  static resultFormat(set: TestSet): ResultFormat {
    return TestSets.isQualification(set.level)
      ? "qualify-evidence"
      : "junit-xml";
  }

  /** The sets a filter selects, in file order. Unknown names are returned as problems. */
  static select(
    file: TestSetFile,
    filter: SetFilter,
  ): { problems: string[]; sets: TestSet[] } {
    const names = filter.names ?? [];
    const known = new Set(file.sets.map((s) => s.name));
    const problems = names
      .filter((n) => !known.has(n))
      .map((n) => `no set is named ${n}`);
    const sets = file.sets.filter(
      (s) =>
        (names.length === 0 || names.includes(s.name)) &&
        (filter.levels === undefined ||
          filter.levels.length === 0 ||
          filter.levels.includes(s.level)),
    );
    return { problems, sets };
  }
}
