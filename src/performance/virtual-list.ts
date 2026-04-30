import type { JsonNode } from "../core/tree-node.js";
import * as documentStore from "../core/document-store.js";
import { loadChildrenAll, LOAD_MORE_SENTINEL } from "../core/parser.js";
import { getConfig } from "../utils/config.js";
import type { JsonTreeProvider } from "../tree/json-tree-provider.js";

// Tracks how many children have been revealed per node (uri → pathString → offset)
const pageOffsets = new Map<string, Map<string, number>>();

export function getPageOffset(uri: string, pathStr: string): number {
  return pageOffsets.get(uri)?.get(pathStr) ?? 0;
}

export function clearPageState(uri: string): void {
  pageOffsets.delete(uri);
}

export function handleLoadMore(
  sentinelNode: JsonNode,
  uri: string,
  provider: JsonTreeProvider
): void {
  const state = documentStore.get(uri);
  if (!state) return;

  // Parent path = sentinel path minus the sentinel key
  const parentPath = sentinelNode.path.slice(0, -1);
  const parent = documentStore.getNodeAtPath(uri, parentPath);
  if (!parent || !parent.children) return;

  // Find sentinel position in parent's children
  const sentinelIdx = parent.children.findIndex(c => c.key === LOAD_MORE_SENTINEL);
  if (sentinelIdx === -1) return;

  // Number of real children already shown
  const alreadyShown = sentinelIdx;
  const remaining = (sentinelNode as JsonNode & { _remaining?: number })._remaining ?? 0;
  if (remaining === 0) return;

  // Load all children (no pagination), then take the next page
  const allChildren = loadChildrenAll(parent, state.rawText);
  const { maxChildrenPerNode } = getConfig();
  const nextBatch = allChildren.slice(alreadyShown, alreadyShown + maxChildrenPerNode);
  const newRemaining = allChildren.length - alreadyShown - nextBatch.length;

  // Replace sentinel with the next batch
  parent.children.splice(sentinelIdx, 1, ...nextBatch);

  if (newRemaining > 0) {
    const sentinel: JsonNode & { _remaining: number } = {
      path: [...parentPath, LOAD_MORE_SENTINEL],
      key: LOAD_MORE_SENTINEL,
      type: "null",
      value: null,
      range: [state.rawText.length, state.rawText.length],
      childCount: 0,
      loaded: true,
      _remaining: newRemaining,
    };
    parent.children.push(sentinel);
  }

  provider.refresh(parent);
}
