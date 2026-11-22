/**
 * Starts VS Code with test-host/fixture open and the extension under
 * development loaded, and runs dist-test/suite.js inside it.
 * @vscode/test-electron downloads VS Code into .vscode-test/ on first use.
 * On Linux without a display, run it under `xvfb-run -a`.
 */

import { runTests } from "@vscode/test-electron";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

// Set when this runs from a terminal inside VS Code or another Electron
// app; VS Code would then start as plain Node and fail.
delete process.env.ELECTRON_RUN_AS_NODE;

try {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, "dist-test/suite.js"),
    launchArgs: [
      join(root, "test-host/fixture"),
      // A short user data folder: VS Code opens a socket in it, and a socket
      // path over about 100 characters fails to open.
      `--user-data-dir=${mkdtempSync(join(tmpdir(), "qv-"))}`,
      "--disable-extensions",
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
    ],
  });
} catch (error) {
  console.error("The extension host test failed:", error);
  process.exit(1);
}
