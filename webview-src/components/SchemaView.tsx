import React, { useState } from "react";
import { postMessage } from "../vscode-api.js";
import type { SchemaPayload } from "../types.js";

interface Props {
  payload: SchemaPayload;
  onBack: () => void;
}

// Minimal shape used in rendering
interface Schema {
  $schema?: string;
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
  format?: string;
  additionalProperties?: boolean;
}

export function SchemaView({ payload, onBack }: Props) {
  const schema = payload.schema as Schema;
  const { nodeCount, inferredAt } = payload.stats;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <button onClick={onBack} style={s.backBtn}>← Back</button>
        <span style={s.title}>JSON Schema</span>
        <button
          style={s.exportBtn}
          onClick={() => postMessage({ type: "schema.export", payload: { schema: payload.schema } })}
        >
          Export
        </button>
      </div>

      <div style={s.meta}>
        {nodeCount.toLocaleString()} nodes · inferred {new Date(inferredAt).toLocaleTimeString()}
      </div>

      <SchemaNode schema={schema} name="(root)" required depth={0} />
    </div>
  );
}

interface NodeProps {
  schema: Schema;
  name: string;
  required?: boolean;
  depth: number;
}

function SchemaNode({ schema, name, required, depth }: NodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = !!(schema.properties || schema.items);
  const typeLabel = formatType(schema);

  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div
        style={{ ...s.row, cursor: hasChildren ? "pointer" : "default" }}
        onClick={hasChildren ? () => setOpen(o => !o) : undefined}
      >
        {hasChildren && (
          <span style={s.arrow}>{open ? "▾" : "▸"}</span>
        )}
        {!hasChildren && <span style={s.arrowSpacer} />}

        <span style={s.keyName}>{name}</span>

        {required && <span style={s.requiredDot} title="required">*</span>}

        <span style={{ ...s.typeBadge, background: typeColor(schema) }}>{typeLabel}</span>

        {schema.format && <span style={s.formatBadge}>{schema.format}</span>}

        {schema.enum && (
          <span style={s.enumHint}>{formatEnum(schema.enum)}</span>
        )}
      </div>

      {open && hasChildren && (
        <div style={s.children}>
          {schema.properties && (
            Object.entries(schema.properties).map(([key, child]) => (
              <SchemaNode
                key={key}
                schema={child as Schema}
                name={key}
                required={schema.required?.includes(key)}
                depth={depth + 1}
              />
            ))
          )}
          {schema.items && !schema.properties && (
            <SchemaNode
              schema={schema.items as Schema}
              name="[items]"
              depth={depth + 1}
            />
          )}
        </div>
      )}
    </div>
  );
}

function formatType(schema: Schema): string {
  if (schema.enum) return "enum";
  if (!schema.type) return "any";
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  return schema.type;
}

function formatEnum(values: unknown[]): string {
  const strs = values.slice(0, 5).map(v => JSON.stringify(v));
  const suffix = values.length > 5 ? ` +${values.length - 5}` : "";
  return strs.join(", ") + suffix;
}

function typeColor(schema: Schema): string {
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (schema.enum) return "var(--vscode-charts-purple, #b180d7)";
  switch (t) {
    case "object":  return "var(--vscode-charts-blue, #4e9fff)";
    case "array":   return "var(--vscode-charts-yellow, #d7ba7d)";
    case "string":  return "var(--vscode-charts-green, #89d185)";
    case "number":
    case "integer": return "var(--vscode-charts-orange, #d19a66)";
    case "boolean": return "var(--vscode-charts-red, #f44747)";
    case "null":    return "var(--vscode-disabledForeground, #858585)";
    default:        return "var(--vscode-badge-background)";
  }
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: "10px 14px", fontFamily: "var(--vscode-font-family)", fontSize: "0.88em" },
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  backBtn: {
    background: "none",
    border: "1px solid var(--vscode-button-border, var(--vscode-widget-border))",
    color: "var(--vscode-textLink-foreground)",
    borderRadius: 3,
    cursor: "pointer",
    padding: "2px 8px",
    fontSize: "0.85em",
  },
  title: { fontWeight: 600, flex: 1 },
  exportBtn: {
    background: "var(--vscode-button-background)",
    color: "var(--vscode-button-foreground)",
    border: "none",
    borderRadius: 3,
    cursor: "pointer",
    padding: "2px 10px",
    fontSize: "0.82em",
  },
  meta: { fontSize: "0.78em", color: "var(--vscode-descriptionForeground)", marginBottom: 10 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 4px",
    borderRadius: 3,
    minHeight: 22,
  },
  arrow: { color: "var(--vscode-descriptionForeground)", fontSize: "0.8em", width: 10, flexShrink: 0 },
  arrowSpacer: { width: 10, flexShrink: 0, display: "inline-block" },
  keyName: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    color: "var(--vscode-editor-foreground)",
  },
  requiredDot: {
    color: "var(--vscode-errorForeground, #f85149)",
    fontWeight: 700,
    fontSize: "0.9em",
  },
  typeBadge: {
    padding: "0px 6px",
    color: "var(--vscode-editor-background, #1e1e1e)",
    borderRadius: 8,
    fontSize: "0.75em",
    fontWeight: 600,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  formatBadge: {
    padding: "0px 5px",
    background: "var(--vscode-badge-background)",
    color: "var(--vscode-badge-foreground)",
    borderRadius: 8,
    fontSize: "0.72em",
    whiteSpace: "nowrap",
  },
  enumHint: {
    color: "var(--vscode-descriptionForeground)",
    fontSize: "0.78em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 180,
  },
  children: {
    borderLeft: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    marginLeft: 4,
  },
};
