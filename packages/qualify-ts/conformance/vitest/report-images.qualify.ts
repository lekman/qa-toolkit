import { oq } from "@lekman/qualify/vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IMAGES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../spec/qualify/conformance/fixtures/images",
);
const image = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(resolve(IMAGES, name)));

oq(
  "OQ-CONF-024",
  "report-images test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    ctx.attach("screen.png", image("screen.png"), "image/png");
    ctx.attach("tall.jpg", image("tall.jpg"), "image/jpeg");
    ctx.attach(
      "broken.png",
      new TextEncoder().encode("not an image"),
      "image/png",
    );
    ctx.attach("icon.png", image("icon.png"), "image/png");
    ctx.attach("note.txt", "hello\n", "text/plain");
    ctx.check("fixture", "one equals one").that(1).equals(1);
  },
);
