import { workerData, parentPort } from "worker_threads";
import { parseDocument } from "../core/parser.js";

// Always use "medium" tier: produces a top-level skeleton with lazy children.
// The "large" tier is identical at this point (stream-json integration is Phase 6+ optimization).
const { text } = workerData as { text: string };
const result = parseDocument(text, "medium");
parentPort?.postMessage(result);
