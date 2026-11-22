import type { QualifyContext } from "@lekman/qualify/cucumber";

import { Given, Then, When } from "@cucumber/cucumber";
import { ctx } from "@lekman/qualify/cucumber";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The steps every conformance scenario shares. Every scenario has the same
 * narrative, so the Then step looks up the checks of the running test by
 * its ID: the same checks, with the same values, as the vitest scenarios.
 */

/** A helper shared with unit tests, using Node's own assertion. */
function sharedHelper(): void {
  assert.fail("helper failed");
}

// Each sample is joined from two parts, so secret scanners do not flag the
// test source as holding a real key.
const pem =
  "-----BEGIN PRIVATE" +
  " KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----";
const jwt = "eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
const accessKey = "AK" + "IA" + "ABCDEFGHIJKLMNOP";

const IMAGES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../spec/qualify/conformance/fixtures/images",
);
const image = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(resolve(IMAGES, name)));

const onePasses = (c: QualifyContext): void => {
  c.check("fixture", "one equals one").that(1).equals(1);
};

const BODIES: Record<string, (c: QualifyContext) => void> = {
  "IQ-CONF-001": (c) => {
    onePasses(c);
    c.check("fixture", "text contains a word").that("qualify").contains("ali");
  },
  "OQ-CONF-002": (c) => {
    c.check("fixture", "first passes").that(1).equals(1);
    c.check("fixture", "second fails").that(2).equals(3);
    c.check("fixture", "third never runs").that(4).equals(4);
  },
  "OQ-CONF-003": (c) => {
    c.check("fixture", "soft fails").soft().that("a").equals("b");
    c.check("fixture", "still runs").that(true).isTrue();
  },
  "OQ-CONF-004": (c) => {
    onePasses(c);
    throw new Error("boom");
  },
  "OQ-CONF-005": (c) => {
    c.delegate("helper", "shared helper passes", sharedHelper);
  },
  "OQ-CONF-006": (c) => {
    onePasses(c);
    c.skip("fixture not seeded");
  },
  "OQ-CONF-007": onePasses,
  "OQ-CONF-008": onePasses,
  "OQ-conf-009": onePasses,
  "OQ-CONF-011": (c) => {
    const t = c.secret("CONFORMANCE_TOKEN");
    c.check("api", "token " + t + " is used")
      .that("Bearer " + t)
      .contains(t);
    c.attach(
      "request.json",
      { url: "/x", token: t, note: "x " + t },
      "application/json",
    );
    c.attach(
      "raw.bin",
      new Uint8Array([0x00, 0xff, ...new TextEncoder().encode(t), 0x00]),
      "application/octet-stream",
    );
    throw new Error("failed with " + t);
  },
  "OQ-CONF-012": (c) => {
    c.check("fixture", "the output holds secret shapes")
      .that([pem, jwt, accessKey].join(" "))
      .isNotNull();
  },
  "OQ-CONF-015": (c) => {
    c.attach("note.txt", "hello\n", "text/plain");
    c.attach(
      "blob.bin",
      Uint8Array.from({ length: 256 }, (_, i) => i),
      "application/octet-stream",
    );
    onePasses(c);
  },
  "OQ-CONF-016": (c) => {
    c.attach("big.txt", "a".repeat(17), "text/plain");
  },
  "OQ-CONF-017": (c) => {
    const bytes = new Uint8Array([0x01, 0x02]);
    const instant = new Date("2026-01-02T03:04:05.006Z");
    const big = 2 ** 60;
    const map = { b: 1, a: { d: 2, c: 3 } };
    const set = new Set(["b", "a"]);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    c.check("value", "bytes").that(bytes).equals(bytes);
    c.check("value", "instant").that(instant).equals(instant);
    c.check("value", "big integer").that(big).equals(big);
    c.check("value", "NaN").that(NaN).equals(NaN);
    c.check("value", "map").that(map).equals(map);
    c.check("value", "set").that(set).equals(set);
    c.check("value", "cycle").that(cycle).equals(cycle);
  },
  "OQ-CONF-019": () => {
    // SIGKILL ends the cucumber-js process at once, after the marker is
    // written, so the test never writes its record.
    process.kill(process.pid, "SIGKILL");
  },
  "OQ-CONF-024": (c) => {
    c.attach("screen.png", image("screen.png"), "image/png");
    c.attach("tall.jpg", image("tall.jpg"), "image/jpeg");
    c.attach(
      "broken.png",
      new TextEncoder().encode("not an image"),
      "image/png",
    );
    c.attach("icon.png", image("icon.png"), "image/png");
    c.attach("note.txt", "hello\n", "text/plain");
    onePasses(c);
  },
};

Given("a conformance fixture", function () {});

When("the scenario runs", function () {});

Then("the evidence matches the expected file", function (this: unknown) {
  const c = ctx(this);
  BODIES[c.id]?.(c);
});

Given("données d’entrée — 入力", function () {});

When("the run 🚀 starts", function () {});

Then("“quoted” output", function (this: unknown) {
  onePasses(ctx(this));
});

Then("first", function () {});

Then("second", function () {});

Then("third — 3", function () {});
