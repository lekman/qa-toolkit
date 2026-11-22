import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

import type { Declaration } from "../discovery";
import type { TestResult } from "../results";
import type { IRunReporter } from "../runs";
import type { TreeNode } from "../tree";
import type { ProductFolder, ResolvedTest, ScanResult } from "../workspace";

import { Discovery } from "../discovery";
import { RunExecution, RunIds, RunPlan } from "../runs";
import { Settings } from "../settings";
import { TestTree } from "../tree";
import { WorkspaceScan } from "../workspace";
import { ResultFiles, WorkspaceFiles } from "./files.system";
import { ShellProcess } from "./process.system";

const files = new WorkspaceFiles();

/** The `qualify.*` settings of a folder. */
export const settingsOf = (folder: string) => {
  const config = vscode.workspace.getConfiguration(
    "qualify",
    vscode.Uri.file(folder),
  );
  return Settings.from({
    evidenceDir: config.get("evidenceDir"),
    exclude: config.get("exclude"),
    packages: config.get("packages"),
    runners: config.get("runners"),
    traceFiles: config.get("traceFiles"),
  });
};

const location = (d: Declaration): vscode.Location =>
  new vscode.Location(
    vscode.Uri.file(d.file),
    new vscode.Position(d.line - 1, 0),
  );

/**
 * The "Qualification" test controller: keeps the Testing view's tree in step
 * with the files, and runs tests through the run plan. Wiring only; the
 * logic is in the domain classes.
 */
export class QualifyController implements vscode.Disposable {
  /** The VS Code test controller, for the extension host test. */
  readonly controller: vscode.TestController;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly items = new Map<ResolvedTest, vscode.TestItem>();
  private readonly nodes = new Map<string, TreeNode>();
  private pending: NodeJS.Timeout | undefined;
  private readonly scans = new Map<string, ScanResult>();

  /** `resultsDir` is a folder of the extension's own for JUnit reports. */
  constructor(private readonly resultsDir: string) {
    this.controller = vscode.tests.createTestController(
      "qualify",
      "Qualification",
    );
    this.controller.refreshHandler = () => this.refresh();
    this.controller.createRunProfile(
      "Run",
      vscode.TestRunProfileKind.Run,
      (request, token) => this.run(request, token),
      true,
    );
    const globs = [
      ...new Set([
        ...Discovery.EXTENSIONS.map((e) => `**/*${e}`),
        ...WorkspaceScan.indexGlobs(),
      ]),
    ];
    for (const glob of globs) {
      const watcher = vscode.workspace.createFileSystemWatcher(glob);
      const changed = (uri: vscode.Uri): void => this.changed(uri);
      watcher.onDidChange(changed);
      watcher.onDidCreate(changed);
      watcher.onDidDelete(changed);
      this.disposables.push(watcher);
    }
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("qualify")) void this.refresh();
      }),
    );
  }

  private static folders(): ProductFolder[] {
    return (vscode.workspace.workspaceFolders ?? []).map((f) => ({
      name: f.name,
      path: f.uri.fsPath,
    }));
  }

  /** Stops the watchers and removes the controller. */
  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.controller.dispose();
  }

  /** Scans every workspace folder again and rebuilds the tree. */
  async refresh(): Promise<void> {
    this.scans.clear();
    const folders = QualifyController.folders();
    await Promise.all(
      folders.map(async (folder) => {
        this.scans.set(
          folder.path,
          await WorkspaceScan.scan(folder, settingsOf(folder.path), files),
        );
      }),
    );
    const problems = [...this.scans.entries()].flatMap(([folder, scan]) =>
      scan.problems.map((p) => `${folder}/qa.yaml: ${p}`),
    );
    if (problems.length > 0) {
      void vscode.window.showWarningMessage(
        `qa.yaml cannot be used: ${problems.join("; ")}`,
      );
    }
    this.sync();
  }

  /** Re-reads one changed file, or rescans when a build file or qa.yaml changed. */
  private changed(uri: vscode.Uri): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => void this.reread(uri), 300);
  }

  private reporter(run: vscode.TestRun): IRunReporter {
    const item = (test: ResolvedTest): vscode.TestItem =>
      this.items.get(test) as vscode.TestItem;
    const out = (text: string): string => text.replace(/\r?\n/g, "\r\n");
    return {
      errored: (test, message) => {
        const m = new vscode.TestMessage(message);
        m.location = location(test.declaration);
        run.errored(item(test), m);
      },
      output: (text) => run.appendOutput(out(text)),
      result: (test, result: TestResult) => {
        const it = item(test);
        const at = location(test.declaration);
        for (const line of result.output)
          run.appendOutput(out(`${line}\n`), at, it);
        const messages = result.messages.map((r) => {
          const m =
            r.expected !== undefined && r.actual !== undefined
              ? vscode.TestMessage.diff(r.text, r.expected, r.actual)
              : new vscode.TestMessage(r.text);
          m.location = at;
          return m;
        });
        if (result.outcome === "pass") run.passed(it, result.durationMs);
        else if (result.outcome === "fail")
          run.failed(it, messages, result.durationMs);
        else if (result.outcome === "error")
          run.errored(it, messages, result.durationMs);
        else run.skipped(it);
      },
      started: (test) => run.started(item(test)),
    };
  }

  private async reread(uri: vscode.Uri): Promise<void> {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const scan = folder && this.scans.get(folder.uri.fsPath);
    if (
      scan === undefined ||
      scan.sets !== undefined ||
      Discovery.languageOf(uri.fsPath) === undefined
    ) {
      await this.refresh();
      return;
    }
    const text = await files.read(uri.fsPath);
    const found = text === undefined ? [] : Discovery.parse(uri.fsPath, text);
    if (found.length > 0) scan.declarations.set(uri.fsPath, found);
    else scan.declarations.delete(uri.fsPath);
    this.sync();
  }

  private async run(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const excluded = new Set((request.exclude ?? []).map((i) => i.id));
    const selected = new Map<string, ResolvedTest>();
    const collect = (item: vscode.TestItem): void => {
      if (excluded.has(item.id)) return;
      const node = this.nodes.get(item.id);
      if (node?.test !== undefined) selected.set(item.id, node.test);
      item.children.forEach(collect);
    };
    if (request.include === undefined) this.controller.items.forEach(collect);
    else request.include.forEach(collect);
    const run = this.controller.createTestRun(request);
    const runId = RunIds.create(Date.now(), randomBytes(16));
    const scans = this.scans;
    const plan = RunPlan.build([...selected.values()], {
      index: (folder) => scans.get(folder)?.index ?? new Map(),
      platform: process.platform,
      resultsDir: this.resultsDir,
      runId,
      sets: (folder) => scans.get(folder)?.sets,
      settings: settingsOf,
    });
    const abort = new AbortController();
    token.onCancellationRequested(() => abort.abort());
    try {
      await RunExecution.execute(
        plan,
        runId,
        {
          clock: Date.now,
          files: new ResultFiles(),
          process: new ShellProcess(),
          reporter: this.reporter(run),
        },
        abort.signal,
      );
    } finally {
      run.end();
    }
  }

  /** Rebuilds the Testing view's items from the scans. */
  private sync(): void {
    const products = QualifyController.folders().flatMap((folder) => {
      const scan = this.scans.get(folder.path);
      return scan === undefined
        ? []
        : [
            WorkspaceScan.resolve(
              folder,
              scan.declarations,
              scan.index,
              scan.ordinary,
            ),
          ];
    });
    this.nodes.clear();
    this.items.clear();
    const toItem = (node: TreeNode): vscode.TestItem => {
      const uri =
        node.file === undefined ? undefined : vscode.Uri.file(node.file);
      const item = this.controller.createTestItem(node.id, node.label, uri);
      this.nodes.set(node.id, node);
      if (node.test !== undefined) this.items.set(node.test, item);
      item.description = node.description;
      item.error = node.error;
      item.sortText = node.sortText;
      item.tags = node.tags.map((t) => new vscode.TestTag(t));
      if (node.line !== undefined) {
        item.range = new vscode.Range(node.line - 1, 0, node.line - 1, 0);
      }
      item.children.replace(node.children.map(toItem));
      return item;
    };
    this.controller.items.replace(
      TestTree.build(products)
        .filter((p) => p.children.length > 0)
        .map(toItem),
    );
  }
}
