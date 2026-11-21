/** One parsed frame of a stack trace. */
export interface Frame {
  /** 1-based line number. */
  line: number;
  /** Absolute file path. */
  path: string;
}
