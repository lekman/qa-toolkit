import * as vscode from "vscode";

import { settingsOf } from "./controller.system";

/**
 * Opens the trace matrix that `qualify trace` wrote (`--md` or `--json`):
 * the only one found, or the one the user picks. Markdown opens in the
 * preview.
 */
export async function openTrace(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const found = (
    await Promise.all(
      folders.map((f) => {
        const s = settingsOf(f.uri.fsPath);
        return vscode.workspace.findFiles(
          new vscode.RelativePattern(f, s.traceFiles),
          `{${s.exclude.join(",")}}`,
        );
      }),
    )
  ).flat();
  if (found.length === 0) {
    void vscode.window.showInformationMessage(
      "No trace matrix found. Run `qualify trace` with --md or --json first.",
    );
    return;
  }
  let uri = found[0] as vscode.Uri;
  if (found.length > 1) {
    const pick = await vscode.window.showQuickPick(
      found.map((u) => ({
        label: vscode.workspace.asRelativePath(u, true),
        uri: u,
      })),
      { placeHolder: "Which trace matrix?" },
    );
    if (pick === undefined) return;
    uri = pick.uri;
  }
  if (uri.fsPath.toLowerCase().endsWith(".md")) {
    await vscode.commands.executeCommand("markdown.showPreview", uri);
  } else {
    await vscode.window.showTextDocument(uri);
  }
}
