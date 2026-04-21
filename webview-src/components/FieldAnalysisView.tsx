import React, { useState } from "react";
import { postMessage } from "../vscode-api.js";
import type { AnalysisPayload, AnalysisRow } from "../types.js";

type SortKey = "key" | "count" | "coverage" | "status";
type SortDir = "asc" | "desc";

interface Props {
  payload: AnalysisPayload;
  onBack: () => void;
}

export function FieldAnalysisView({ payload, onBack }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "key" ? "asc" : "desc");
    }
  }

  const sorted = [...payload.rows].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "key":      cmp = a.key.localeCompare(b.key); break;
      case "count":    cmp = a.count - b.count; break;
      case "coverage": cmp = a.coverage - b.coverage; break;
      case "status":   cmp = statusOrder(a.status) - statusOrder(b.status); break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const sampled = payload.sampledItems < payload.totalItems;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <button onClick={onBack} style={s.backBtn}>← Back</button>
        <span style={s.title}>Field Analysis</span>
        <span style={s.path}>{payload.arrayPath}</span>
      </div>

      <div style={s.meta}>
        {payload.totalItems.toLocaleString()} items
        {sampled && <span style={s.sampled}> · sampled {payload.sampledItems.toLocaleString()}</span>}
        {payload.skippedNonObjects > 0 && (
          <span style={s.skipped}> · {payload.skippedNonObjects} non-object {payload.skippedNonObjects === 1 ? "item" : "items"} skipped</span>
        )}
        {" · "}{payload.rows.length} unique {payload.rows.length === 1 ? "key" : "keys"}
      </div>

      {payload.rows.length === 0 ? (
        <div style={s.empty}>No object items found in array.</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              {(["key", "count", "coverage", "status"] as SortKey[]).map(col => (
                <th key={col} style={{ ...s.th, ...s.thClickable }} onClick={() => handleSort(col)}>
                  {colLabel(col)}{sortKey === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
              <th style={s.th}>Types</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr
                key={row.key}
                style={s.tr}
                onClick={() => postMessage({ type: "navigate.path", payload: { path: row.firstPath } })}
              >
                <td style={{ ...s.td, ...s.keyCell }}>{row.key}</td>
                <td style={{ ...s.td, ...s.numCell }}>{row.count.toLocaleString()}</td>
                <td style={{ ...s.td, ...s.numCell }}>
                  <CoverageBar coverage={row.coverage} />
                </td>
                <td style={{ ...s.td, ...s.statusCell }}>
                  <StatusBadge status={row.status} />
                </td>
                <td style={s.td}>
                  <div style={s.types}>
                    {row.types.map(t => (
                      <span key={t} style={s.typeBadge}>{t}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CoverageBar({ coverage }: { coverage: number }) {
  const pct = Math.round(coverage * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={s.barTrack}>
        <div style={{ ...s.barFill, width: `${pct}%` }} />
      </div>
      <span style={s.pct}>{pct}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: AnalysisRow["status"] }) {
  const color = status === "ok"
    ? "var(--vscode-testing-iconPassed, #3fb950)"
    : status === "inconsistent"
    ? "var(--vscode-errorForeground, #f85149)"
    : "var(--vscode-inputValidation-warningForeground, #cca700)";
  return <span style={{ ...s.statusDot, color }}>{statusLabel(status)}</span>;
}

function statusOrder(s: AnalysisRow["status"]): number {
  return s === "inconsistent" ? 0 : s === "sparse" ? 1 : 2;
}

function statusLabel(s: AnalysisRow["status"]): string {
  return s === "inconsistent" ? "inconsistent" : s === "sparse" ? "sparse" : "ok";
}

function colLabel(k: SortKey): string {
  return k === "key" ? "Key" : k === "count" ? "Count" : k === "coverage" ? "Coverage" : "Status";
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: "10px 14px", fontFamily: "var(--vscode-font-family)" },
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  backBtn: {
    background: "none",
    border: "1px solid var(--vscode-button-border, var(--vscode-widget-border))",
    color: "var(--vscode-textLink-foreground)",
    borderRadius: 3,
    cursor: "pointer",
    padding: "2px 8px",
    fontSize: "0.85em",
  },
  title: { fontWeight: 600, fontSize: "1em" },
  path: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "0.8em",
    color: "var(--vscode-descriptionForeground)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 200,
  },
  meta: { fontSize: "0.82em", color: "var(--vscode-descriptionForeground)", marginBottom: 10 },
  sampled: { color: "var(--vscode-inputValidation-warningForeground, #cca700)" },
  skipped: { color: "var(--vscode-descriptionForeground)" },
  empty: { color: "var(--vscode-descriptionForeground)", fontSize: "0.9em", padding: "20px 0" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.85em" },
  th: {
    textAlign: "left" as const,
    padding: "5px 8px",
    borderBottom: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    color: "var(--vscode-descriptionForeground)",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  thClickable: { cursor: "pointer", userSelect: "none" as const },
  tr: { cursor: "pointer" },
  td: { padding: "4px 8px", borderBottom: "1px solid var(--vscode-widget-border, var(--vscode-input-border))" },
  keyCell: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    color: "var(--vscode-editor-foreground)",
    fontWeight: 500,
    maxWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  numCell: { textAlign: "right" as const, color: "var(--vscode-editor-foreground)" },
  statusCell: { whiteSpace: "nowrap" },
  statusDot: { fontSize: "0.82em", fontWeight: 500 },
  types: { display: "flex", flexWrap: "wrap", gap: 3 },
  typeBadge: {
    padding: "0px 5px",
    background: "var(--vscode-badge-background)",
    color: "var(--vscode-badge-foreground)",
    borderRadius: 8,
    fontSize: "0.78em",
    whiteSpace: "nowrap",
  },
  barTrack: {
    width: 50,
    height: 6,
    background: "var(--vscode-widget-border, var(--vscode-input-border))",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    background: "var(--vscode-progressBar-background)",
    borderRadius: 3,
  },
  pct: { fontSize: "0.78em", color: "var(--vscode-descriptionForeground)", minWidth: 28 },
};
