/** Where encoded output goes. Implemented by the system layer. */
export interface IOutputSink {
  close(): Promise<void>;
  write(chunk: string): Promise<void>;
}
