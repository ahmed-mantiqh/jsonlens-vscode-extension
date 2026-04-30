import React, { useEffect, useMemo, useState } from "react";
import { postMessage } from "../vscode-api.js";
import type { ChildPreview, JsonValueType, NodePayload, SearchResultPayload } from "../types.js";
import { StringRenderer } from "./StringRenderer.js";
import { NumberRenderer } from "./NumberRenderer.js";

interface Props {
  columns: NodePayload[];
  selectedNode: NodePayload;
  searchResult: SearchResultPayload | null;
}

const TYPE_COLOR: Record<JsonValueType, string> = {
  string:  "var(--vscode-debugTokenExpression-string, #ce9178)",
  number:  "var(--vscode-debugTokenExpression-number, #b5cea8)",
  boolean: "var(--vscode-debugTokenExpression-boolean, #569cd6)",
  null:    "var(--vscode-debugTokenExpression-value, #888)",
  object:  "var(--vscode-editor-foreground)",
  array:   "var(--vscode-editor-foreground)",
};

const TYPE_BADGE_COLOR: Record<JsonValueType, string> = {
  string:  "#ce9178",
  number:  "#b5cea8",
  boolean: "#569cd6",
  null:    "#888",
  object:  "#c586c0",
  array:   "#4ec9b0",
};

export function ColumnBrowser({ columns, selectedNode, searchResult }: Props) {
  const [searchText, setSearchText] = useState("");
  const [activeSearch, setActiveSearch] = useState<SearchResultPayload>({ query: "", results: [] });
  const [autoOpenedQuery, setAutoOpenedQuery] = useState("");
  const trail = columns.length ? columns : [selectedNode];
  const searchActive = searchText.trim().length > 0;
  const results = activeSearch.query === searchText ? activeSearch.results : [];
  const matchedPaths = useMemo(() => results.map((result) => result.path), [results]);
  const visibleColumns = selectedNode.childPreviews.length === 0 && trail[trail.length - 1]?.path === selectedNode.path
    ? trail.slice(0, -1)
    : trail;
  const displayedColumns = searchActive
    ? visibleColumns.filter((column) => column.path === "$" || matchedPaths.some((path) => isPathPrefix(column.path, path)))
    : visibleColumns;
  const showDetail = !searchActive || matchedPaths.some((path) =>
    path === selectedNode.path || isPathPrefix(selectedNode.path, path)
  );

  useEffect(() => {
    const q = searchText.trim();
    if (!q) {
      setActiveSearch({ query: "", results: [] });
      setAutoOpenedQuery("");
      return;
    }

    setActiveSearch({ query: searchText, results: [] });
    const timer = window.setTimeout(() => {
      postMessage({ type: "search.query", payload: { query: searchText } });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (!searchResult || searchResult.query !== searchText) return;
    setActiveSearch(searchResult);
  }, [searchResult, searchText]);

  useEffect(() => {
    if (!searchActive || activeSearch.query !== searchText || !activeSearch.results[0]) return;
    if (autoOpenedQuery === searchText) return;

    setAutoOpenedQuery(searchText);
    postMessage({ type: "navigate.path", payload: { path: activeSearch.results[0].path } });
  }, [activeSearch, autoOpenedQuery, searchActive, searchText]);

  return (
    <div style={s.root}>
      <div style={s.breadcrumb} aria-label="path">
        <div style={s.searchWrap}>
          <input
            aria-label="Search JSON"
            style={s.searchInput}
            value={searchText}
            placeholder="Search"
            onChange={(event) => setSearchText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearchText("");
              if (event.key === "Enter" && results[0]) {
                postMessage({ type: "navigate.path", payload: { path: results[0].path } });
              }
            }}
          />
          {searchActive && (
            <span style={s.searchCount}>
              {activeSearch.query === searchText ? `${results.length}` : "..."}
            </span>
          )}
        </div>
        <div style={s.breadcrumbPath}>
          {selectedNode.breadcrumb.map((seg, i) => (
            <React.Fragment key={seg.path}>
              {i > 0 && <span style={s.sep}>›</span>}
              <span
                style={i === selectedNode.breadcrumb.length - 1 ? s.crumbActive : s.crumb}
                onClick={() => i < selectedNode.breadcrumb.length - 1 &&
                  postMessage({ type: "navigate.path", payload: { path: seg.path } })}
              >
                {seg.label}
              </span>
            </React.Fragment>
          ))}
        </div>
        <button
          className="secondary"
          style={s.copyPathBtn}
          title={`Copy ${selectedNode.path}`}
          onClick={() => postMessage({ type: "copy.path", payload: { path: selectedNode.path } })}
        >
          Copy
        </button>
      </div>

      <div style={s.browser}>
        {displayedColumns.map((column) => {
          const trailIndex = trail.findIndex((trailColumn) => trailColumn.path === column.path);
          return (
          <Column
            key={column.path}
            node={column}
            selectedChildPath={trailIndex >= 0 ? trail[trailIndex + 1]?.path : undefined}
            matchedPaths={matchedPaths}
            searchActive={searchActive}
          />
          );
        })}
        {showDetail && <DetailColumn node={selectedNode} />}
      </div>
    </div>
  );
}

function Column(
  { node, selectedChildPath, matchedPaths, searchActive }: {
    node: NodePayload;
    selectedChildPath?: string;
    matchedPaths: string[];
    searchActive: boolean;
  },
) {
  const childRows = searchActive
    ? node.childPreviews.filter((child, index) => {
      const childPath = appendChildPath(node.path, node.type, child.key, index);
      return matchedPaths.some((path) => isPathPrefix(childPath, path));
    })
    : node.childPreviews;
  const hidden = searchActive ? 0 : Math.max(0, node.childCount - childRows.length);
  const title = node.path === "$" ? "$" : node.breadcrumb[node.breadcrumb.length - 1]?.label ?? node.path;

  return (
    <section style={s.column} aria-label={title}>
      <div style={s.columnHeader}>
        <span style={s.columnTitle} title={title}>{title}</span>
        <span style={s.columnCount}>{formatCount(node)}</span>
      </div>
      <div style={s.columnBody}>
        {childRows.map((child) => {
          const originalIndex = node.childPreviews.indexOf(child);
          const index = originalIndex >= 0 ? originalIndex : 0;
          const childPath = appendChildPath(node.path, node.type, child.key, index);
          const selected = childPath === selectedChildPath;
          return (
            <button
              key={`${child.key}-${index}`}
              style={{ ...s.row, ...(selected ? s.rowSelected : undefined) }}
              title={`${child.key} · ${child.type}`}
              onClick={() => postMessage({ type: "navigate.path", payload: { path: childPath } })}
            >
              <span style={s.rowMain}>
                <span style={s.key} title={child.key}>{formatChildKey(node.type, child.key, index)}</span>
                <span style={{ ...s.preview, color: TYPE_COLOR[child.type] }}>{formatChildValue(child)}</span>
              </span>
              <span style={s.rowMeta}>
                <span style={s.type}>{child.type}</span>
                {(child.type === "object" || child.type === "array") && <span style={s.chevron}>›</span>}
              </span>
            </button>
          );
        })}
        {hidden > 0 && (
          <div style={s.more}>... {hidden} more</div>
        )}
        {searchActive && childRows.length === 0 && (
          <div style={s.more}>No matches</div>
        )}
      </div>
    </section>
  );
}

function DetailColumn({ node }: { node: NodePayload }) {
  const name = node.path === "$" ? "(root)" : node.breadcrumb[node.breadcrumb.length - 1]?.label ?? node.path;

  return (
    <aside style={s.detail}>
      <div style={s.detailHeader}>
        <span style={s.detailName} title={name}>{name}</span>
        <span style={{
          ...s.typeBadge,
          background: TYPE_BADGE_COLOR[node.type],
          color: "#1e1e1e",
        }}>
          {node.type}
        </span>
      </div>

      {(node.type === "object" || node.type === "array") && (
        <div style={s.actions}>
          <button
            style={s.actionBtn}
            onClick={() => postMessage({ type: "schema.request", payload: { path: node.path } })}
          >
            Infer Schema
          </button>
          {node.type === "array" && node.childPreviews.some((child) => child.type === "object") && (
            <button
              style={s.actionBtn}
              onClick={() => postMessage({ type: "analyze.request", payload: { path: node.path } })}
            >
              Analyze Fields
            </button>
          )}
        </div>
      )}

      <div style={s.detailBody}>
        <NodeDetail node={node} />
      </div>
    </aside>
  );
}

function NodeDetail({ node }: { node: NodePayload }) {
  switch (node.type) {
    case "string":
      return <StringRenderer value={String(node.value ?? "")} semantics={node.semantics} path={node.path} />;
    case "number":
      return <NumberRenderer value={Number(node.value)} path={node.path} />;
    case "boolean":
      return <ScalarDetail value={String(node.value)} path={node.path} tone={node.value ? "#4ec9b0" : "#f44747"} />;
    case "null":
      return <ScalarDetail value="null" path={node.path} tone="var(--vscode-descriptionForeground)" italic />;
    case "object":
    case "array":
      return (
        <div style={s.summary}>
          <div style={s.summaryValue}>{formatCount(node)}</div>
          <div style={s.summarySub}>{formatShownCount(node)}</div>
        </div>
      );
  }
}

function ScalarDetail(
  { value, path, tone, italic }: { value: string; path: string; tone: string; italic?: boolean },
) {
  return (
    <div>
      <div style={{ ...s.scalar, color: tone, fontStyle: italic ? "italic" : "normal" }}>{value}</div>
      <div style={s.actions}>
        <button className="secondary" onClick={() => postMessage({ type: "copy.value", payload: { path } })}>
          Copy
        </button>
      </div>
    </div>
  );
}

function appendChildPath(parentPath: string, parentType: JsonValueType, key: string, index: number): string {
  if (parentType === "array") {
    const parsed = Number(key);
    return `${parentPath}[${Number.isInteger(parsed) ? parsed : index}]`;
  }

  if (key === "" || /[.[\]]/.test(key)) {
    return `${parentPath}["${key.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"]`;
  }

  return `${parentPath}.${key}`;
}

function formatChildKey(parentType: JsonValueType, key: string, index: number): string {
  return parentType === "array" ? `[${key || index}]` : key;
}

function formatCount(node: NodePayload): string {
  if (node.type === "object") return `${node.childCount} ${node.childCount === 1 ? "key" : "keys"}`;
  if (node.type === "array") return `${node.childCount} ${node.childCount === 1 ? "item" : "items"}`;
  return node.type;
}

function formatShownCount(node: NodePayload): string {
  const hidden = Math.max(0, node.childCount - node.childPreviews.length);
  if (hidden === 0) return "All shown in column";
  return `${node.childPreviews.length} shown in column`;
}

function formatChildValue(child: ChildPreview): string {
  if (child.type === "object") return `{${child.childCount ?? "?"}}`;
  if (child.type === "array") return `[${child.childCount ?? "?"}]`;
  if (child.type === "null") return "null";
  if (child.value === undefined) return "";
  const value = String(child.value);
  return value.length > 42 ? `${value.slice(0, 42)}...` : value;
}

function isPathPrefix(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);
}

const s: Record<string, React.CSSProperties> = {
  root: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  breadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    minHeight: 32,
    padding: "7px 10px",
    borderBottom: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    color: "var(--vscode-descriptionForeground)",
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "0.82em",
  },
  breadcrumbPath: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 2,
    minWidth: 0,
  },
  copyPathBtn: {
    marginLeft: 8,
    padding: "1px 8px",
    fontSize: "0.88em",
    flexShrink: 0,
  },
  searchWrap: {
    position: "relative",
    width: 220,
    flexShrink: 0,
  },
  searchInput: {
    width: "100%",
    height: 24,
    padding: "2px 8px",
    borderRadius: 2,
    border: "1px solid var(--vscode-input-border, var(--vscode-widget-border))",
    background: "var(--vscode-input-background)",
    color: "var(--vscode-input-foreground)",
    fontFamily: "var(--vscode-font-family, system-ui, sans-serif)",
    fontSize: "0.9em",
    outline: "none",
  },
  searchCount: {
    position: "absolute",
    right: 7,
    top: 3,
    color: "var(--vscode-descriptionForeground)",
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "0.78em",
    pointerEvents: "none",
  },
  sep: { color: "var(--vscode-descriptionForeground)", opacity: 0.5, margin: "0 1px" },
  crumb: { cursor: "pointer", color: "var(--vscode-textLink-foreground)" },
  crumbActive: { color: "var(--vscode-editor-foreground)", fontWeight: 600 },
  browser: {
    flex: 1,
    display: "flex",
    overflowX: "auto",
    overflowY: "hidden",
    minHeight: 0,
  },
  column: {
    width: 260,
    minWidth: 220,
    maxWidth: 320,
    flex: "0 0 260px",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    background: "var(--vscode-editor-background)",
    minHeight: 0,
  },
  columnHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 9px",
    borderBottom: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    minHeight: 32,
  },
  columnTitle: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  columnCount: {
    marginLeft: "auto",
    color: "var(--vscode-descriptionForeground)",
    fontSize: "0.78em",
    whiteSpace: "nowrap",
  },
  columnBody: {
    overflowY: "auto",
    minHeight: 0,
    padding: "4px 0",
  },
  row: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "5px 8px",
    background: "transparent",
    color: "var(--vscode-editor-foreground)",
    border: "none",
    borderRadius: 0,
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  rowSelected: {
    background: "var(--vscode-list-activeSelectionBackground)",
    color: "var(--vscode-list-activeSelectionForeground)",
  },
  rowMain: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  key: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  preview: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "0.82em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    opacity: 0.9,
  },
  rowMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  type: {
    fontSize: "0.72em",
    color: "var(--vscode-descriptionForeground)",
  },
  chevron: {
    fontSize: "1.1em",
    color: "var(--vscode-descriptionForeground)",
  },
  more: {
    padding: "6px 9px",
    color: "var(--vscode-descriptionForeground)",
    fontSize: "0.82em",
    fontStyle: "italic",
  },
  detail: {
    width: 320,
    minWidth: 280,
    flex: "0 0 320px",
    display: "flex",
    flexDirection: "column",
    background: "var(--vscode-sideBar-background, var(--vscode-editor-background))",
    minHeight: 0,
  },
  detailHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderBottom: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    minHeight: 40,
  },
  detailName: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  typeBadge: {
    marginLeft: "auto",
    fontSize: "0.72em",
    fontWeight: 700,
    textTransform: "uppercase",
    padding: "1px 6px",
    borderRadius: 3,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: "8px 10px 0",
  },
  actionBtn: {
    background: "var(--vscode-button-secondaryBackground)",
    color: "var(--vscode-button-secondaryForeground)",
    borderRadius: 3,
    padding: "2px 8px",
  },
  detailBody: {
    padding: 10,
    overflowY: "auto",
    minHeight: 0,
  },
  summary: {
    color: "var(--vscode-descriptionForeground)",
  },
  summaryValue: {
    color: "var(--vscode-editor-foreground)",
    fontWeight: 700,
    marginBottom: 4,
  },
  summarySub: {
    fontSize: "0.86em",
  },
  scalar: {
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: "1.5em",
    fontWeight: 700,
  },
};
