import type { JsonNode, Path } from "../core/tree-node.js";
import { pathToString } from "../core/path-utils.js";
import { LOAD_MORE_SENTINEL } from "../core/parser.js";

export interface SearchIndex {
  keys: Map<string, Path[]>;
  values: Map<string, Path[]>;
  builtAtVersion: number;
}

export interface SearchMatch {
  path: Path;
  pathStr: string;
  label: string;
  valuePreview: string;
  matchKind: "key" | "value" | "both";
  score: number;
}

const MAX_INDEX_ENTRIES = 50_000;
const MAX_VALUE_LENGTH = 200;
const MAX_PATHS_PER_KEY = 50;
const CHUNK_SIZE = 500;

export function buildIndex(root: JsonNode, version: number): Promise<SearchIndex> {
  return new Promise((resolve) => {
    const index: SearchIndex = {
      keys: new Map(),
      values: new Map(),
      builtAtVersion: version,
    };

    const stack: JsonNode[] = [root];
    let totalEntries = 0;

    function chunk(): void {
      let processed = 0;

      while (stack.length > 0 && processed < CHUNK_SIZE && totalEntries < MAX_INDEX_ENTRIES) {
        const node = stack.pop()!;
        processed++;

        if (node.key !== null && node.key !== LOAD_MORE_SENTINEL && node.path.length > 0) {
          const k = String(node.key).toLowerCase();
          if (!index.keys.has(k)) {
            index.keys.set(k, []);
            totalEntries++;
          }
          const paths = index.keys.get(k)!;
          if (paths.length < MAX_PATHS_PER_KEY) paths.push(node.path);
        }

        if (node.value !== undefined && node.value !== null) {
          const v = String(node.value).slice(0, MAX_VALUE_LENGTH).toLowerCase();
          if (!index.values.has(v)) {
            index.values.set(v, []);
            totalEntries++;
          }
          const paths = index.values.get(v)!;
          if (paths.length < MAX_PATHS_PER_KEY) paths.push(node.path);
        }

        if (node.children) {
          for (const child of node.children) {
            if (child.key !== LOAD_MORE_SENTINEL) stack.push(child);
          }
        }
      }

      if (stack.length > 0 && totalEntries < MAX_INDEX_ENTRIES) {
        setImmediate(chunk);
      } else {
        resolve(index);
      }
    }

    setImmediate(chunk);
  });
}

export function query(
  index: SearchIndex,
  input: string,
  scope: "keys" | "values" | "both",
  limit = 200
): SearchMatch[] {
  const q = input.toLowerCase().trim();
  if (!q) return [];

  const results = new Map<string, SearchMatch>();

  if (scope === "keys" || scope === "both") {
    for (const [key, paths] of index.keys) {
      const score = scoreMatch(key, q);
      if (score === 0) continue;
      for (const path of paths) {
        const pathStr = pathToString(path);
        const existing = results.get(pathStr);
        if (!existing || score > existing.score) {
          results.set(pathStr, {
            path,
            pathStr,
            label: String(path[path.length - 1] ?? "(root)"),
            valuePreview: existing?.valuePreview ?? "",
            matchKind: existing ? "both" : "key",
            score,
          });
        }
      }
    }
  }

  if (scope === "values" || scope === "both") {
    for (const [value, paths] of index.values) {
      const score = scoreMatch(value, q);
      if (score === 0) continue;
      for (const path of paths) {
        const pathStr = pathToString(path);
        const existing = results.get(pathStr);
        if (!existing) {
          results.set(pathStr, {
            path,
            pathStr,
            label: String(path[path.length - 1] ?? "(root)"),
            valuePreview: value.slice(0, 80),
            matchKind: "value",
            score,
          });
        } else {
          if (score > existing.score) existing.score = score;
          existing.matchKind = "both";
          if (!existing.valuePreview) existing.valuePreview = value.slice(0, 80);
        }
      }
    }
  }

  return [...results.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function scoreMatch(text: string, q: string): number {
  if (text === q) return 100;
  if (text.startsWith(q)) return 80;
  if (text.includes(q)) return 60;
  return 0;
}
