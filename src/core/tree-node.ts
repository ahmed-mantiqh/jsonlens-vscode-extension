export type JsonValueType = "object" | "array" | "string" | "number" | "boolean" | "null";

export type Path = (string | number)[];

export interface JsonNode {
  path: Path;
  key: string | number | null;
  type: JsonValueType;
  value?: string | number | boolean | null;
  range: [number, number];
  childCount: number;
  loaded: boolean;
  children?: JsonNode[];
  error?: boolean;
}

export interface ParseError {
  offset: number;
  length: number;
  message: string;
}

export function isBranch(node: JsonNode): boolean {
  return node.type === "object" || node.type === "array";
}

export function isLeaf(node: JsonNode): boolean {
  return !isBranch(node);
}
