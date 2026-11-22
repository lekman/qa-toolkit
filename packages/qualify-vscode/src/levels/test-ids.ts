import type { QualificationLevel } from "./types";

/** The ID pattern of section 4 of the qualify specification. */
const PATTERN = /^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$/;

/** Rules for qualification test IDs. */
export class TestIds {
  /** The pattern every qualification test ID matches. */
  static readonly PATTERN = PATTERN;

  /**
   * What is wrong with an ID declared at a level, or an empty list when it
   * is valid.
   */
  static problems(id: string, level: QualificationLevel): string[] {
    const problems: string[] = [];
    if (!PATTERN.test(id)) {
      problems.push(`the ID ${id} does not match ${PATTERN.source}`);
    }
    if (id.slice(0, 3) !== `${level}-`) {
      problems.push(
        `the ID must start with ${level}-, the level it is declared at`,
      );
    }
    return problems;
  }
}
