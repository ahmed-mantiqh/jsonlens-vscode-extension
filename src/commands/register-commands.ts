import * as vscode from "vscode";
import type { JsonNode } from "../core/tree-node.js";
import * as documentStore from "../core/document-store.js";
import { pathToString, stringToPath } from "../core/path-utils.js";
import { buildIndex, query, type SearchIndex, type SearchMatch } from "../search/searcher.js";
import { buildNodePayload } from "../webview/node-payload.js";
import { analyzeArrayNode } from "../analysis/field-analyzer.js";
import { inferSchemaNode } from "../analysis/schema-inferrer.js";
import type { PanelManager } from "../webview/panel-manager.js";
import { log } from "../utils/logger.js";

type SearchScope = "keys" | "values" | "both";

export function registerCommands(
  ctx: vscode.ExtensionContext,
  treeView: vscode.TreeView<JsonNode>,
  panelManager: PanelManager
): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand("jsonlens.collapseAll", () => {
      vscode.commands.executeCommand("workbench.actions.treeView.jsonlensTree.collapseAll");
    }),

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

    vscode.commands.registerCommand("jsonlens.revealInTree", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const node = documentStore.getNodeAtOffset(
        editor.document.uri.toString(),
        editor.document.offsetAt(editor.selection.active)
      );
      if (node) treeView.reveal(node, { select: true, focus: true, expand: true }).then(undefined, () => {});
    }),

    vscode.commands.registerCommand("jsonlens.searchTree", () =>
      runSearch(treeView)
    ),

    vscode.commands.registerCommand("jsonlens.openPreview", (node?: JsonNode) =>
      openPreview(node, panelManager)
    ),

    vscode.commands.registerCommand("jsonlens.loadMore", (sentinelNode: JsonNode) => {
      log(`Load more at: ${pathToString(sentinelNode.path)}`);
    }),

    vscode.commands.registerCommand("jsonlens.analyzeFields", (node?: JsonNode) =>
      runAnalyzeFields(node, panelManager)
    ),
    vscode.commands.registerCommand("jsonlens.inferSchema", (node?: JsonNode) =>
      runInferSchema(node, panelManager)
    ),
    vscode.commands.registerCommand("jsonlens.exportSchema", () => {
      // Export is initiated from the webview; this command is a no-op stub kept for package.json
    })
  );
}

async function runInferSchema(node: JsonNode | undefined, panelManager: PanelManager): Promise<void> {
  const target = node ?? getNodeAtCursor();
  if (!target) {
    vscode.window.showWarningMessage("JsonLens: Select an object or array node to infer schema.");
    return;
  }
  if (target.type !== "object" && target.type !== "array") {
    vscode.window.showWarningMessage("JsonLens: Schema inference requires an object or array node.");
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const uri = editor.document.uri.toString();
  const state = documentStore.get(uri);
  if (!state) return;

  panelManager.getOrCreate();
  panelManager.send({ type: "node.loading" });

  try {
    const payload = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "JsonLens: Inferring schema…" },
      () => inferSchemaNode(target, state.rawText)
    );
    log(`Schema: ${payload.stats.nodeCount} nodes`);
    panelManager.send({ type: "schema.result", payload });
  } catch (err) {
    panelManager.send({ type: "error", payload: { message: `Schema inference failed: ${err}` } });
  }
}

async function runAnalyzeFields(node: JsonNode | undefined, panelManager: PanelManager): Promise<void> {
  const target = node ?? getNodeAtCursor();
  if (!target) {
    vscode.window.showWarningMessage("JsonLens: Select an array node to analyze.");
    return;
  }
  if (target.type !== "array") {
    vscode.window.showWarningMessage("JsonLens: Field analysis requires an array node.");
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const uri = editor.document.uri.toString();
  const state = documentStore.get(uri);
  if (!state) return;

  panelManager.getOrCreate();
  panelManager.send({ type: "node.loading" });

  try {
    const payload = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "JsonLens: Analyzing fields…" },
      () => analyzeArrayNode(target, state.rawText)
    );
    log(`Analysis: ${payload.rows.length} keys, ${payload.totalItems} items`);
    panelManager.send({ type: "analysis.result", payload });
  } catch (err) {
    panelManager.send({ type: "error", payload: { message: `Analysis failed: ${err}` } });
  }
}

function openPreview(node: JsonNode | undefined, panelManager: PanelManager): void {
  const target = node ?? getNodeAtCursor();
  if (!target) {
    panelManager.getOrCreate();
    return;
  }
  panelManager.getOrCreate();
  panelManager.send({ type: "node.selected", payload: buildNodePayload(target) });
}

async function runSearch(treeView: vscode.TreeView<JsonNode>): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const uri = editor.document.uri.toString();
  const state = documentStore.get(uri);
  if (!state) {
    vscode.window.showWarningMessage("JsonLens: No parsed document.");
    return;
  }

  if (!state.searchIndex || state.searchIndex.builtAtVersion !== state.version) {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "JsonLens: Indexing…" },
      async () => {
        state.searchIndex = await buildIndex(state.root, state.version);
        log(`Index: ${state.searchIndex.keys.size} keys, ${state.searchIndex.values.size} values`);
      }
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
    navigateTo(sel.match, uri, editor, treeView);
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
  editor: vscode.TextEditor,
  treeView: vscode.TreeView<JsonNode>
): void {
  const node = documentStore.getNodeAtPath(uri, match.path);
  if (!node) return;
  const startPos = editor.document.positionAt(node.range[0]);
  const endPos = editor.document.positionAt(node.range[1]);
  editor.selection = new vscode.Selection(startPos, startPos);
  editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  treeView.reveal(node, { select: true, focus: false, expand: true }).then(undefined, () => {});
}

interface SearchQuickPickItem extends vscode.QuickPickItem {
  match: SearchMatch;
}

function getNodeAtCursor(): JsonNode | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  return documentStore.getNodeAtOffset(
    editor.document.uri.toString(),
    editor.document.offsetAt(editor.selection.active)
  );
}
