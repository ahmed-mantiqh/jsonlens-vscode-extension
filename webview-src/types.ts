export type JsonValueType = "object" | "array" | "string" | "number" | "boolean" | "null";

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

export type ExtensionMessage =
  | { type: "node.selected";   payload: NodePayload }
  | { type: "node.loading" }
  | { type: "analysis.result"; payload: AnalysisPayload }
  | { type: "schema.result";   payload: SchemaPayload }
  | { type: "error";           payload: { message: string } };

export type WebviewMessage =
  | { type: "navigate.path";   payload: { path: string } }
  | { type: "copy.value";      payload: { path: string } }
  | { type: "open.url";        payload: { url: string } }
  | { type: "analyze.request"; payload: { path: string } }
  | { type: "schema.request";  payload: { path: string } }
  | { type: "schema.export";   payload: { schema: object } }
  | { type: "ready" };
