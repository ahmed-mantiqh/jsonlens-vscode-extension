import React, { useEffect } from "react";
import { postMessage } from "./vscode-api.js";
import { useNodeData } from "./hooks/useNodeData.js";
import { NodePreview } from "./components/NodePreview.js";
import { FieldAnalysisView } from "./components/FieldAnalysisView.js";
import { SchemaView } from "./components/SchemaView.js";

export function App() {
  const { selectedNode, analysisResult, schemaResult, loading, error } = useNodeData();

  useEffect(() => {
    postMessage({ type: "ready" });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      postMessage({ type: "open.url", payload: { url } });
    };
    window.addEventListener("jl:openurl", handler);
    return () => window.removeEventListener("jl:openurl", handler);
  }, []);

  if (loading) return <CenteredMsg>Loading…</CenteredMsg>;
  if (error) return <CenteredMsg error>{error}</CenteredMsg>;

  if (schemaResult && selectedNode) {
    return (
      <SchemaView
        payload={schemaResult}
        onBack={() => postMessage({ type: "navigate.path", payload: { path: selectedNode.path } })}
      />
    );
  }

  if (analysisResult) {
    return (
      <FieldAnalysisView
        payload={analysisResult}
        onBack={() => postMessage({ type: "navigate.path", payload: { path: analysisResult.arrayPath } })}
      />
    );
  }

  if (!selectedNode) return <Empty />;

  return <NodePreview node={selectedNode} />;
}

function CenteredMsg({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      color: error ? "var(--vscode-errorForeground)" : "var(--vscode-descriptionForeground)",
      fontSize: "0.9em",
    }}>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      gap: 8,
      color: "var(--vscode-descriptionForeground)",
      userSelect: "none",
    }}>
      <div style={{ fontSize: "2em", opacity: 0.3 }}>{ }</div>
      <div style={{ fontSize: "0.9em" }}>Select a node in the tree to preview it</div>
    </div>
  );
}
