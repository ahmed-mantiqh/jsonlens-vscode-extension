import * as vscode from "vscode";
import * as documentStore from "./core/document-store.js";
import { loadDocument } from "./core/document-loader.js";
import { initLogger, log } from "./utils/logger.js";
import { JsonTreeProvider } from "./tree/json-tree-provider.js";
import { JsonFilesProvider } from "./tree/json-files-provider.js";
import { JsonLensEditorProvider } from "./providers/json-lens-editor-provider.js";
import { registerCommands } from "./commands/register-commands.js";
import { createIncrementalUpdater } from "./performance/incremental-updater.js";
import { BreadcrumbProvider } from "./search/breadcrumb-provider.js";
import { buildNodePayload } from "./webview/node-payload.js";
import { clearPageState } from "./performance/virtual-list.js";

const SUPPORTED = new Set(["json", "jsonc"]);
let selectionSyncDebounce: ReturnType<typeof setTimeout> | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  initLogger(ctx);
  log("Activating JsonLens");

  // Data-model provider — no visible tree view registered
  const treeProvider = new JsonTreeProvider();

  const filesProvider = new JsonFilesProvider();
  const filesView = vscode.window.createTreeView("jsonlensView", {
    treeDataProvider: filesProvider,
    showCollapseAll: false,
  });
  ctx.subscriptions.push(filesView);

  const editorProvider = JsonLensEditorProvider.register(ctx, treeProvider, filesProvider);

  ctx.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      [{ language: "json" }, { language: "jsonc" }],
      new BreadcrumbProvider()
    )
  );

  registerCommands(ctx, editorProvider, filesProvider);
  createIncrementalUpdater(treeProvider, ctx);

  // Refresh file list when tabs change (text editors or custom editors open/close)
  ctx.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(() => filesProvider.refresh())
  );

  // Text editor cursor → custom editor webview sync (bi-directional)
  ctx.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const editor = event.textEditor;
      if (!SUPPORTED.has(editor.document.languageId)) return;

      clearTimeout(selectionSyncDebounce);
      selectionSyncDebounce = setTimeout(() => {
        const uri = editor.document.uri.toString();
        if (!editorProvider.panels.has(uri)) return;
        const offset = editor.document.offsetAt(event.selections[0].active);
        const node = documentStore.getNodeAtOffset(uri, offset);
        if (node) editorProvider.send(uri, { type: "node.selected", payload: buildNodePayload(node) });
      }, 200);
    })
  );

  // Load active JSON document into data model on activation
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && SUPPORTED.has(activeEditor.document.languageId)) {
    loadDocument(activeEditor.document, treeProvider);
  }

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor || !SUPPORTED.has(editor.document.languageId)) return;
      const uri = editor.document.uri.toString();
      if (!documentStore.get(uri)) loadDocument(editor.document, treeProvider);
    })
  );

  ctx.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (!SUPPORTED.has(doc.languageId)) return;
      const active = vscode.window.activeTextEditor;
      if (active?.document.uri.toString() === doc.uri.toString()) {
        if (!documentStore.get(doc.uri.toString())) loadDocument(doc, treeProvider);
      }
    })
  );

  ctx.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      const uri = doc.uri.toString();
      documentStore.invalidate(uri);
      clearPageState(uri);
    })
  );
}

export function deactivate(): void {
  log("Deactivating JsonLens");
}
