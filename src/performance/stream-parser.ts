import * as path from "path";
import * as worker_threads from "worker_threads";
import type { JsonNode, ParseError } from "../core/tree-node.js";
import { parseDocument } from "../core/parser.js";

// stream-json is available as a dep for future chunked-streaming optimization.
// Current implementation uses a worker thread to keep the extension host non-blocking.
// stream-json could replace the worker for files already in memory once its async
// pipeline is wired with position tracking.

const WORKER_PATH = path.join(__dirname, "workers", "parse-worker.js");

export interface ParseResult {
  root: JsonNode;
  errors: ParseError[];
}

export async function parseLargeAsync(text: string): Promise<ParseResult> {
  let workerAvailable = false;
  try {
    workerAvailable = typeof worker_threads.Worker !== "undefined";
  } catch { /* unavailable in some remote environments */ }

  if (workerAvailable) {
    return runParseWorker(text);
  }

  // Fallback: synchronous parse with a single setImmediate to let VS Code render first
  return new Promise((resolve) => {
    setImmediate(() => resolve(parseDocument(text, "medium")));
  });
}

function runParseWorker(text: string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const w = new worker_threads.Worker(WORKER_PATH, { workerData: { text } });
    const timeout = setTimeout(() => { w.terminate(); reject(new Error("Parse worker timed out")); }, 60_000);
    w.on("message", (result: ParseResult) => { clearTimeout(timeout); resolve(result); });
    w.on("error", (err) => { clearTimeout(timeout); reject(err); });
    w.on("exit", (code) => {
      if (code !== 0) { clearTimeout(timeout); reject(new Error(`Parse worker exited ${code}`)); }
    });
  });
}
