/** The four qualification levels of the qualify specification. */
export type QualificationLevel = "IQ" | "IU" | "OQ" | "PQ";

/**
 * A level in the tree. The qualification levels come from a test's ID; the
 * others group ordinary tests that have no qualify ID.
 */
export type Level = "integration" | "story" | "unit" | QualificationLevel;

/** How a level is shown in the tree. */
export interface LevelInfo {
  /** Shown beside the level's label. */
  description: string;
  level: Level;
  /** Position in the tree, lowest first. */
  order: number;
}
