import * as vscode from "vscode";

import { QualifyController } from "./controller.system";
import { openTrace } from "./trace.system";

/** What the extension returns from `activate`, for the extension host test. */
export interface QualifyApi {
  controller: vscode.TestController;
  /** Resolves once the first scan has built the tree. */
  ready: Promise<void>;
  refresh(): Promise<void>;
}

/** Starts the extension: the test controller, its first scan and the commands. */
export function activate(context: vscode.ExtensionContext): QualifyApi {
  const qualify = new QualifyController(
    vscode.Uri.joinPath(context.globalStorageUri, "junit").fsPath,
  );
  context.subscriptions.push(
    qualify,
    vscode.commands.registerCommand("qualify.refresh", () => qualify.refresh()),
    vscode.commands.registerCommand("qualify.openTrace", () => openTrace()),
  );
  return {
    controller: qualify.controller,
    ready: qualify.refresh(),
    refresh: () => qualify.refresh(),
  };
}

/** Nothing to stop: the controller is disposed with the context. */
export function deactivate(): void {}
