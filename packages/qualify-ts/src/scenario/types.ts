import type { Level, Narrative } from "../declaration";

/** The parts of a Gherkin step after compilation that qualify reads. */
export interface ScenarioStep {
  /** The step's node in the feature file, then its example row, if any. */
  astNodeIds: readonly string[];
  text: string;
  /** `Context` (Given), `Action` (When), `Outcome` (Then) or `Unknown`. */
  type?: string;
}

/**
 * The parts of a compiled scenario (a cucumber pickle) that qualify reads:
 * its name, tags and steps, and where it is.
 */
export interface ScenarioSource {
  /** The scenario's node in the feature file, then its example row, if any. */
  astNodeIds: readonly string[];
  /** The line of the scenario in the feature file. */
  location?: { line: number };
  name: string;
  steps: readonly ScenarioStep[];
  /** Tags of the scenario and of the rule and feature that hold it. */
  tags: readonly { name: string }[];
  /** The feature file path, relative to the working directory. */
  uri: string;
}

/** A node of a feature file that has an ID and a line. */
export interface LocatedNode {
  id: string;
  location: { line: number };
}

/** A scenario or background in a parsed feature file. */
export interface StepContainer extends LocatedNode {
  examples?: readonly { tableBody: readonly LocatedNode[] }[];
  steps: readonly LocatedNode[];
}

/** A child of a feature or a rule in a parsed feature file. */
export interface FeatureChildNode {
  background?: StepContainer;
  rule?: { children: readonly FeatureChildNode[] };
  scenario?: StepContainer;
}

/** The parts of a parsed feature file that qualify reads: the lines of its nodes. */
export interface FeatureDocument {
  feature?: { children: readonly FeatureChildNode[] };
}

/** How a scenario ended, as cucumber reports it to an After hook. */
export interface ScenarioResult {
  exception?: { message?: string; type: string };
  message?: string;
  /** `PASSED`, `SKIPPED`, `PENDING`, `UNDEFINED`, `AMBIGUOUS`, `FAILED` or `UNKNOWN`. */
  status: string;
}

/** A scenario read as a qualification test declaration. */
export interface ScenarioDeclaration {
  id: string;
  level: Level;
  /** The line of the scenario in its feature file. */
  line: number;
  narrative: Narrative;
  title: string;
}
