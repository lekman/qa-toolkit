import { createHash } from "node:crypto";

/** A record or marker file name, split into its parts. */
export interface EvidenceName {
  key: string;
  kind: "record" | "started";
  runId: string;
  stem: string;
  testId: string;
}

const NAME =
  /^([0-9A-HJKMNP-TV-Z]{26})__((?:IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,})__([0-9a-f]{8})\.(started|json)$/;

/** File names and paths inside an evidence directory, section 6. */
export class EvidenceFiles {
  /** The default evidence directory, relative to the working directory. */
  static readonly DEFAULT_DIR = "qualification/evidence";
  /** The run file name. */
  static readonly RUN_FILE = "test-evidence.json";

  /**
   * The instance key: the first 8 hex digits of the SHA-256 of the
   * declaration's `site`. A retried test overwrites its own files; a second
   * declaration of the same ID writes beside them, so merge can refuse it.
   */
  static key(site: string): string {
    return createHash("sha256").update(site, "utf8").digest("hex").slice(0, 8);
  }

  /** `<runId>__<testId>__<key>.started` */
  static marker(runId: string, testId: string, key: string): string {
    return `${runId}__${testId}__${key}.started`;
  }

  /** Split a record or marker file name, or `undefined` for any other name. */
  static parse(name: string): EvidenceName | undefined {
    const match = NAME.exec(name);
    if (!match) return undefined;
    const [, runId, testId, key, ext] = match as unknown as string[];
    return {
      runId: runId as string,
      testId: testId as string,
      key: key as string,
      kind: ext === "started" ? "started" : "record",
      stem: `${runId}__${testId}__${key}`,
    };
  }

  /** `<runId>__<testId>__<key>.json` */
  static record(runId: string, testId: string, key: string): string {
    return `${runId}__${testId}__${key}.json`;
  }

  /** The `.sha256` sidecar text: digest, two spaces, file name, newline. */
  static sidecar(content: string | Uint8Array, fileName: string): string {
    const digest = createHash("sha256").update(content).digest("hex");
    return `${digest}  ${fileName}\n`;
  }
}
