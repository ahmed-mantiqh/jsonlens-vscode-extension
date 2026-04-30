import React from "react";
import { postMessage } from "../vscode-api.js";

interface Props { value: number; path: string; }

const SEC_MIN  = 1_000_000_000;
const SEC_MAX  = 20_000_000_000;
const MS_MIN   = 1_000_000_000_000;
const MS_MAX   = 20_000_000_000_000;

function detectTimestamp(n: number): Date | null {
  if (!Number.isInteger(n)) return null;
  if (n > SEC_MIN && n < SEC_MAX) return new Date(n * 1000);
  if (n > MS_MIN  && n < MS_MAX)  return new Date(n);
  return null;
}

export function NumberRenderer({ value, path }: Props) {
  const timestamp = detectTimestamp(value);
  const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 20 });

  return (
    <div>
      <div style={s.value}>{formatted}</div>

      {timestamp && (
        <div style={s.hint}>
          <span style={s.label}>Unix timestamp →</span>
          <span style={s.ts}>{timestamp.toLocaleString()}</span>
        </div>
      )}

      {!Number.isInteger(value) && (
        <div style={s.hint}>
          <span style={s.label}>Exact →</span>
          <span style={s.mono}>{value}</span>
        </div>
      )}

      <div style={s.actions}>
        <button className="secondary" onClick={() => postMessage({ type: "copy.value", payload: { path } })}>
          Copy
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  value: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "1.6em",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    marginTop: 4,
  },
  hint: {
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: "0.9em",
    color: "var(--vscode-descriptionForeground)",
  },
  label: { fontWeight: 600 },
  ts: { color: "var(--vscode-editor-foreground)" },
  mono: { fontFamily: "var(--vscode-editor-font-family, monospace)" },
  actions: { marginTop: 10, display: "flex", gap: 6 },
};
