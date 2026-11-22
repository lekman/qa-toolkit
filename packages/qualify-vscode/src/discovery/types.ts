import type { Framework } from "@lekman/test-sets";

import type { Level, QualificationLevel } from "../levels";

export type { Framework } from "@lekman/test-sets";

/** A source language that discovery reads. */
export type Language = "dotnet" | "gherkin" | "jvm" | "python" | "typescript";

/**
 * One test found by reading a file, without running anything. A declaration
 * with `problems` is shown as an error item, never hidden.
 */
export interface Declaration {
  /** The class that holds the test, where the language has one. */
  className?: string;
  /** Absolute path of the file. */
  file: string;
  framework: Framework;
  id: string;
  language: Language;
  level: Level;
  /** 1-based line of the declaration. */
  line: number;
  /** The test function or method, where the language has one. */
  method?: string;
  /** What is wrong with the declaration, found without running it. */
  problems: string[];
  requirements: string[];
  risk?: string;
  scope?: string;
  /** Free tags, sorted and without duplicates. */
  tags: string[];
  title: string;
}

/** A string literal argument, or the source text of a value that is not one. */
export interface Argument {
  /** The key of a named argument, lower-cased, without quotes or backticks. */
  key?: string;
  /** Offset of the value in the file. */
  start: number;
  /** The value's source text, trimmed. */
  text: string;
}

/** How a language writes comments and strings, for masking. */
export interface Syntax {
  blockComment?: readonly [string, string];
  /** Whether a backslash escapes inside a string. */
  escapes: boolean;
  lineComment: string;
  /** Quote characters that start a string. */
  quotes: readonly string[];
  /** Whether `"""` (and `'''` when `'` is a quote) start a multi-line string. */
  triple: boolean;
  /** Whether `@"` starts a C# verbatim string, where `""` is a quote. */
  verbatim: boolean;
}

/** Where a declaration's call or annotation is, and what it belongs to. */
export interface CallSite {
  className?: string;
  file: string;
  framework: Framework;
  language: Language;
  level: QualificationLevel;
  /** 1-based line of the call or annotation. */
  line: number;
  method?: string;
}

/** The source text and its masked copy. */
export interface Source {
  masked: string;
  text: string;
}
