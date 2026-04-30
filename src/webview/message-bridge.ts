import type { JsonValueType } from "../core/tree-node.js";

export type SemanticHint =
  | { kind: "url";   value: string }
  | { kind: "date";  iso: string; display: string }
  | { kind: "color"; hex: string }
  | { kind: "image"; url: string }
  | { kind: "email"; value: string };

export type BreadcrumbSegment = { label: string; path: string };

export type ChildPreview = {
  key: string;
  type: JsonValueType;
  value?: unknown;
  childCount?: number;
};

export type NodePayload = {
  path: string;
  type: JsonValueType;
  value: unknown;
  semantics: SemanticHint | null;
  breadcrumb: BreadcrumbSegment[];
  childCount: number;
  childPreviews: ChildPreview[];
};

export type AnalysisRow = {
  key: string;
  count: number;
  coverage: number;
  types: string[];
  firstPath: string;
  status: "ok" | "inconsistent" | "sparse";
};

export type AnalysisPayload = {
  arrayPath: string;
  rows: AnalysisRow[];
  totalItems: number;
  sampledItems: number;
  skippedNonObjects: number;
};

export type SchemaPayload = {
  schema: object;
  stats: { nodeCount: number; inferredAt: string };
};

export type SearchResultPayload = {
  query: string;
  results: {
    path: string;
    label: string;
    valuePreview: string;
    matchKind: "key" | "value" | "both";
  }[];
};

export type ExtensionMessage =
  | { type: "node.selected";   payload: NodePayload; columns?: NodePayload[] }
  | { type: "node.loading" }
  | { type: "analysis.result"; payload: AnalysisPayload }
  | { type: "schema.result";   payload: SchemaPayload }
  | { type: "search.results";  payload: SearchResultPayload }
  | { type: "error";           payload: { message: string } };

export type WebviewMessage =
  | { type: "navigate.path";   payload: { path: string } }
  | { type: "copy.path";       payload: { path: string } }
  | { type: "copy.value";      payload: { path: string } }
  | { type: "search.query";    payload: { query: string } }
  | { type: "open.url";        payload: { url: string } }
  | { type: "analyze.request"; payload: { path: string } }
  | { type: "schema.request";  payload: { path: string } }
  | { type: "schema.export";   payload: { schema: object } }
  | { type: "ready" };
