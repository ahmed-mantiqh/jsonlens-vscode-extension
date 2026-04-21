import * as vscode from "vscode";
import * as documentStore from "./document-store.js";
import { parseDocument } from "./parser.js";
import { classifySize, isLikelyBinary } from "../utils/size-guard.js";
import { timeAsync, log } from "../utils/logger.js";
import { parseLargeAsync } from "../performance/stream-parser.js";
import type { JsonTreeProvider } from "../tree/json-tree-provider.js";

export async function loadDocument(
  doc: vscode.TextDocument,
  provider: JsonTreeProvider,
): Promise<void> {
  const uri = doc.uri.toString();
  const text = doc.getText();

  if (isLikelyBinary(text)) { log(`Skipping binary: ${uri}`); return; }

  const byteLength = Buffer.byteLength(text, "utf8");
  const tier = classifySize(byteLength);
  log(`Parsing ${uri} (${(byteLength / 1024).toFixed(0)} KB, tier=${tier})`);

  try {
    const parseResult = tier === "large"
      ? await timeAsync("parse:worker", () => parseLargeAsync(text))
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
