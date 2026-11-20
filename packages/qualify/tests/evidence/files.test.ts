import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { EvidenceFiles } from "../../src/evidence";

const RUN = "01HQA1ZQJ0C0NF0RMANCE00000";

describe("EvidenceFiles", () => {
  test("the instance key is 8 hex digits of the site's SHA-256", () => {
    const key = EvidenceFiles.key("tests/a.test.ts:3");
    expect(key).toBe(
      createHash("sha256")
        .update("tests/a.test.ts:3")
        .digest("hex")
        .slice(0, 8),
    );
    expect(EvidenceFiles.key("tests/b.test.ts:3")).not.toBe(key);
  });

  test("names and parsing", () => {
    expect(EvidenceFiles.marker(RUN, "OQ-A1-001", "0123abcd")).toBe(
      `${RUN}__OQ-A1-001__0123abcd.started`,
    );
    expect(
      EvidenceFiles.parse(EvidenceFiles.record(RUN, "OQ-A1-001", "0123abcd")),
    ).toEqual({
      runId: RUN,
      testId: "OQ-A1-001",
      key: "0123abcd",
      kind: "record",
      stem: `${RUN}__OQ-A1-001__0123abcd`,
    });
    expect(
      EvidenceFiles.parse(`${RUN}__OQ-A1-001__0123abcd.started`)?.kind,
    ).toBe("started");
    expect(EvidenceFiles.parse(`${RUN}__OQ-A1-001.json`)).toBeUndefined();
    expect(EvidenceFiles.parse("notes.txt")).toBeUndefined();
  });

  test("the sidecar is in sha256sum format", () => {
    expect(EvidenceFiles.sidecar("abc", "test-evidence.json")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  test-evidence.json\n",
    );
  });
});
