import * as vscode from "vscode";
import * as documentStore from "./core/document-store.js";
import { parseDocument } from "./core/parser.js";
import { classifySize, isLikelyBinary } from "./utils/size-guard.js";
import { initLogger, timeAsync, log } from "./utils/logger.js";
import { JsonTreeProvider } from "./tree/json-tree-provider.js";
import { registerCommands } from "./commands/register-commands.js";
import { createIncrementalUpdater } from "./performance/incremental-updater.js";

const SUPPORTED_LANGUAGES = new Set(["json", "jsonc"]);
let treeView: vscode.TreeView<import("./core/tree-node.js").JsonNode> | undefined;
let selectionSyncDebounce: ReturnType<typeof setTimeout> | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  initLogger(ctx);
  log("Activating JsonLens");

  const provider = new JsonTreeProvider();

  treeView = vscode.window.createTreeView("jsonlensTree", {
    treeDataProvider: provider,
    showCollapseAll: true,
    canSelectMany: false,
  });
  ctx.subscriptions.push(treeView);

  registerCommands(ctx, provider, treeView);
  createIncrementalUpdater(provider, ctx);

  // Load active document on activation
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && SUPPORTED_LANGUAGES.has(activeEditor.document.languageId)) {
    loadDocument(activeEditor.document, provider);
  }

  // Switch tree when active editor changes
  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor || !SUPPORTED_LANGUAGES.has(editor.document.languageId)) {
        provider.setDocument("");
        return;
      }
      const uri = editor.document.uri.toString();
      const cached = documentStore.get(uri);
      if (cached) {
        provider.setDocument(uri);
      } else {
        loadDocument(editor.document, provider);
      }
    })
  );

  // Open new documents
  ctx.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (!SUPPORTED_LANGUAGES.has(doc.languageId)) return;
      // Only parse if this doc is currently active (avoid background parse on all open docs)
      const active = vscode.window.activeTextEditor;
      if (active?.document.uri.toString() === doc.uri.toString()) {
        loadDocument(doc, provider);
      }
    })
  );

  // Close: evict from store
  ctx.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      documentStore.invalidate(doc.uri.toString());
    })
  );

  // Cursor sync: editor selection → tree reveal (debounced 200ms)
  ctx.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const editor = event.textEditor;
      if (!SUPPORTED_LANGUAGES.has(editor.document.languageId)) return;
      if (!treeView?.visible) return;

      clearTimeout(selectionSyncDebounce);
      selectionSyncDebounce = setTimeout(() => {
        const uri = editor.document.uri.toString();
        const offset = editor.document.offsetAt(event.selections[0].active);
        const node = documentStore.getNodeAtOffset(uri, offset);
        if (node && treeView) {
          treeView.reveal(node, { select: true, focus: false, expand: false }).then(
            undefined,
            () => {} // ignore reveal errors (node not yet visible)
          );
        }
      }, 200);
    })
  );
}

async function loadDocument(
  doc: vscode.TextDocument,
  provider: JsonTreeProvider
): Promise<void> {
  const uri = doc.uri.toString();
  const text = doc.getText();

  if (isLikelyBinary(text)) {
    log(`Skipping binary file: ${uri}`);
    return;
  }

  const byteLength = Buffer.byteLength(text, "utf8");
  const tier = classifySize(byteLength);
  log(`Parsing ${uri} (${(byteLength / 1024).toFixed(0)} KB, tier=${tier})`);

  try {
    const { root, errors } = await timeAsync(`parse:${tier}`, () =>
      Promise.resolve(parseDocument(text, tier))
    );

    documentStore.set(uri, {
      uri,
      version: doc.version,
      root,
      rawText: text,
      parseErrors: errors,
      lastAccessedAt: Date.now(),
      isLarge: tier !== "small",
    });

    provider.setDocument(uri);

    if (errors.length > 0) {
      log(`Parse errors (${errors.length}) in ${uri}`);
    }
  } catch (err) {
    log(`Failed to parse ${uri}: ${err}`);
  }
}

export function deactivate(): void {
  log("Deactivating JsonLens");
}
