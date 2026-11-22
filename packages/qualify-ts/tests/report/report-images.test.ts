import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AttachmentRecord } from "../../src/evidence";
import type { Block, DrawOp, Geometry, ITextMetrics } from "../../src/report";

import {
  extractImages,
  extractPdf,
  missingFromOutline,
} from "../../conformance/pdf-text";
import { Merge } from "../../src/merge";
import {
  Layout,
  PdfRenderer,
  ReportContent,
  ReportImages,
} from "../../src/report";
import { Trace } from "../../src/trace";
import { envelope, testRecord } from "../mocks/evidence.mock";
import { FIXTURES, theme } from "../mocks/theme.mock";

const metrics: ITextMetrics = {
  canDraw: () => true,
  width: (text, size) => [...text].length * size * 0.5,
};
/** A4 with 20 mm margins: the text box is 481.9 by 728.5 points. */
const A4: Geometry = { width: 595.28, height: 841.89, margin: 56.6929 };

const attachment = (
  filename: string,
  contentType: string,
  bytes: Uint8Array,
): AttachmentRecord => ({
  filename,
  contentType,
  encoding: "base64",
  content: Buffer.from(bytes).toString("base64"),
  sizeBytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(FIXTURES, "images", name)));

const ATTACHMENTS = [
  attachment("screen.png", "image/png", fixture("screen.png")),
  attachment("tall.jpg", "image/jpeg", fixture("tall.jpg")),
  attachment(
    "broken.png",
    "image/png",
    new Uint8Array(Buffer.from("not an image")),
  ),
  attachment("icon.png", "image/png", fixture("icon.png")),
  attachment("note.txt", "text/plain", new Uint8Array(Buffer.from("hello\n"))),
];

const imageBlock = (image: number): Block => ({
  kind: "image",
  image,
  caption: `image ${image}`,
  unreadable: `image ${image} could not be read`,
});

const ofKind = <K extends DrawOp["kind"]>(ops: readonly DrawOp[], kind: K) =>
  ops.filter((op): op is Extract<DrawOp, { kind: K }> => op.kind === kind);

describe("ReportImages", () => {
  test("draws only image/png and image/jpeg", () => {
    expect(ReportImages.format("image/png")).toBe("png");
    expect(ReportImages.format("image/jpeg")).toBe("jpeg");
    for (const other of ["image/jpg", "IMAGE/PNG", "image/gif", "text/plain"])
      expect(ReportImages.format(other)).toBeNull();
  });

  test("checks the format's signature", () => {
    expect(ReportImages.signed(fixture("screen.png"), "png")).toBe(true);
    expect(ReportImages.signed(fixture("tall.jpg"), "jpeg")).toBe(true);
    expect(ReportImages.signed(fixture("tall.jpg"), "png")).toBe(false);
    expect(ReportImages.signed(fixture("screen.png"), "jpeg")).toBe(false);
    expect(ReportImages.signed(new Uint8Array([0xff, 0xd8]), "jpeg")).toBe(
      false,
    );
  });

  test("scales down to the box, keeps the aspect ratio, never scales up", () => {
    const box = { width: 481.9, height: 364.25 };
    const wide = ReportImages.fit({ width: 1280, height: 720 }, box);
    expect(wide.width).toBeCloseTo(481.9, 1);
    expect(wide.height).toBeCloseTo(271.1, 1);
    const tall = ReportImages.fit({ width: 200, height: 600 }, box);
    expect(tall.width).toBeCloseTo(121.4, 1);
    expect(tall.height).toBeCloseTo(364.25, 1);
    expect(ReportImages.fit({ width: 48, height: 48 }, box)).toEqual({
      width: 48,
      height: 48,
    });
  });

  test("caption and the line for an unreadable image", () => {
    const [screen, , broken] = ATTACHMENTS as [
      AttachmentRecord,
      AttachmentRecord,
      AttachmentRecord,
    ];
    expect(ReportImages.caption(screen)).toBe(
      `screen.png, ${screen.sizeBytes} bytes, SHA-256 ${screen.sha256.slice(0, 12)}`,
    );
    expect(ReportImages.unreadable(broken)).toBe(
      "broken.png could not be read as image/png, so it is not drawn.",
    );
  });
});

describe("ReportContent images", () => {
  test("image blocks follow the attachments table, in the order attached", async () => {
    const plain = await theme("plain");
    const tests = [testRecord("OQ-A1-001", { attachments: ATTACHMENTS })];
    const run = {
      schemaVersion: 1 as const,
      kind: "run" as const,
      run: {
        ...envelope(),
        startedAt: "2026-03-04T05:06:07.000Z",
        endedAt: "2026-03-04T05:07:07.000Z",
      },
      summary: Merge.summary(tests),
      tests,
    };
    const doc = ReportContent.build({
      run,
      digest: "d".repeat(64),
      trace: Trace.build({
        evidence: [{ path: "r.json", sha256: "b".repeat(64), content: run }],
        failOnSkip: false,
      }).trace,
      theme: plain.spec,
      tool: { name: "@lekman/qualify", version: "9.9.9" },
      options: { generatedAt: new Date("2026-01-02T03:04:05.006Z") },
    });
    const at = doc.blocks.findIndex(
      (b) => b.kind === "heading" && b.text === "Attachments",
    );
    expect(doc.blocks[at + 1]?.kind).toBe("table");
    const images = doc.blocks.slice(at + 2).filter((b) => b.kind === "image");
    expect(images.map((b) => b.caption.split(",")[0])).toEqual([
      "screen.png",
      "tall.jpg",
      "broken.png",
      "icon.png",
    ]);
    expect(images.map((b) => b.image)).toEqual([0, 1, 2, 3]);
    expect(doc.images.map((i) => i.format)).toEqual([
      "png",
      "jpeg",
      "png",
      "png",
    ]);
    expect(doc.images[1]?.bytes).toEqual(fixture("tall.jpg"));
  });
});

describe("Layout images", () => {
  test("an image is fitted, framed in the rule colour and captioned", () => {
    const [page] = Layout.paginate([imageBlock(0)], metrics, A4, [
      { width: 1280, height: 720 },
    ]);
    const [image] = ofKind(page ?? [], "image");
    expect(image?.image).toBe(0);
    expect(image?.x).toBeCloseTo(56.69, 1);
    expect(image?.width).toBeCloseTo(481.9, 1);
    expect(image?.height).toBeCloseTo(271.1, 1);
    const frame = ofKind(page ?? [], "line");
    expect(frame).toHaveLength(4);
    expect(frame.every((l) => l.colour === "rule" && l.thickness === 0.5)).toBe(
      true,
    );
    const [caption] = ofKind(page ?? [], "text");
    expect(caption).toMatchObject({
      text: "image 0",
      colour: "muted",
      size: 8.5,
      font: "body",
    });
    expect(caption?.y).toBeLessThan(image?.y ?? 0);
  });

  test("an unreadable image becomes its line of text", () => {
    const [page] = Layout.paginate([imageBlock(0)], metrics, A4, [null]);
    expect(ofKind(page ?? [], "image")).toHaveLength(0);
    expect(ofKind(page ?? [], "text")[0]).toMatchObject({
      text: "image 0 could not be read",
      colour: "text",
      size: 9,
    });
  });

  test("an image and its caption move to the next page together", () => {
    const pages = Layout.paginate(
      [imageBlock(0), imageBlock(1), imageBlock(2)],
      metrics,
      A4,
      [
        { width: 200, height: 300 },
        { width: 200, height: 300 },
        { width: 200, height: 300 },
      ],
    );
    expect(pages).toHaveLength(2);
    const second = pages[1] ?? [];
    expect(ofKind(second, "image").map((i) => i.image)).toEqual([2]);
    expect(ofKind(second, "text").map((t) => t.text)).toEqual(["image 2"]);
  });
});

describe("PdfRenderer images", () => {
  test("draws the PNG and JPEG attachments and lists the unreadable one", async () => {
    const plain = await theme("plain");
    const tests = [testRecord("OQ-A1-001", { attachments: ATTACHMENTS })];
    const run = {
      schemaVersion: 1 as const,
      kind: "run" as const,
      run: {
        ...envelope(),
        startedAt: "2026-03-04T05:06:07.000Z",
        endedAt: "2026-03-04T05:07:07.000Z",
      },
      summary: Merge.summary(tests),
      tests,
    };
    const bytes = await PdfRenderer.render(
      ReportContent.build({
        run,
        digest: "d".repeat(64),
        trace: Trace.build({
          evidence: [{ path: "r.json", sha256: "b".repeat(64), content: run }],
          failOnSkip: false,
        }).trace,
        theme: plain.spec,
        tool: { name: "@lekman/qualify", version: "9.9.9" },
        options: { generatedAt: new Date("2026-01-02T03:04:05.006Z") },
      }),
      plain,
    );
    const { lines } = await extractPdf(bytes);
    expect(
      missingFromOutline(lines, [
        ReportImages.caption(ATTACHMENTS[0] as AttachmentRecord),
        ReportImages.caption(ATTACHMENTS[1] as AttachmentRecord),
        "broken.png could not be read as image/png, so it is not drawn.",
        ReportImages.caption(ATTACHMENTS[3] as AttachmentRecord),
      ]),
    ).toBeUndefined();
    expect(lines.some((l) => l.startsWith("note.txt,"))).toBe(false);
    const placed = (await extractImages(bytes)).slice(1).flat();
    expect(placed).toEqual([
      { width: 960, height: 540 },
      { width: 200, height: 600 },
      { width: 48, height: 48 },
    ]);
  });

  test("bytes that pass the signature but do not decode are not drawn", async () => {
    const pdf = await (await import("pdf-lib")).PDFDocument.create();
    const truncated = fixture("screen.png").slice(0, 40);
    expect(
      await PdfRenderer.embedImage(pdf, { format: "png", bytes: truncated }),
    ).toBeNull();
  });
});
