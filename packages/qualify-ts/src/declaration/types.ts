/** Qualification level, chosen by the function the test is declared with. */
export type Level = "IQ" | "IU" | "OQ" | "PQ";

/** Declared effect on the system under test. */
export type Scope = "read" | "read-write";

/** Declared risk of the behaviour the test covers. */
export type Risk = "high" | "low" | "medium";

/** The narrative and metadata a test author writes after the ID and title. */
export interface Narrative {
  /** Further clauses after `then`, each not empty. */
  and?: readonly string[];
  /** ID of the negative test this test is the control for. */
  controls?: string;
  given: string;
  /** Requirement IDs, 1 to 64 characters each, without duplicates. */
  requirements?: readonly string[];
  risk?: Risk;
  /** Required for OQ and PQ. IQ is always `read` and IU always `read-write`. */
  scope?: Scope;
  /** Free strings, stored sorted and without duplicates. */
  tags?: readonly string[];
  then: string;
  /** Passed to the runner's own timeout. Not recorded. */
  timeoutMs?: number;
  when: string;
}

/** A validated declaration, as the started marker and the record hold it. */
export interface Declaration {
  and?: string[];
  controls?: string;
  given: string;
  id: string;
  level: Level;
  requirements: string[];
  risk?: Risk;
  scope: Scope;
  site: string;
  tags: string[];
  then: string;
  title: string;
  when: string;
}

/** A validated declaration plus the settings that are not recorded. */
export interface DeclaredTest {
  declaration: Declaration;
  timeoutMs?: number;
}
