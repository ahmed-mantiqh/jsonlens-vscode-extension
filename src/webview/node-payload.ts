import type { JsonNode, Path } from "../core/tree-node.js";
import { pathToString, pathToSegments } from "../core/path-utils.js";
import { detectSemantics } from "../analysis/type-checker.js";
import { LOAD_MORE_SENTINEL } from "../core/parser.js";
import type { NodePayload } from "./message-bridge.js";

const MAX_STRING_LENGTH = 10_000;

export function buildNodePayload(node: JsonNode): NodePayload {
  const breadcrumb = [
    { label: "$", path: "$" },
    ...pathToSegments(node.path).map((seg) => ({
      label: seg.label,
      path: pathToString(seg.path),
    })),
  ];

  let value: unknown = node.value;
  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
    value = value.slice(0, MAX_STRING_LENGTH) + "…(truncated)";
  }

  const semantics = typeof value === "string" ? detectSemantics(value) : null;

  const childPreviews = (node.children ?? [])
    .filter((c) => c.key !== LOAD_MORE_SENTINEL)
    .map((c) => ({
      key: String(c.key ?? ""),
      type: c.type,
      value: c.value,
      childCount: c.childCount,
    }));

  return {
    path: pathToString(node.path),
    type: node.type,
    value,
    semantics,
    breadcrumb,
    childCount: node.childCount,
    childPreviews,
  };
}

export function buildNodePayloadTrail(
  node: JsonNode,
  getNodeAtPath: (path: Path) => JsonNode | null,
): NodePayload[] {
  const columns: NodePayload[] = [];
  for (let depth = 0; depth <= node.path.length; depth++) {
    const trailNode = getNodeAtPath(node.path.slice(0, depth));
    if (trailNode) columns.push(buildNodePayload(trailNode));
  }
  return columns;
}
