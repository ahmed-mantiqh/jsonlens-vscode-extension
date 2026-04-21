import * as vscode from "vscode";
import * as documentStore from "../core/document-store.js";
import { parseDocument } from "../core/parser.js";
import { clearPageState } from "./virtual-list.js";
import { classifySize } from "../utils/size-guard.js";
import { log } from "../utils/logger.js";
import type { JsonTreeProvider } from "../tree/json-tree-provider.js";
import type { JsonNode } from "../core/tree-node.js";

const STRUCTURAL_CHARS = new Set(["{", "}", "[", "]", ":", ","]);

export function createIncrementalUpdater(
  provider: JsonTreeProvider,
  ctx: vscode.ExtensionContext
): vscode.Disposable {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
    const doc = event.document;
    if (doc.languageId !== "json" && doc.languageId !== "jsonc") return;

    const uri = doc.uri.toString();
    if (!documentStore.get(uri)) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      applyUpdate(doc, event.contentChanges, provider);
    }, 300);
  });

  ctx.subscriptions.push(disposable);
  return disposable;
}

function applyUpdate(
  doc: vscode.TextDocument,
  changes: readonly vscode.TextDocumentContentChangeEvent[],
  provider: JsonTreeProvider
): void {
  const uri = doc.uri.toString();
  const state = documentStore.get(uri);
  if (!state) return;

  const newText = doc.getText();
  const textDelta = newText.length - state.rawText.length;

  // Classify all changes
  const isStructural = changes.some((c) => hasStructuralChar(c.text) || hasStructuralChar(getDeletedText(c, state.rawText)));

  if (!isStructural) {
    // Value-only: patch rawText + leaf values in place without tree refresh
    for (const change of changes) {
      const node = documentStore.getNodeAtOffset(uri, change.rangeOffset);
      if (node?.loaded && node.value !== undefined) {
        const newVal = parseLiteralValue(newText, node.range[0], node.range[0] + change.text.length + (node.range[1] - node.range[0]) - change.rangeLength);
        if (newVal !== undefined) node.value = newVal;
      }
    }
    documentStore.set(uri, { ...state, rawText: newText, version: doc.version, lastAccessedAt: Date.now() });
    log(`Value-only patch: ${uri}`);
    return;
  }

  // Structural change — try to isolate the affected top-level node
  const changeOffset = changes[0].rangeOffset;
  const affectedChild = findTopLevelChild(state.root, changeOffset);

  if (affectedChild && state.root.children) {
    const childIdx = state.root.children.indexOf(affectedChild);

    if (childIdx !== -1 && affectedChild.type === "object" || affectedChild.type === "array") {
      // Reparse just this subtree
      const newChildEnd = affectedChild.range[1] + textDelta;
      const slice = newText.slice(affectedChild.range[0], newChildEnd);

      const { root: newSubtree } = parseDocument(slice, "small");
      newSubtree.path = affectedChild.path;
      newSubtree.key = affectedChild.key;
      offsetRanges(newSubtree, affectedChild.range[0]);

      state.root.children[childIdx] = newSubtree;

      // Shift ranges of subsequent siblings
      for (let i = childIdx + 1; i < state.root.children.length; i++) {
        offsetRanges(state.root.children[i], textDelta);
      }

      // Shift root range end
      state.root.range[1] += textDelta;

      documentStore.set(uri, { ...state, rawText: newText, version: doc.version, lastAccessedAt: Date.now() });
      clearPageState(uri);
      provider.refresh(newSubtree);
      log(`Subtree reparse: ${uri} @ [${affectedChild.range[0]}, ${newChildEnd}]`);
      return;
    }
  }

  // Fallback: full reparse
  log(`Full reparse: ${uri} (structural, no isolatable subtree)`);
  const tier = classifySize(Buffer.byteLength(newText, "utf8"));
  const { root, errors } = parseDocument(newText, tier);
  documentStore.set(uri, { ...state, version: doc.version, root, rawText: newText, parseErrors: errors, lastAccessedAt: Date.now() });
  clearPageState(uri);
  provider.refresh();
}

function findTopLevelChild(root: JsonNode, offset: number): JsonNode | null {
  if (!root.children) return null;
  // Binary search on children sorted by range
  let lo = 0;
  let hi = root.children.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const child = root.children[mid];
    if (offset < child.range[0]) hi = mid - 1;
    else if (offset >= child.range[1]) lo = mid + 1;
    else return child;
  }
  return null;
}

function offsetRanges(node: JsonNode, delta: number): void {
  const stack: JsonNode[] = [node];
  while (stack.length > 0) {
    const n = stack.pop()!;
    n.range[0] += delta;
    n.range[1] += delta;
    if (n.children) {
      for (const child of n.children) stack.push(child);
    }
  }
}

function hasStructuralChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (STRUCTURAL_CHARS.has(text[i])) return true;
  }
  return false;
}

function getDeletedText(change: vscode.TextDocumentContentChangeEvent, rawText: string): string {
  if (change.rangeLength === 0) return "";
  return rawText.slice(change.rangeOffset, change.rangeOffset + change.rangeLength);
}

function parseLiteralValue(text: string, start: number, end: number): string | number | boolean | null | undefined {
  const slice = text.slice(start, end).trim();
  if (slice === "null") return null;
  if (slice === "true") return true;
  if (slice === "false") return false;
  const n = Number(slice);
  if (!isNaN(n) && slice !== "") return n;
  if (slice.startsWith('"') && slice.endsWith('"')) {
    try { return JSON.parse(slice) as string; } catch { /* skip */ }
  }
  return undefined;
}
