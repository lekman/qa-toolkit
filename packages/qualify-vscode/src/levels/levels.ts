import type { Level, LevelInfo, QualificationLevel } from "./types";

const INFO: readonly LevelInfo[] = [
  { level: "IQ", description: "Installation Qualification", order: 0 },
  { level: "OQ", description: "Operational Qualification", order: 1 },
  { level: "PQ", description: "Performance Qualification", order: 2 },
  { level: "IU", description: "Intended Use", order: 3 },
  { level: "integration", description: "Integration tests", order: 4 },
  { level: "story", description: "Story tests", order: 5 },
  { level: "unit", description: "Unit tests", order: 6 },
];

const QUALIFICATION: readonly string[] = ["IQ", "OQ", "PQ", "IU"];

/** The levels of the tree: their order, descriptions and which are qualification levels. */
export class Levels {
  /** Every level, in tree order. */
  static readonly ALL: readonly LevelInfo[] = INFO;

  /** How a level is shown. */
  static info(level: Level): LevelInfo {
    return INFO.find((i) => i.level === level) as LevelInfo;
  }

  /** Whether a string names one of the four qualification levels. */
  static isQualification(value: string): value is QualificationLevel {
    return QUALIFICATION.includes(value);
  }

  /** The level an ID's prefix names, such as `OQ` for `OQ-EXPORT-003`, if any. */
  static ofId(id: string): QualificationLevel | undefined {
    const prefix = id.slice(0, 2).toUpperCase();
    return id[2] === "-" && Levels.isQualification(prefix) ? prefix : undefined;
  }
}
