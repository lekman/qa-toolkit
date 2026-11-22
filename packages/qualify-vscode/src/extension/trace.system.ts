import { access, copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import * as vscode from "vscode";

import type { ExecResult, ITraceHost, PickItem, TraceFolder } from "../trace";
import type { QualifyController } from "./controller.system";

import { TraceMatrix } from "../trace";
import { settingsOf } from "./controller.system";
import { WorkspaceFiles } from "./files.system";
import { ShellProcess } from "./process.system";

const files = new WorkspaceFiles();

/** The trace command's view of VS Code, the file system and the shell. */
class VsCodeTraceHost implements ITraceHost {
  readonly platform = process.platform;

  constructor(private readonly qualify: QualifyController) {}

  async confirm(message: string, action: string): Promise<boolean> {
    return (
      (await vscode.window.showInformationMessage(message, action)) === action
    );
  }

  async copy(paths: readonly string[], dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
    await Promise.all(paths.map((p) => copyFile(p, join(dir, basename(p)))));
  }

  error(message: string): void {
    void vscode.window.showErrorMessage(message);
  }

  exec(command: string, cwd: string): Promise<ExecResult> {
    return Promise.resolve(
      vscode.window.withProgress(
        {
          cancellable: true,
          location: vscode.ProgressLocation.Notification,
          title: "Building the trace matrix",
        },
        async (progress, token) => {
          progress.report({ message: command });
          const abort = new AbortController();
          token.onCancellationRequested(() => abort.abort());
          let output = "";
          try {
            const code = await new ShellProcess().run(command, {
              cwd,
              env: {},
              onOutput: (text) => {
                output += text;
              },
              signal: abort.signal,
            });
            return { code, output };
          } catch (error) {
            return { code: null, output: `${output}${String(error)}` };
          }
        },
      ),
    );
  }

  async exists(path: string): Promise<boolean> {
    return access(path).then(
      () => true,
      () => false,
    );
  }

  find(
    folder: string,
    include: readonly string[],
    exclude: readonly string[],
  ): Promise<string[]> {
    return files.find(folder, include, exclude);
  }

  folders(): TraceFolder[] {
    return (vscode.workspace.workspaceFolders ?? []).map((f) => ({
      name: f.name,
      path: f.uri.fsPath,
      settings: settingsOf(f.uri.fsPath),
    }));
  }

  async open(path: string): Promise<void> {
    const uri = vscode.Uri.file(path);
    if (path.toLowerCase().endsWith(".md")) {
      await vscode.commands.executeCommand("markdown.showPreview", uri);
    } else {
      await vscode.window.showTextDocument(uri);
    }
  }

  async pick<T>(
    items: readonly PickItem<T>[],
    placeholder: string,
  ): Promise<T | undefined> {
    const picked = await vscode.window.showQuickPick(
      items.map((i) => ({
        description: i.description,
        detail: i.detail,
        item: i,
        label: i.label,
      })),
      {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: placeholder,
      },
    );
    return picked?.item.value;
  }

  read(path: string): Promise<string | undefined> {
    return files.read(path);
  }

  runQualification(): Promise<void> {
    return this.qualify.runQualification();
  }

  tempDir(): Promise<string> {
    return mkdtemp(join(tmpdir(), "qualify-merge-"));
  }
}

/** **Qualify: Open Trace Matrix**: opens a trace matrix, and builds one when there is none. */
export function openTrace(qualify: QualifyController): Promise<void> {
  return TraceMatrix.open(new VsCodeTraceHost(qualify));
}
