import * as path from "path";
import * as worker_threads from "worker_threads";
import type { JsonNode } from "../core/tree-node.js";
import { pathToString } from "../core/path-utils.js";
import type { AnalysisPayload, AnalysisRow } from "../webview/message-bridge.js";

const MAX_ITEMS = 10_000;
const WORKER_PATH = path.join(__dirname, "workers", "analysis-worker.js");

let workerAvailable: boolean | undefined;

function checkWorkerAvailable(): boolean {
  if (workerAvailable !== undefined) return workerAvailable;
  try {
    // worker_threads may be unavailable in some VS Code remote environments
    workerAvailable = typeof worker_threads.Worker !== "undefined";
  } catch {
    workerAvailable = false;
  }
  return workerAvailable;
}

export async function analyzeArrayNode(
  node: JsonNode,
  rawText: string
): Promise<AnalysisPayload> {
  const arrayPath = pathToString(node.path);
  const jsonSlice = rawText.slice(node.range[0], node.range[1]);

  if (checkWorkerAvailable()) {
    return runInWorker({ jsonSlice, arrayPath, maxItems: MAX_ITEMS });
  }
  return runInline(jsonSlice, arrayPath);
}

function runInWorker(input: WorkerInput): Promise<AnalysisPayload> {
  return new Promise((resolve, reject) => {
    const w = new worker_threads.Worker(WORKER_PATH, { workerData: input });
    const timeout = setTimeout(() => { w.terminate(); reject(new Error("Analysis worker timed out")); }, 30_000);
    w.on("message", (result: AnalysisPayload) => { clearTimeout(timeout); resolve(result); });
    w.on("error", (err) => { clearTimeout(timeout); reject(err); });
    w.on("exit", (code) => {
      if (code !== 0) { clearTimeout(timeout); reject(new Error(`Worker exited with code ${code}`)); }
    });
  });
}

export interface WorkerInput {
  jsonSlice: string;
  arrayPath: string;
  maxItems: number;
}

async function runInline(jsonSlice: string, arrayPath: string): Promise<AnalysisPayload> {
  return new Promise((resolve) => {
    setImmediate(() => {
      const result = analyzeSlice(jsonSlice, arrayPath, MAX_ITEMS);
      resolve(result);
    });
  });
}

export function analyzeSlice(
  jsonSlice: string,
  arrayPath: string,
  maxItems: number
): AnalysisPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    return { arrayPath, rows: [], totalItems: 0, sampledItems: 0, skippedNonObjects: 0 };
  }

  if (!Array.isArray(parsed)) {
    return { arrayPath, rows: [], totalItems: 0, sampledItems: 0, skippedNonObjects: 0 };
  }

  const totalItems = parsed.length;
  const items = parsed.slice(0, maxItems);
  const sampledItems = items.length;

  // key → { count, types seen, first index }
  const keyStats = new Map<string, { count: number; types: Set<string>; firstIndex: number }>();
  let skippedNonObjects = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      skippedNonObjects++;
      continue;
    }
    const obj = item as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const type = typeOf(val);
      let stat = keyStats.get(key);
      if (!stat) {
        stat = { count: 0, types: new Set(), firstIndex: i };
        keyStats.set(key, stat);
      }
      stat.count++;
      stat.types.add(type);
    }
  }

  const objectItems = sampledItems - skippedNonObjects;

  const rows: AnalysisRow[] = [];
  for (const [key, stat] of keyStats.entries()) {
    const coverage = objectItems > 0 ? stat.count / objectItems : 0;
    const types = [...stat.types].sort();
    let status: AnalysisRow["status"] = "ok";
    if (types.length > 1) status = "inconsistent";
    else if (coverage < 0.8) status = "sparse";

    rows.push({
      key,
      count: stat.count,
      coverage,
      types,
      firstPath: `${arrayPath}[${stat.firstIndex}]["${key}"]`,
      status,
    });
  }

  rows.sort((a, b) => b.count - a.count);

  return { arrayPath, rows, totalItems, sampledItems, skippedNonObjects };
}

function typeOf(val: unknown): string {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  return typeof val;
}
