import * as vscode from "vscode";
import type { JsonNode } from "../core/tree-node.js";
import * as documentStore from "../core/document-store.js";
import { pathToString } from "../core/path-utils.js";
import { log } from "../utils/logger.js";
import type { JsonTreeProvider } from "../tree/json-tree-provider.js";

export function registerCommands(
  ctx: vscode.ExtensionContext,
  provider: JsonTreeProvider,
  treeView: vscode.TreeView<JsonNode>
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
      const value =
        node.value !== undefined
          ? JSON.stringify(node.value)
          : `[${node.type}]`;
      vscode.env.clipboard.writeText(value);
      vscode.window.setStatusBarMessage(`Copied value`, 2000);
    }),

    vscode.commands.registerCommand("jsonlens.revealInTree", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const uri = editor.document.uri.toString();
      const offset = editor.document.offsetAt(editor.selection.active);
      const node = documentStore.getNodeAtOffset(uri, offset);
      if (node) {
        treeView.reveal(node, { select: true, focus: true, expand: true });
      }
    }),

    vscode.commands.registerCommand("jsonlens.loadMore", (sentinelNode: JsonNode) => {
      // Phase 6 will implement true pagination; for now triggers a provider refresh
      log(`Load more requested at path: ${pathToString(sentinelNode.path)}`);
      provider.refresh(sentinelNode);
    }),

    // Stubs for later phases
    vscode.commands.registerCommand("jsonlens.openPreview", () => {
      vscode.window.showInformationMessage("JsonLens: Preview coming in Phase 3.");
    }),
    vscode.commands.registerCommand("jsonlens.searchTree", () => {
      vscode.window.showInformationMessage("JsonLens: Search coming in Phase 2.");
    }),
    vscode.commands.registerCommand("jsonlens.analyzeFields", () => {
      vscode.window.showInformationMessage("JsonLens: Field analysis coming in Phase 4.");
    }),
    vscode.commands.registerCommand("jsonlens.inferSchema", () => {
      vscode.window.showInformationMessage("JsonLens: Schema inference coming in Phase 5.");
    }),
    vscode.commands.registerCommand("jsonlens.exportSchema", () => {
      vscode.window.showInformationMessage("JsonLens: Schema export coming in Phase 5.");
    })
  );
}

function getNodeAtCursor(): JsonNode | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const uri = editor.document.uri.toString();
  const offset = editor.document.offsetAt(editor.selection.active);
  return documentStore.getNodeAtOffset(uri, offset);
}
