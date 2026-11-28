import type { CaseLevel, RunInfo, TestCase } from "../evidence";

/** An element of an XML document. */
export interface XmlElement {
  attributes: Record<string, string>;
  /** Child elements and text, in document order. */
  children: XmlNode[];
  name: string;
}

/** An element or a run of text. */
export type XmlNode = string | XmlElement;

/** The test cases of one JUnit report, and the time span its suites state. */
export interface JUnitReport {
  cases: TestCase[];
  /** Latest suite timestamp plus its time, in ms since the epoch. */
  endedAt?: number;
  /** Earliest suite timestamp, in ms since the epoch. */
  startedAt?: number;
}

/** One LCOV record (`SF` to `end_of_record`), as read. */
export interface LcovRecord {
  /** Taken counts by `line,block,branch`. */
  branches: Map<string, number>;
  /** Hit counts by function name. */
  functions: Map<string, number>;
  /** Hit counts by line number. */
  lines: Map<number, number>;
  path: string;
  /** The `LF`/`LH`, `FNF`/`FNH` and `BRF`/`BRH` totals, when given. */
  totals: {
    branches?: { found: number; hit: number };
    functions?: { found: number; hit: number };
    lines?: { found: number; hit: number };
  };
}

/** One input file of an import, with the digest of its bytes. */
export interface ImportSource {
  path: string;
  sha256: string;
  text: string;
}

/** Everything `import junit` reads. */
export interface ImportRequest {
  coverage: readonly ImportSource[];
  /** The working directory, to make coverage paths relative. */
  cwd: string;
  /** The envelope of the importing process. */
  envelope: RunInfo;
  junit: readonly ImportSource[];
  level: CaseLevel;
  /** The import time, used when no suite has a timestamp. */
  now: Date;
}
