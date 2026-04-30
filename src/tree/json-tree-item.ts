import * as vscode from "vscode";
import type { JsonNode } from "../core/tree-node.js";
import { LOAD_MORE_SENTINEL } from "../core/parser.js";

const TYPE_ICON: Record<string, vscode.ThemeIcon> = {
  object:  new vscode.ThemeIcon("symbol-namespace"),
  array:   new vscode.ThemeIcon("symbol-array"),
  string:  new vscode.ThemeIcon("symbol-string"),
  number:  new vscode.ThemeIcon("symbol-number"),
  boolean: new vscode.ThemeIcon("symbol-boolean"),
  null:    new vscode.ThemeIcon("symbol-null"),
};

export function buildTreeItem(node: JsonNode): vscode.TreeItem {
  if (node.key === LOAD_MORE_SENTINEL) {
    const remaining = (node as JsonNode & { _remaining?: number })._remaining ?? 0;
    const item = new vscode.TreeItem(`… (${remaining} more)`, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "loadMore";
    item.command = {
      command: "jsonlens.loadMore",
      title: "Load More",
      arguments: [node],
    };
    return item;
  }

  const label = node.key === null ? "(root)" : String(node.key);
  const collapsible =
    node.type === "object" || node.type === "array"
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

  const item = new vscode.TreeItem(label, collapsible);
  item.iconPath = node.error
    ? new vscode.ThemeIcon("warning", new vscode.ThemeColor("list.warningForeground"))
    : TYPE_ICON[node.type];

  item.description = buildDescription(node);
  item.tooltip = buildTooltip(node);
  item.contextValue = node.type;

  return item;
}

function buildDescription(node: JsonNode): string {
  switch (node.type) {
    case "object":
      return `{${node.childCount} ${node.childCount === 1 ? "key" : "keys"}}`;
    case "array":
      return `[${node.childCount} ${node.childCount === 1 ? "item" : "items"}]`;
    case "string":
      return truncate(String(node.value ?? ""), 60);
    case "number":
    case "boolean":
      return String(node.value ?? "");
    case "null":
      return "null";
    default:
      return "";
  }
}

function buildTooltip(node: JsonNode): string {
  if (node.type === "string") return String(node.value ?? "");
  if (node.type === "number" || node.type === "boolean") return String(node.value ?? "");
  if (node.type === "null") return "null";
  return node.type;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
