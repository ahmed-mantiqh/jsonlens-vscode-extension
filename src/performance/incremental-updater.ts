import * as vscode from "vscode";
import * as documentStore from "../core/document-store.js";
import { parseDocument } from "../core/parser.js";
import { classifySize } from "../utils/size-guard.js";
import { log } from "../utils/logger.js";
import type { JsonTreeProvider } from "../tree/json-tree-provider.js";

// Characters that signal structural change when added/removed
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
    const state = documentStore.get(uri);
    if (!state) return;

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

  // Check if any change is structural
  const isStructural = changes.some((c) => {
    const text = c.text;
    for (let i = 0; i < text.length; i++) {
      if (STRUCTURAL_CHARS.has(text[i])) return true;
    }
    // Also structural if rangeLength > 0 (deletion) and deleted region had structural chars
    if (c.rangeLength > 0) {
      const deleted = state.rawText.slice(c.rangeOffset, c.rangeOffset + c.rangeLength);
      for (let i = 0; i < deleted.length; i++) {
        if (STRUCTURAL_CHARS.has(deleted[i])) return true;
      }
    }
    return false;
  });

  const newText = doc.getText();

  if (!isStructural) {
    // Value-only patch: update rawText and re-parse only affected leaf values
    // For correctness in Phase 1, fall through to full reparse.
    // Phase 6 will add true value-only patching.
  }

  // Full reparse (safe path)
  log(`Reparsing ${uri} (structural=${isStructural})`);
  const tier = classifySize(Buffer.byteLength(newText, "utf8"));
  const { root, errors } = parseDocument(newText, tier);

  documentStore.set(uri, {
    ...state,
    version: doc.version,
    root,
    rawText: newText,
    parseErrors: errors,
    lastAccessedAt: Date.now(),
  });

  provider.refresh();
}
