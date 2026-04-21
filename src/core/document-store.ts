import type { JsonNode, ParseError, Path } from "./tree-node.js";
import type { SearchIndex } from "../search/searcher.js";
import { pathEquals, isAncestor } from "./path-utils.js";

export interface ParsedDocumentState {
  uri: string;
  version: number;
  root: JsonNode;
  rawText: string;
  parseErrors: ParseError[];
  lastAccessedAt: number;
  searchIndex?: SearchIndex;
  isLarge: boolean;
}

const MAX_ENTRIES = 5;
const IDLE_EVICT_MS = 60_000;       // evict deep children after 60s idle
const IDLE_EVICT_INTERVAL_MS = 30_000;
const store = new Map<string, ParsedDocumentState>();

// Periodically unload deep children (depth ≥ 2) that haven't been accessed recently.
// Top-level children are kept so the tree sidebar remains usable.
const evictTimer = setInterval(() => {
  const now = Date.now();
  for (const state of store.values()) {
    if (now - state.lastAccessedAt > IDLE_EVICT_MS) {
      evictDeepChildren(state.root, 0);
    }
  }
}, IDLE_EVICT_INTERVAL_MS);
evictTimer.unref?.(); // don't keep Node.js process alive

function evictDeepChildren(node: JsonNode, depth: number): void {
  if (!node.children) return;
  if (depth >= 1) {
    // Unload this node's children (they can be re-loaded on expand)
    node.loaded = false;
    node.children = undefined;
    return;
  }
  for (const child of node.children) {
    evictDeepChildren(child, depth + 1);
  }
}

export function get(uri: string): ParsedDocumentState | undefined {
  const state = store.get(uri);
  if (state) state.lastAccessedAt = Date.now();
  return state;
}

export function set(uri: string, state: ParsedDocumentState): void {
  evictIfNeeded(uri);
  store.set(uri, state);
}

export function invalidate(uri: string): void {
  store.delete(uri);
}

export function getNodeAtPath(uri: string, path: Path): JsonNode | null {
  const state = get(uri);
  if (!state) return null;
  return walkPath(state.root, path);
}

export function getNodeAtOffset(uri: string, offset: number): JsonNode | null {
  const state = get(uri);
  if (!state) return null;
  return findByOffset(state.root, offset);
}

function walkPath(node: JsonNode, path: Path): JsonNode | null {
  if (path.length === 0) return node;
  if (!node.children) return null;

  const [head, ...tail] = path;
  for (const child of node.children) {
    if (child.key === head) {
      return walkPath(child, tail);
    }
  }
  return null;
}

function findByOffset(node: JsonNode, offset: number): JsonNode | null {
  if (offset < node.range[0] || offset >= node.range[1]) return null;
  if (!node.children || node.children.length === 0) return node;

  // Binary search: find child whose range contains offset
  let lo = 0;
  let hi = node.children.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const child = node.children[mid];
    if (offset < child.range[0]) {
      hi = mid - 1;
    } else if (offset >= child.range[1]) {
      lo = mid + 1;
    } else {
      // Recurse into this child
      return findByOffset(child, offset) ?? child;
    }
  }
  return node;
}

function evictIfNeeded(incomingUri: string): void {
  if (store.size < MAX_ENTRIES) return;
  if (store.has(incomingUri)) return; // update in place, no eviction needed

  let lruKey = "";
  let lruTime = Infinity;
  for (const [key, state] of store) {
    if (state.lastAccessedAt < lruTime) {
      lruTime = state.lastAccessedAt;
      lruKey = key;
    }
  }
  if (lruKey) store.delete(lruKey);
}

export function findNodesUnderPath(uri: string, path: Path): JsonNode[] {
  const state = get(uri);
  if (!state) return [];
  const results: JsonNode[] = [];
  collectUnder(state.root, path, results);
  return results;
}

function collectUnder(node: JsonNode, prefix: Path, results: JsonNode[]): void {
  if (pathEquals(node.path, prefix) || isAncestor(prefix, node.path)) {
    results.push(node);
  }
  if (node.children) {
    for (const child of node.children) {
      collectUnder(child, prefix, results);
    }
  }
}
