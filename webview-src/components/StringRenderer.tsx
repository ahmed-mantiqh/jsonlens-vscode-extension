import React from "react";
import { postMessage } from "../vscode-api.js";
import type { SemanticHint } from "../types.js";
import { ImagePreview } from "./ImagePreview.js";

interface Props {
  value: string;
  semantics: SemanticHint | null;
  path: string;
}

export function StringRenderer({ value, semantics, path }: Props) {
  if (semantics?.kind === "image") {
    return (
      <div>
        <ValueBox value={value} path={path} />
        <ImagePreview url={semantics.url} />
      </div>
    );
  }

  if (semantics?.kind === "url") {
    return (
      <div style={s.block}>
        <div style={s.kind}>URL</div>
        <a
          href="#"
          style={s.link}
          onClick={(e) => { e.preventDefault(); postMessage({ type: "open.url", payload: { url: semantics.value } }); }}
        >
          {semantics.value}
        </a>
      </div>
    );
  }

  if (semantics?.kind === "date") {
    return (
      <div style={s.block}>
        <div style={s.kind}>Date</div>
        <div style={s.dateMain}>{semantics.display}</div>
        <div style={s.dateSub}>{relativeTime(new Date(semantics.iso))}</div>
        <div style={{ ...s.mono, marginTop: 6, color: "var(--vscode-descriptionForeground)" }}>{semantics.iso}</div>
      </div>
    );
  }

  if (semantics?.kind === "color") {
    return (
      <div style={s.block}>
        <div style={s.kind}>Color</div>
        <div style={s.colorRow}>
          <div style={{ ...s.swatch, background: semantics.hex }} title={semantics.hex} />
          <span style={s.mono}>{semantics.hex}</span>
        </div>
      </div>
    );
  }

  if (semantics?.kind === "email") {
    return (
      <div style={s.block}>
        <div style={s.kind}>Email</div>
        <a href={`mailto:${semantics.value}`} style={s.link}>{semantics.value}</a>
      </div>
    );
  }

  return <ValueBox value={value} path={path} />;
}

function ValueBox({ value, path }: { value: string; path: string }) {
  const truncated = value.endsWith("…(truncated)");
  return (
    <div>
      <pre style={s.pre}>{value}</pre>
      {truncated && <div style={s.truncNote}>Value truncated for display</div>}
      <div style={s.actions}>
        <button
          className="secondary"
          onClick={() => postMessage({ type: "copy.value", payload: { path } })}
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const past = diff >= 0;
  const prefix = past ? "" : "in ";
  const suffix = past ? " ago" : "";

  const sec = Math.floor(abs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const mo = Math.floor(day / 30);
  const yr = Math.floor(day / 365);

  let str: string;
  if (abs < 60_000) str = "just now";
  else if (yr > 0) str = `${prefix}${yr} year${yr > 1 ? "s" : ""}${suffix}`;
  else if (mo > 0) str = `${prefix}${mo} month${mo > 1 ? "s" : ""}${suffix}`;
  else if (day > 0) str = `${prefix}${day} day${day > 1 ? "s" : ""}${suffix}`;
  else if (hr > 0) str = `${prefix}${hr} hour${hr > 1 ? "s" : ""}${suffix}`;
  else str = `${prefix}${min} minute${min > 1 ? "s" : ""}${suffix}`;

  return str;
}

const s: Record<string, React.CSSProperties> = {
  block: { marginTop: 4 },
  kind: {
    fontSize: "0.78em",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--vscode-descriptionForeground)",
    marginBottom: 6,
  },
  link: {
    color: "var(--vscode-textLink-foreground)",
    wordBreak: "break-all",
    display: "block",
  },
  dateMain: { fontSize: "1.05em", fontWeight: 500 },
  dateSub: { color: "var(--vscode-descriptionForeground)", marginTop: 2 },
  mono: { fontFamily: "var(--vscode-editor-font-family, monospace)", fontSize: "0.9em" },
  colorRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 2,
    border: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    flexShrink: 0,
  },
  pre: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "var(--vscode-editor-font-size, 12px)",
    background: "var(--vscode-textBlockQuote-background, var(--vscode-input-background))",
    border: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    borderRadius: 2,
    padding: "8px 10px",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 240,
    overflowY: "auto",
    marginTop: 4,
  },
  truncNote: {
    fontSize: "0.8em",
    color: "var(--vscode-descriptionForeground)",
    marginTop: 4,
    fontStyle: "italic",
  },
  actions: { marginTop: 8, display: "flex", gap: 6 },
};
