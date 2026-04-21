import React from "react";
import { postMessage } from "../vscode-api.js";
import type { ChildPreview, JsonValueType } from "../types.js";

interface Props {
  childCount: number;
  childPreviews: ChildPreview[];
  path: string;
}

export function ArraySummary({ childCount, childPreviews, path }: Props) {
  const shown = childPreviews.length;
  const hidden = childCount - shown;

  // Compute type distribution
  const typeCounts = new Map<JsonValueType, number>();
  for (const c of childPreviews) {
    typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + 1);
  }

  const hasObjects = typeCounts.has("object");

  return (
    <div>
      <div style={s.meta}>
        <span>{childCount} {childCount === 1 ? "item" : "items"}</span>
        {typeCounts.size > 1 && (
          <span style={s.mixed}> · mixed types</span>
        )}
        {hasObjects && (
          <button
            style={s.analyzeBtn}
            onClick={() => postMessage({ type: "analyze.request", payload: { path } })}
          >
            Analyze Fields
          </button>
        )}
      </div>

      {typeCounts.size > 1 && (
        <div style={s.dist}>
          {[...typeCounts.entries()].map(([type, count]) => (
            <span key={type} style={s.badge}>
              {type} ×{count}
            </span>
          ))}
        </div>
      )}

      <div style={s.list}>
        {childPreviews.map((c, i) => (
          <div key={i} style={s.item}>
            <span
              style={s.idx}
              onClick={() => postMessage({ type: "navigate.path", payload: { path: `${path}[${i}]` } })}
            >
              [{i}]
            </span>
            <span style={s.val}>{formatItem(c)}</span>
            <span style={s.type}>{c.type}</span>
          </div>
        ))}
        {hidden > 0 && (
          <div style={s.more}>… {hidden} more {hidden === 1 ? "item" : "items"}</div>
        )}
      </div>
    </div>
  );
}

function formatItem(c: ChildPreview): string {
  if (c.type === "object") return `{${c.childCount ?? "?"} keys}`;
  if (c.type === "array")  return `[${c.childCount ?? "?"} items]`;
  if (c.type === "null")   return "null";
  if (c.value === undefined) return "";
  const str = String(c.value);
  return str.length > 60 ? str.slice(0, 60) + "…" : str;
}

const s: Record<string, React.CSSProperties> = {
  meta: { color: "var(--vscode-descriptionForeground)", fontSize: "0.85em", marginBottom: 8, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 },
  analyzeBtn: {
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    border: "none",
    borderRadius: 3,
    cursor: "pointer",
    padding: "2px 9px",
    fontSize: "0.82em",
    marginLeft: "auto",
  },
  mixed: { color: "var(--vscode-inputValidation-warningForeground, #cca700)" },
  dist: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  badge: {
    padding: "1px 7px",
    background: "var(--vscode-badge-background)",
    color: "var(--vscode-badge-foreground)",
    borderRadius: 10,
    fontSize: "0.78em",
  },
  list: {
    border: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    borderRadius: 2,
    overflow: "hidden",
  },
  item: {
    display: "grid",
    gridTemplateColumns: "3.5rem 1fr auto",
    gap: 10,
    padding: "4px 10px",
    borderBottom: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    alignItems: "center",
    fontSize: "0.9em",
  },
  idx: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    color: "var(--vscode-textLink-foreground)",
    cursor: "pointer",
    fontWeight: 600,
  },
  val: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--vscode-editor-foreground)",
  },
  type: {
    fontSize: "0.78em",
    color: "var(--vscode-descriptionForeground)",
    textAlign: "right" as const,
    whiteSpace: "nowrap",
  },
  more: {
    padding: "4px 10px",
    color: "var(--vscode-descriptionForeground)",
    fontSize: "0.85em",
    fontStyle: "italic",
  },
};
