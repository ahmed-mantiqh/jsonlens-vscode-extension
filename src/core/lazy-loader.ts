import type { JsonNode } from "./tree-node.js";
import { loadChildren } from "./parser.js";
import * as documentStore from "./document-store.js";

export async function ensureLoaded(node: JsonNode, uri: string): Promise<JsonNode[]> {
  if (node.loaded && node.children !== undefined) {
    return node.children;
  }

  const state = documentStore.get(uri);
  if (!state) return [];

  const children = loadChildren(node, state.rawText);
  node.children = children;
  node.loaded = true;
  node.childCount = children.filter((c) => c.key !== " more").length;

  return children;
}
