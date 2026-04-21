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

export type AnalysisPayload = {
  keyFrequency: Record<string, number>;
  typeInconsistencies: TypeInconsistency[];
  totalItems: number;
  sampledItems: number;
};

export type TypeInconsistency = {
  key: string;
  seenTypes: string[];
  occurrences: number;
};

export type SchemaPayload = {
  schema: object;
  stats: { nodeCount: number; inferredAt: string };
};

export type ExtensionMessage =
  | { type: "node.selected"; payload: NodePayload }
  | { type: "node.loading" }
  | { type: "error"; payload: { message: string } };

export type WebviewMessage =
  | { type: "navigate.path"; payload: { path: string } }
  | { type: "copy.value";    payload: { path: string } }
  | { type: "open.url";      payload: { url: string } }
  | { type: "ready" };
