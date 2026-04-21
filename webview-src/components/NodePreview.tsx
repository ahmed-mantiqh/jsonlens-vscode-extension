import React from "react";
import { postMessage } from "../vscode-api.js";
import type { NodePayload } from "../types.js";
import { StringRenderer } from "./StringRenderer.js";
import { NumberRenderer } from "./NumberRenderer.js";
import { ObjectSummary } from "./ObjectSummary.js";
import { ArraySummary } from "./ArraySummary.js";

interface Props { node: NodePayload; }

const TYPE_BADGE_COLOR: Record<string, string> = {
  string:  "#ce9178",
  number:  "#b5cea8",
  boolean: "#569cd6",
  null:    "#888",
  object:  "#c586c0",
  array:   "#4ec9b0",
};

export function NodePreview({ node }: Props) {
  return (
    <div style={s.root}>
      {/* Breadcrumb */}
      <nav style={s.breadcrumb} aria-label="path">
        {node.breadcrumb.map((seg, i) => (
          <React.Fragment key={seg.path}>
            {i > 0 && <span style={s.sep}>›</span>}
            <span
              style={i === node.breadcrumb.length - 1 ? s.crumbActive : s.crumb}
              onClick={() => i < node.breadcrumb.length - 1 &&
                postMessage({ type: "navigate.path", payload: { path: seg.path } })}
            >
              {seg.label}
            </span>
          </React.Fragment>
        ))}
      </nav>

      {/* Header */}
      <div style={s.header}>
        <span style={s.keyLabel}>
          {node.breadcrumb.length > 1
            ? node.breadcrumb[node.breadcrumb.length - 1].label
            : "(root)"}
        </span>
        <span
          style={{
            ...s.typeBadge,
            background: TYPE_BADGE_COLOR[node.type] ?? "var(--vscode-badge-background)",
            color: "#1e1e1e",
          }}
        >
          {node.type}
        </span>
        {(node.type === "object" || node.type === "array") && node.childCount > 0 && (
          <span style={s.count}>
            {node.type === "object"
              ? `${node.childCount} ${node.childCount === 1 ? "key" : "keys"}`
              : `${node.childCount} ${node.childCount === 1 ? "item" : "items"}`}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={s.body}>
        <NodeBody node={node} />
      </div>
    </div>
  );
}

function NodeBody({ node }: Props) {
  switch (node.type) {
    case "string":
      return <StringRenderer value={String(node.value ?? "")} semantics={node.semantics} path={node.path} />;
    case "number":
      return <NumberRenderer value={Number(node.value)} path={node.path} />;
    case "boolean":
      return <BooleanRenderer value={Boolean(node.value)} path={node.path} />;
    case "null":
      return <NullRenderer path={node.path} />;
    case "object":
      return <ObjectSummary childCount={node.childCount} childPreviews={node.childPreviews} path={node.path} />;
    case "array":
      return <ArraySummary childCount={node.childCount} childPreviews={node.childPreviews} path={node.path} />;
    default:
      return null;
  }
}

function BooleanRenderer({ value, path }: { value: boolean; path: string }) {
  return (
    <div>
      <div style={{ ...s.boolVal, color: value ? "#4ec9b0" : "#f44747" }}>
        {String(value)}
      </div>
      <div style={s.actions}>
        <button className="secondary" onClick={() => postMessage({ type: "copy.value", payload: { path } })}>
          Copy
        </button>
      </div>
    </div>
  );
}

function NullRenderer({ path }: { path: string }) {
  return (
    <div>
      <div style={s.nullVal}>null</div>
      <div style={s.actions}>
        <button className="secondary" onClick={() => postMessage({ type: "copy.value", payload: { path } })}>
          Copy
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: "12px 16px" },
  breadcrumb: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 2,
    fontSize: "0.82em",
    color: "var(--vscode-descriptionForeground)",
    marginBottom: 10,
    fontFamily: "var(--vscode-editor-font-family, monospace)",
  },
  sep: { color: "var(--vscode-descriptionForeground)", opacity: 0.5, margin: "0 1px" },
  crumb: {
    cursor: "pointer",
    color: "var(--vscode-textLink-foreground)",
  },
  crumbActive: {
    color: "var(--vscode-editor-foreground)",
    fontWeight: 600,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  keyLabel: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontWeight: 700,
    fontSize: "1.05em",
  },
  typeBadge: {
    fontSize: "0.72em",
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    padding: "1px 6px",
    borderRadius: 3,
  },
  count: {
    fontSize: "0.82em",
    color: "var(--vscode-descriptionForeground)",
  },
  body: {},
  boolVal: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "1.6em",
    fontWeight: 700,
    marginTop: 4,
  },
  nullVal: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "1.4em",
    color: "var(--vscode-descriptionForeground)",
    fontStyle: "italic",
    marginTop: 4,
  },
  actions: { marginTop: 10 },
};
