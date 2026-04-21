import * as path from "path";
import * as worker_threads from "worker_threads";
import type { JsonNode } from "../core/tree-node.js";
import { pathToString } from "../core/path-utils.js";
import type { SchemaPayload } from "../webview/message-bridge.js";

export const MAX_DEPTH = 20;
const ITEM_SAMPLE = 200;
const ENUM_MAX_UNIQUE = 10;
const REQUIRED_THRESHOLD = 0.8;

const WORKER_PATH = path.join(__dirname, "workers", "schema-worker.js");

// Minimal JSON Schema Draft-07 interface
export interface JSONSchema7 {
  $schema?: string;
  type?: string | string[];
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  items?: JSONSchema7;
  enum?: unknown[];
  format?: string;
  additionalProperties?: boolean;
  // internal — stripped before output
  _raw?: unknown;
}

export interface SchemaResult {
  schema: JSONSchema7;
  nodeCount: number;
}

export interface WorkerInput {
  jsonSlice: string;
  maxDepth: number;
}

let workerAvailable: boolean | undefined;

function checkWorkerAvailable(): boolean {
  if (workerAvailable !== undefined) return workerAvailable;
  try {
    workerAvailable = typeof worker_threads.Worker !== "undefined";
  } catch {
    workerAvailable = false;
  }
  return workerAvailable;
}

export async function inferSchemaNode(
  node: JsonNode,
  rawText: string
): Promise<SchemaPayload> {
  const jsonSlice = rawText.slice(node.range[0], node.range[1]);

  let result: SchemaResult;
  if (checkWorkerAvailable()) {
    result = await runInWorker({ jsonSlice, maxDepth: MAX_DEPTH });
  } else {
    result = inferSchemaSlice(jsonSlice, MAX_DEPTH);
  }

  result.schema.$schema = "http://json-schema.org/draft-07/schema#";

  return {
    schema: result.schema,
    stats: { nodeCount: result.nodeCount, inferredAt: new Date().toISOString() },
  };
}

function runInWorker(input: WorkerInput): Promise<SchemaResult> {
  return new Promise((resolve, reject) => {
    const w = new worker_threads.Worker(WORKER_PATH, { workerData: input });
    const timeout = setTimeout(() => { w.terminate(); reject(new Error("Schema worker timed out")); }, 30_000);
    w.on("message", (result: SchemaResult) => { clearTimeout(timeout); resolve(result); });
    w.on("error", (err) => { clearTimeout(timeout); reject(err); });
    w.on("exit", (code) => {
      if (code !== 0) { clearTimeout(timeout); reject(new Error(`Worker exited with code ${code}`)); }
    });
  });
}

export function inferSchemaSlice(jsonSlice: string, maxDepth: number): SchemaResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    return { schema: {}, nodeCount: 0 };
  }

  const state = { nodeCount: 0 };
  const schema = inferValue(parsed, 0, maxDepth, state);
  stripRaw(schema);
  return { schema, nodeCount: state.nodeCount };
}

function inferValue(val: unknown, depth: number, maxDepth: number, state: { nodeCount: number }): JSONSchema7 {
  state.nodeCount++;
  if (depth > maxDepth) return {};

  if (val === null) return { type: "null" };
  if (typeof val === "boolean") return { type: "boolean" };
  if (typeof val === "number") {
    return { type: Number.isInteger(val) ? "integer" : "number", _raw: val };
  }
  if (typeof val === "string") {
    return { ...inferString(val), _raw: val };
  }
  if (Array.isArray(val)) return inferArray(val, depth, maxDepth, state);
  if (typeof val === "object") return inferObject(val as Record<string, unknown>, depth, maxDepth, state);
  return {};
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function inferString(val: string): JSONSchema7 {
  const s: JSONSchema7 = { type: "string" };
  if (DATE_RE.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      s.format = val.includes("T") ? "date-time" : "date";
      return s;
    }
  }
  try {
    const u = new URL(val);
    if (u.protocol === "https:" || u.protocol === "http:") {
      s.format = "uri";
      return s;
    }
  } catch { /* not a URL */ }
  if (EMAIL_RE.test(val)) {
    s.format = "email";
    return s;
  }
  return s;
}

function inferArray(
  arr: unknown[],
  depth: number,
  maxDepth: number,
  state: { nodeCount: number }
): JSONSchema7 {
  if (arr.length === 0) return { type: "array" };

  const sample = arr.slice(0, ITEM_SAMPLE);
  const itemSchemas = sample.map(item => inferValue(item, depth + 1, maxDepth, state));
  const items = mergeSchemas(itemSchemas);
  stripRaw(items);
  return { type: "array", items };
}

function inferObject(
  obj: Record<string, unknown>,
  depth: number,
  maxDepth: number,
  state: { nodeCount: number }
): JSONSchema7 {
  const keys = Object.keys(obj);
  if (keys.length === 0) return { type: "object" };

  const properties: Record<string, JSONSchema7> = {};
  for (const key of keys) {
    properties[key] = inferValue(obj[key], depth + 1, maxDepth, state);
  }
  return {
    type: "object",
    properties,
    required: keys,
  };
}

export function mergeSchemas(schemas: JSONSchema7[]): JSONSchema7 {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];

  const types = new Set<string>();
  for (const s of schemas) {
    if (Array.isArray(s.type)) {
      for (const t of s.type) types.add(t);
    } else if (s.type) {
      types.add(s.type);
    }
  }

  // All same type
  if (types.size === 1) {
    const type = [...types][0];
    if (type === "object") return mergeObjectSchemas(schemas);
    if (type === "string") return mergeStringSchemas(schemas);
    if (type === "integer" || type === "number") return mergeNumberSchemas(schemas);
    return { type };
  }

  // integer + number → number
  if (types.size === 2 && types.has("integer") && types.has("number")) {
    return mergeNumberSchemas(schemas);
  }

  // Mixed types — no deeper merge
  return { type: [...types].sort() };
}

function mergeObjectSchemas(schemas: JSONSchema7[]): JSONSchema7 {
  const keyCounts = new Map<string, number>();
  const keySchemas = new Map<string, JSONSchema7[]>();

  for (const s of schemas) {
    if (!s.properties) continue;
    for (const key of Object.keys(s.properties)) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      const arr = keySchemas.get(key) ?? [];
      arr.push(s.properties[key]);
      keySchemas.set(key, arr);
    }
  }

  const total = schemas.filter(s => s.properties).length;
  const properties: Record<string, JSONSchema7> = {};
  for (const [key, propSchemas] of keySchemas.entries()) {
    properties[key] = mergeSchemas(propSchemas);
    stripRaw(properties[key]);
  }

  const required = [...keyCounts.entries()]
    .filter(([, count]) => count / total >= REQUIRED_THRESHOLD)
    .map(([key]) => key);

  const result: JSONSchema7 = { type: "object", properties };
  if (required.length > 0) result.required = required;
  return result;
}

function mergeStringSchemas(schemas: JSONSchema7[]): JSONSchema7 {
  // Collect raw values for enum detection
  const rawValues: unknown[] = [];
  const formats = new Set<string>();

  for (const s of schemas) {
    if (s._raw !== undefined) rawValues.push(s._raw);
    if (s.format) formats.add(s.format);
  }

  const uniqueRaw = new Set(rawValues);
  if (rawValues.length > 0 && uniqueRaw.size <= ENUM_MAX_UNIQUE) {
    return { enum: [...uniqueRaw] };
  }

  const result: JSONSchema7 = { type: "string" };
  if (formats.size === 1) result.format = [...formats][0];
  return result;
}

function mergeNumberSchemas(schemas: JSONSchema7[]): JSONSchema7 {
  const hasFloat = schemas.some(s => s.type === "number");
  const rawValues: unknown[] = [];
  for (const s of schemas) {
    if (s._raw !== undefined) rawValues.push(s._raw);
  }
  const uniqueRaw = new Set(rawValues);
  if (rawValues.length > 0 && uniqueRaw.size <= ENUM_MAX_UNIQUE) {
    return { enum: [...uniqueRaw] };
  }
  return { type: hasFloat ? "number" : "integer" };
}

function stripRaw(schema: JSONSchema7): void {
  delete schema._raw;
  if (schema.properties) {
    for (const s of Object.values(schema.properties)) stripRaw(s);
  }
  if (schema.items) stripRaw(schema.items);
}
