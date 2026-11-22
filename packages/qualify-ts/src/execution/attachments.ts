import { createHash } from "node:crypto";

import type { PendingAttachment } from "../checks";
import type { AttachmentRecord } from "../evidence";

import { Redaction } from "../redaction";
import { JsonText } from "../values";

/** Turns held attachments into redacted, encoded records. */
export class Attachments {
  /**
   * Redact and encode one attachment. A JSON attachment is redacted as JSON,
   * then written like an evidence file: two-space indent, keys sorted, and a
   * trailing newline. Any other attachment is redacted as bytes.
   */
  static finalise(
    pending: PendingAttachment,
    registered: readonly string[],
  ): AttachmentRecord {
    const bytes =
      pending.kind === "json"
        ? new Uint8Array(
            Buffer.from(
              JsonText.document(Redaction.json(pending.value, registered)),
              "utf8",
            ),
          )
        : Redaction.bytes(pending.bytes, registered);
    return {
      filename: Redaction.text(pending.filename, registered),
      contentType: pending.contentType,
      encoding: "base64",
      content: Buffer.from(bytes).toString("base64"),
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
}
