import React from "react";
import { postMessage } from "../vscode-api.js";
import type { ChildPreview } from "../types.js";

interface Props {
  childCount: number;
  childPreviews: ChildPreview[];
  path: string;
}

const TYPE_COLOR: Record<string, string> = {
  string:  "var(--vscode-debugTokenExpression-string, #ce9178)",
  number:  "var(--vscode-debugTokenExpression-number, #b5cea8)",
  boolean: "var(--vscode-debugTokenExpression-boolean, #569cd6)",
  null:    "var(--vscode-debugTokenExpression-value, #888)",
  object:  "var(--vscode-editor-foreground)",
  array:   "var(--vscode-editor-foreground)",
};

export function ObjectSummary({ childCount, childPreviews, path }: Props) {
  const shown = childPreviews.length;
  const hidden = childCount - shown;

  return (
    <div>
      <div style={s.meta}>{childCount} {childCount === 1 ? "key" : "keys"}</div>
      <div style={s.table}>
        {childPreviews.map((c) => (
          <div key={c.key} style={s.row}>
            <span
              style={s.key}
              title={c.key}
              onClick={() => postMessage({ type: "navigate.path", payload: { path: `${path}.${c.key}` } })}
            >
              {c.key}
            </span>
            <span style={{ ...s.val, color: TYPE_COLOR[c.type] ?? "inherit" }}>
              {formatChildValue(c)}
            </span>
            <span style={s.type}>{c.type}</span>
          </div>
        ))}
        {hidden > 0 && (
          <div style={s.more}>… {hidden} more {hidden === 1 ? "key" : "keys"}</div>
        )}
      </div>
    </div>
  );
}

function formatChildValue(c: ChildPreview): string {
  if (c.type === "object") return `{${c.childCount ?? "?"}}`;
  if (c.type === "array")  return `[${c.childCount ?? "?"}]`;
  if (c.type === "null")   return "null";
  if (c.value === undefined) return "";
  const s = String(c.value);
  return s.length > 48 ? s.slice(0, 48) + "…" : s;
}

const s: Record<string, React.CSSProperties> = {
  meta: {
    color: "var(--vscode-descriptionForeground)",
    fontSize: "0.85em",
    marginBottom: 8,
  },
  table: {
    border: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    borderRadius: 2,
    overflow: "hidden",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 2fr auto",
    gap: 12,
    padding: "4px 10px",
    borderBottom: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    alignItems: "center",
    fontSize: "0.9em",
  },
  key: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontWeight: 600,
    cursor: "pointer",
    color: "var(--vscode-textLink-foreground)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  val: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
