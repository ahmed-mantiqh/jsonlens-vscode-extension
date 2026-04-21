import * as vscode from "vscode";
import * as documentStore from "./core/document-store.js";
import { parseDocument } from "./core/parser.js";
import { classifySize, isLikelyBinary } from "./utils/size-guard.js";
import { initLogger, timeAsync, log } from "./utils/logger.js";
import { JsonTreeProvider } from "./tree/json-tree-provider.js";
import { registerCommands } from "./commands/register-commands.js";
import { createIncrementalUpdater } from "./performance/incremental-updater.js";
import { BreadcrumbProvider } from "./search/breadcrumb-provider.js";
import { PanelManager } from "./webview/panel-manager.js";
import { buildNodePayload } from "./webview/node-payload.js";
import { stringToPath } from "./core/path-utils.js";
import { analyzeArrayNode } from "./analysis/field-analyzer.js";
import { inferSchemaNode } from "./analysis/schema-inferrer.js";
import { parseLargeAsync } from "./performance/stream-parser.js";
import { clearPageState } from "./performance/virtual-list.js";
import type { JsonNode } from "./core/tree-node.js";

const SUPPORTED = new Set(["json", "jsonc"]);
let treeView: vscode.TreeView<JsonNode> | undefined;
let selectionSyncDebounce: ReturnType<typeof setTimeout> | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  initLogger(ctx);
  log("Activating JsonLens");

  const provider = new JsonTreeProvider();
  const panelManager = new PanelManager(ctx);

  treeView = vscode.window.createTreeView("jsonlensTree", {
    treeDataProvider: provider,
    showCollapseAll: true,
    canSelectMany: false,
  });
  ctx.subscriptions.push(treeView);

  registerCommands(ctx, treeView, panelManager, provider);
  createIncrementalUpdater(provider, ctx);

  ctx.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      [{ language: "json" }, { language: "jsonc" }],
      new BreadcrumbProvider()
    )
  );

  // Tree selection → webview
  ctx.subscriptions.push(
    treeView.onDidChangeSelection((e) => {
      if (!panelManager.isOpen()) return;
      const node = e.selection[0];
      if (!node) return;
      panelManager.send({ type: "node.selected", payload: buildNodePayload(node) });
    })
  );

  // Webview → extension messages
  panelManager.onMessage((msg) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const uri = editor.document.uri.toString();

    if (msg.type === "navigate.path") {
      const path = stringToPath(msg.payload.path);
      const node = documentStore.getNodeAtPath(uri, path);
      if (node && treeView) {
        treeView.reveal(node, { select: true, focus: false, expand: true }).then(undefined, () => {});
        const pos = editor.document.positionAt(node.range[0]);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      }
    } else if (msg.type === "copy.value") {
      const path = stringToPath(msg.payload.path);
      const node = documentStore.getNodeAtPath(uri, path);
      if (node) {
        const text = node.value !== undefined ? JSON.stringify(node.value) : `[${node.type}]`;
        vscode.env.clipboard.writeText(text);
        vscode.window.setStatusBarMessage("Copied value", 2000);
      }
    } else if (msg.type === "open.url") {
      vscode.env.openExternal(vscode.Uri.parse(msg.payload.url));
    } else if (msg.type === "analyze.request") {
      const path = stringToPath(msg.payload.path);
      const node = documentStore.getNodeAtPath(uri, path);
      if (!node || node.type !== "array") return;
      const state = documentStore.get(uri);
      if (!state) return;
      panelManager.send({ type: "node.loading" });
      analyzeArrayNode(node, state.rawText).then(
        (payload) => panelManager.send({ type: "analysis.result", payload }),
        (err) => panelManager.send({ type: "error", payload: { message: `Analysis failed: ${err}` } })
      );
    } else if (msg.type === "schema.request") {
      const path = stringToPath(msg.payload.path);
      const node = documentStore.getNodeAtPath(uri, path);
      if (!node || (node.type !== "object" && node.type !== "array")) return;
      const state = documentStore.get(uri);
      if (!state) return;
      panelManager.send({ type: "node.loading" });
      inferSchemaNode(node, state.rawText).then(
        (payload) => panelManager.send({ type: "schema.result", payload }),
        (err) => panelManager.send({ type: "error", payload: { message: `Schema inference failed: ${err}` } })
      );
    } else if (msg.type === "schema.export") {
      const content = JSON.stringify(msg.payload.schema, null, 2);
      vscode.workspace.openTextDocument({ language: "json", content }).then(
        (doc) => vscode.window.showTextDocument(doc, { preview: false }),
        () => {}
      );
    } else if (msg.type === "ready") {
      // Re-send current selection on webview ready (panel reload/reveal)
      const sel = treeView?.selection[0];
      const node = sel ?? getNodeAtCursor(editor);
      if (node) panelManager.send({ type: "node.selected", payload: buildNodePayload(node) });
    }
  });

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && SUPPORTED.has(activeEditor.document.languageId)) {
    loadDocument(activeEditor.document, provider);
  }

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor || !SUPPORTED.has(editor.document.languageId)) {
        provider.setDocument(""); return;
      }
      const uri = editor.document.uri.toString();
      if (documentStore.get(uri)) {
        provider.setDocument(uri);
      } else {
        loadDocument(editor.document, provider);
      }
    })
  );

  ctx.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (!SUPPORTED.has(doc.languageId)) return;
      const active = vscode.window.activeTextEditor;
      if (active?.document.uri.toString() === doc.uri.toString()) {
        loadDocument(doc, provider);
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

  ctx.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const editor = event.textEditor;
      if (!SUPPORTED.has(editor.document.languageId)) return;
      if (!treeView?.visible) return;

      clearTimeout(selectionSyncDebounce);
      selectionSyncDebounce = setTimeout(() => {
        const uri = editor.document.uri.toString();
        const offset = editor.document.offsetAt(event.selections[0].active);
        const node = documentStore.getNodeAtOffset(uri, offset);
        if (node && treeView) {
          treeView.reveal(node, { select: true, focus: false, expand: false }).then(undefined, () => {});
        }
      }, 200);
    })
  );
}

async function loadDocument(doc: vscode.TextDocument, provider: JsonTreeProvider): Promise<void> {
  const uri = doc.uri.toString();
  const text = doc.getText();

  if (isLikelyBinary(text)) { log(`Skipping binary: ${uri}`); return; }

  const byteLength = Buffer.byteLength(text, "utf8");
  const tier = classifySize(byteLength);
  log(`Parsing ${uri} (${(byteLength / 1024).toFixed(0)} KB, tier=${tier})`);

  try {
    const parseResult = tier === "large"
      ? await timeAsync(`parse:worker`, () => parseLargeAsync(text))
      : await timeAsync(`parse:${tier}`, () => Promise.resolve(parseDocument(text, tier)));

    const { root, errors } = parseResult;
    documentStore.set(uri, {
      uri, version: doc.version, root, rawText: text,
      parseErrors: errors, lastAccessedAt: Date.now(), isLarge: tier !== "small",
    });
    provider.setDocument(uri);
    if (errors.length) log(`Parse errors (${errors.length}) in ${uri}`);
  } catch (err) {
    log(`Failed to parse ${uri}: ${err}`);
  }
}

function getNodeAtCursor(editor: vscode.TextEditor): JsonNode | null {
  return documentStore.getNodeAtOffset(
    editor.document.uri.toString(),
    editor.document.offsetAt(editor.selection.active)
  );
}

export function deactivate(): void {
  log("Deactivating JsonLens");
}
