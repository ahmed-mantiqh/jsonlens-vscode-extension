import * as vscode from "vscode";
import type { JsonNode } from "../core/tree-node.js";
import * as documentStore from "../core/document-store.js";
import { ensureLoaded } from "../core/lazy-loader.js";
import { buildTreeItem } from "./json-tree-item.js";
import { log } from "../utils/logger.js";

export class JsonTreeProvider implements vscode.TreeDataProvider<JsonNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<JsonNode | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentUri: string | undefined;

  setDocument(uri: string): void {
    this.currentUri = uri;
    this.refresh();
  }

  refresh(node?: JsonNode): void {
    this._onDidChangeTreeData.fire(node ?? undefined);
  }

  getTreeItem(node: JsonNode): vscode.TreeItem {
    return buildTreeItem(node);
  }

  async getChildren(node?: JsonNode): Promise<JsonNode[]> {
    if (!this.currentUri) return [];

    if (!node) {
      // Root
      const state = documentStore.get(this.currentUri);
      if (!state) return [];
      if (state.root.type !== "object" && state.root.type !== "array") {
        return [state.root];
      }
      return ensureLoaded(state.root, this.currentUri);
    }

    return ensureLoaded(node, this.currentUri);
  }

  getParent(node: JsonNode): JsonNode | undefined {
    if (!this.currentUri || node.path.length === 0) return undefined;
    const parentPath = node.path.slice(0, -1);
    return documentStore.getNodeAtPath(this.currentUri, parentPath) ?? undefined;
  }
}
