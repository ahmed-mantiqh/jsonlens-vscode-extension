import * as vscode from "vscode";
import type { JsonNode } from "../core/tree-node.js";
import * as documentStore from "../core/document-store.js";
import { pathToString, stringToPath } from "../core/path-utils.js";
import { buildIndex, query, type SearchIndex, type SearchMatch } from "../search/searcher.js";
import { buildNodePayload } from "../webview/node-payload.js";
import { analyzeArrayNode } from "../analysis/field-analyzer.js";
import { inferSchemaNode } from "../analysis/schema-inferrer.js";
import { JsonLensEditorProvider } from "../providers/json-lens-editor-provider.js";
import type { JsonFilesProvider } from "../tree/json-files-provider.js";
import { log } from "../utils/logger.js";

type SearchScope = "keys" | "values" | "both";

export function registerCommands(
  ctx: vscode.ExtensionContext,
  editorProvider: JsonLensEditorProvider,
  filesProvider: JsonFilesProvider,
): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand("jsonlens.copyPath", (node?: JsonNode) => {
      const target = node ?? getNodeAtCursor();
      if (!target) return;
      const pathStr = pathToString(target.path);
      vscode.env.clipboard.writeText(pathStr);
      vscode.window.setStatusBarMessage(`Copied: ${pathStr}`, 2000);
    }),

    vscode.commands.registerCommand("jsonlens.copyValue", (node?: JsonNode) => {
      if (!node) return;
      const text = node.value !== undefined
        ? JSON.stringify(node.value)
        : node.type === "object" || node.type === "array" ? `[${node.type}]` : "null";
      vscode.env.clipboard.writeText(text);
      vscode.window.setStatusBarMessage("Copied value", 2000);
    }),

    // Reveal source: open text editor for the active JSON and highlight node range
    vscode.commands.registerCommand("jsonlens.revealInTree", () => {
      const uri = getActiveJsonUri(editorProvider);
      if (!uri) { vscode.window.showWarningMessage("JsonLens: No active JSON file."); return; }
      const state = documentStore.get(uri);
      if (!state) { vscode.window.showWarningMessage("JsonLens: Document not yet parsed."); return; }
      const offset = getActiveOffset(uri);
      const node = documentStore.getNodeAtOffset(uri, offset);
      if (!node) { vscode.window.setStatusBarMessage("JsonLens: No node at cursor.", 2000); return; }

      vscode.window.showTextDocument(vscode.Uri.parse(uri), { preview: false }).then((editor) => {
        const start = editor.document.positionAt(node.range[0]);
        const end   = editor.document.positionAt(node.range[1]);
        editor.selection = new vscode.Selection(start, start);
        editor.revealRange(
          new vscode.Range(start, end),
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        );
      }, () => {});
    }),

    vscode.commands.registerCommand("jsonlens.searchTree", () =>
      runSearch(editorProvider)
    ),

    vscode.commands.registerCommand("jsonlens.openPreview", (node?: JsonNode) => {
      openPreview(node, editorProvider);
    }),

    vscode.commands.registerCommand("jsonlens.openInJsonLens", async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ["json", "jsonc"] },
        title: "Open JSON in JsonLens",
      });
      if (uris?.[0]) {
        vscode.commands.executeCommand("vscode.openWith", uris[0], JsonLensEditorProvider.viewType);
      }
    }),

    vscode.commands.registerCommand("jsonlens.openWithPreview", (uri: vscode.Uri) => {
      vscode.commands.executeCommand("vscode.openWith", uri, JsonLensEditorProvider.viewType);
    }),

    vscode.commands.registerCommand("jsonlens.openAsText", () => {
      const uri = getActiveJsonUri(editorProvider);
      if (!uri) return;
      vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(uri), "default");
    }),

    vscode.commands.registerCommand("jsonlens.refreshView", () => {
      filesProvider.refresh();
    }),

    vscode.commands.registerCommand("jsonlens.collapseAll", () => {
      vscode.commands.executeCommand("workbench.actions.treeView.jsonlensView.collapseAll");
    }),

    vscode.commands.registerCommand("jsonlens.analyzeFields", (node?: JsonNode) =>
      runAnalyzeFields(node, editorProvider)
    ),

    vscode.commands.registerCommand("jsonlens.inferSchema", (node?: JsonNode) =>
      runInferSchema(node, editorProvider)
    ),

    vscode.commands.registerCommand("jsonlens.exportSchema", () => {
      // Export is initiated from the webview via schema.export message; stub kept for package.json
    }),
  );
}

async function runInferSchema(
  node: JsonNode | undefined,
  editorProvider: JsonLensEditorProvider,
): Promise<void> {
  const target = node ?? getNodeAtCursor();
  if (!target) {
    vscode.window.showWarningMessage("JsonLens: Select an object or array node to infer schema.");
    return;
  }
  if (target.type !== "object" && target.type !== "array") {
    vscode.window.showWarningMessage("JsonLens: Schema inference requires an object or array node.");
    return;
  }
  const uri = getActiveJsonUri(editorProvider);
  if (!uri) return;
  const state = documentStore.get(uri);
  if (!state) return;

  if (!editorProvider.panels.has(uri)) {
    await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(uri), JsonLensEditorProvider.viewType);
    return;
  }
  editorProvider.send(uri, { type: "node.loading" });
  try {
    const payload = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "JsonLens: Inferring schema…" },
      () => inferSchemaNode(target, state.rawText),
    );
    log(`Schema: ${payload.stats.nodeCount} nodes`);
    editorProvider.send(uri, { type: "schema.result", payload });
  } catch (err) {
    editorProvider.send(uri, { type: "error", payload: { message: `Schema inference failed: ${err}` } });
  }
}

async function runAnalyzeFields(
  node: JsonNode | undefined,
  editorProvider: JsonLensEditorProvider,
): Promise<void> {
  const target = node ?? getNodeAtCursor();
  if (!target) {
    vscode.window.showWarningMessage("JsonLens: Select an array node to analyze.");
    return;
  }
  if (target.type !== "array") {
    vscode.window.showWarningMessage("JsonLens: Field analysis requires an array node.");
    return;
  }
  const uri = getActiveJsonUri(editorProvider);
  if (!uri) return;
  const state = documentStore.get(uri);
  if (!state) return;

  if (!editorProvider.panels.has(uri)) {
    await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(uri), JsonLensEditorProvider.viewType);
    return;
  }
  editorProvider.send(uri, { type: "node.loading" });
  try {
    const payload = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "JsonLens: Analyzing fields…" },
      () => analyzeArrayNode(target, state.rawText),
    );
    log(`Analysis: ${payload.rows.length} keys, ${payload.totalItems} items`);
    editorProvider.send(uri, { type: "analysis.result", payload });
  } catch (err) {
    editorProvider.send(uri, { type: "error", payload: { message: `Analysis failed: ${err}` } });
  }
}

function openPreview(node: JsonNode | undefined, editorProvider: JsonLensEditorProvider): void {
  const uri = getActiveJsonUri(editorProvider);
  if (!uri) return;
  vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(uri), JsonLensEditorProvider.viewType);
  const target = node ?? getNodeAtCursor();
  if (target) {
    setTimeout(() => {
      editorProvider.send(uri, { type: "node.selected", payload: buildNodePayload(target) });
    }, 300);
  }
}

async function runSearch(editorProvider: JsonLensEditorProvider): Promise<void> {
  const uri = getActiveJsonUri(editorProvider);
  if (!uri) return;
  const state = documentStore.get(uri);
  if (!state) { vscode.window.showWarningMessage("JsonLens: No parsed document."); return; }

  if (!state.searchIndex || state.searchIndex.builtAtVersion !== state.version) {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "JsonLens: Indexing…" },
      async () => {
        state.searchIndex = await buildIndex(state.root, state.version);
        log(`Index: ${state.searchIndex.keys.size} keys, ${state.searchIndex.values.size} values`);
      },
    );
  }

  const index = state.searchIndex!;
  const qp = vscode.window.createQuickPick<SearchQuickPickItem>();
  qp.placeholder = "Search keys and values… (prefix k: or v: to scope)";
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;

  let debounce: ReturnType<typeof setTimeout> | undefined;
  qp.onDidChangeValue((value) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { qp.items = runQuery(index, value); }, 150);
  });

  qp.onDidAccept(() => {
    const sel = qp.selectedItems[0];
    if (!sel) return;
    qp.hide();
    navigateTo(sel.match, uri, editorProvider);
  });

  qp.onDidHide(() => qp.dispose());
  qp.show();
}

function runQuery(index: SearchIndex, input: string): SearchQuickPickItem[] {
  let scope: SearchScope = "both";
  let q = input;
  if (input.startsWith("k:")) { scope = "keys"; q = input.slice(2); }
  else if (input.startsWith("v:")) { scope = "values"; q = input.slice(2); }
  return query(index, q, scope).map((m) => ({
    label: m.label,
    description: m.pathStr,
    detail: m.valuePreview || undefined,
    match: m,
  }));
}

function navigateTo(
  match: SearchMatch,
  uri: string,
  editorProvider: JsonLensEditorProvider,
): void {
  const node = documentStore.getNodeAtPath(uri, match.path);
  if (!node) return;

  // Update custom editor webview if open
  editorProvider.send(uri, { type: "node.selected", payload: buildNodePayload(node) });

  // Also navigate text editor if visible
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === uri
  );
  if (editor) {
    const startPos = editor.document.positionAt(node.range[0]);
    const endPos   = editor.document.positionAt(node.range[1]);
    editor.selection = new vscode.Selection(startPos, startPos);
    editor.revealRange(
      new vscode.Range(startPos, endPos),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }
}

interface SearchQuickPickItem extends vscode.QuickPickItem {
  match: SearchMatch;
}

function getNodeAtCursor(): JsonNode | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  return documentStore.getNodeAtOffset(
    editor.document.uri.toString(),
    editor.document.offsetAt(editor.selection.active),
  );
}

function getActiveJsonUri(editorProvider: JsonLensEditorProvider): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor && (editor.document.languageId === "json" || editor.document.languageId === "jsonc")) {
    return editor.document.uri.toString();
  }
  return editorProvider.activeUri;
}

function getActiveOffset(uri: string): number {
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === uri
  );
  if (editor) return editor.document.offsetAt(editor.selection.active);
  return 0;
}
