/** Writes evidence files. Implemented by the system layer. */
export interface IEvidenceWriter {
  /**
   * Write a file atomically, text as UTF-8: a temporary file in the same directory, flushed,
   * then renamed. Creates the directory first.
   */
  write(path: string, content: string | Uint8Array): Promise<void>;
}
