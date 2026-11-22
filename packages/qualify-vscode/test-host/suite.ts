/**
 * The extension host test: runs inside VS Code with test-host/fixture open,
 * activates the extension and checks the shape of the Testing view's tree:
 * the qualification tests of every language, and the ordinary tests of the
 * sets in the fixture's qa.yaml.
 * Bundled to dist-test/suite.js by scripts/build-host-test.ts.
 */

import * as assert from "node:assert/strict";
import * as vscode from "vscode";

/** What `activate` returns. */
interface Api {
  controller: vscode.TestController;
  ready: Promise<void>;
}

const EXPECTED = [
  "fixture",
  "  dotnet-svc/Acme.Tests",
  "    OQ",
  "      OQ-PAYMENT-001 A payment is refused without a signature [level:oq req:PAYMENT-001 risk:high runner:dotnet]",
  "  jvm-svc",
  "    IQ",
  "      IQ-EXPORT-001 The export service starts with its settings [level:iq req:EXPORT-001 runner:gradle]",
  "    OQ",
  "      OQ-LEDGER-001 The ledger keeps every payment [level:oq req:LEDGER-001 risk:low runner:gradle]",
  "  py-lib",
  "    PQ",
  "      PQ-EXPORT-001 A day of payments exports within a minute [level:pq req:EXPORT-010 risk:medium runner:pytest]",
  "    unit",
  "      test_adds [level:unit runner:pytest set:py-unit]",
  "  ts-app",
  "    OQ",
  "      OQ-EXPORT-003 The bank file never changes an amount [level:oq req:EXPORT-003 risk:high runner:vitest tag:export]",
  "      OQ-EXPORT-API-001 An ID that breaks the pattern [error level:oq runner:vitest] (error)",
  "    unit",
  "      adds two numbers [level:unit runner:bun-test set:ts-unit]",
  "  web",
  "    IU",
  "      IU-SUPPORT-001 Support lists every open request [level:iu req:REQ-SUPPORT-001 risk:high runner:cucumber-js tag:support]",
];

const shape = (items: vscode.TestItemCollection, depth = 0): string[] => {
  const list: vscode.TestItem[] = [];
  items.forEach((item) => list.push(item));
  list.sort((a, b) =>
    (a.sortText ?? a.label) < (b.sortText ?? b.label) ? -1 : 1,
  );
  return list.flatMap((item) => {
    const tags =
      item.tags.length > 0 ? ` [${item.tags.map((t) => t.id).join(" ")}]` : "";
    const error = item.error === undefined ? "" : " (error)";
    return [
      `${"  ".repeat(depth)}${item.label}${tags}${error}`,
      ...shape(item.children, depth + 1),
    ];
  });
};

/** Called by @vscode/test-electron inside the extension host. */
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<Api>(
    "lekman.qualify-vscode",
  );
  assert.ok(extension, "the extension is installed in the test host");
  const api = await extension.activate();
  await api.ready;
  const actual = shape(api.controller.items);
  console.log(actual.join("\n"));
  assert.deepEqual(actual, EXPECTED);
}
