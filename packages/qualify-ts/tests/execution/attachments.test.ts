import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { Attachments } from "../../src/execution";

describe("Attachments.finalise", () => {
  test("JSON is redacted, sorted, indented and ends with a newline", () => {
    const record = Attachments.finalise(
      {
        kind: "json",
        filename: "request.json",
        contentType: "application/json",
        value: { url: "/x", token: "s3cr3t-value", note: "x s3cr3t-value" },
      },
      ["s3cr3t-value"],
    );
    const text =
      '{\n  "note": "x [REDACTED]",\n  "token": "[REDACTED]",\n  "url": "/x"\n}\n';
    expect(Buffer.from(record.content, "base64").toString("utf8")).toBe(text);
    expect(record).toMatchObject({
      encoding: "base64",
      sizeBytes: Buffer.byteLength(text),
      sha256: createHash("sha256").update(text).digest("hex"),
    });
  });

  test("bytes are redacted in place and measured after redaction", () => {
    const record = Attachments.finalise(
      {
        kind: "bytes",
        filename: "raw.bin",
        contentType: "application/octet-stream",
        bytes: new Uint8Array([0, 255, ...Buffer.from("secret-1"), 0]),
      },
      ["secret-1"],
    );
    expect([...Buffer.from(record.content, "base64")]).toEqual([
      0,
      255,
      ...Buffer.from("[REDACTED]"),
      0,
    ]);
    expect(record.sizeBytes).toBe(13);
  });
});
