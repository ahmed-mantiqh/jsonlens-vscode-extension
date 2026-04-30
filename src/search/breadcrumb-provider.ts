import * as vscode from "vscode";
import type { JsonNode } from "../core/tree-node.js";
import * as documentStore from "../core/document-store.js";
import { LOAD_MORE_SENTINEL } from "../core/parser.js";

const SYMBOL_KIND: Record<string, vscode.SymbolKind> = {
  object:  vscode.SymbolKind.Namespace,
  array:   vscode.SymbolKind.Array,
  string:  vscode.SymbolKind.String,
  number:  vscode.SymbolKind.Number,
  boolean: vscode.SymbolKind.Boolean,
  null:    vscode.SymbolKind.Null,
};

const MAX_SYMBOL_DEPTH = 8;

export class BreadcrumbProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const state = documentStore.get(document.uri.toString());
    if (!state) return [];

    const root = state.root;
    if (root.type !== "object" && root.type !== "array") {
      return [nodeToSymbol(root, document, 0)].filter(Boolean) as vscode.DocumentSymbol[];
    }

    return buildSymbols(root.children ?? [], document, 1);
  }
}

function buildSymbols(
  nodes: JsonNode[],
  document: vscode.TextDocument,
  depth: number
): vscode.DocumentSymbol[] {
  if (depth > MAX_SYMBOL_DEPTH) return [];

  const symbols: vscode.DocumentSymbol[] = [];
  for (const node of nodes) {
    if (node.key === LOAD_MORE_SENTINEL) continue;
    const symbol = nodeToSymbol(node, document, depth);
    if (symbol) symbols.push(symbol);
  }
  return symbols;
}

function nodeToSymbol(
  node: JsonNode,
  document: vscode.TextDocument,
  depth: number
): vscode.DocumentSymbol | null {
  try {
    const name = node.key === null ? "(root)" : String(node.key);
    const detail = node.value !== undefined && node.value !== null
      ? String(node.value).slice(0, 60)
      : node.type;

    const kind = SYMBOL_KIND[node.type] ?? vscode.SymbolKind.Variable;
    const startPos = document.positionAt(node.range[0]);
    const endPos = document.positionAt(Math.min(node.range[1], document.getText().length));
    const range = new vscode.Range(startPos, endPos);

    const symbol = new vscode.DocumentSymbol(name, detail, kind, range, range);

    if (node.children && node.children.length > 0 && depth < MAX_SYMBOL_DEPTH) {
      symbol.children = buildSymbols(node.children, document, depth + 1);
    }

    return symbol;
  } catch {
    return null;
  }
}
