/**
 * Render the first pages of a PDF to PNG with pdfjs-dist and @napi-rs/canvas,
 * for the sample images in the README. Development only.
 *
 *   bun run scripts/render-pages.ts report.pdf docs/ 2
 */

import { createCanvas } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const [input, outDir = ".", count = "2"] = process.argv.slice(2);
if (input === undefined) {
  console.error("usage: render-pages.ts FILE.pdf [OUT_DIR] [PAGES]");
  process.exit(64);
}

const task = getDocument({
  data: new Uint8Array(readFileSync(input)),
  verbosity: 0,
});
const pdf = await task.promise;
for (let n = 1; n <= Math.min(Number(count), pdf.numPages); n++) {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvas: canvas as never,
    canvasContext: context as never,
    viewport,
  }).promise;
  const out = join(outDir, `report-page-${n}.png`);
  writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(`wrote ${out}`);
}
await task.destroy();
