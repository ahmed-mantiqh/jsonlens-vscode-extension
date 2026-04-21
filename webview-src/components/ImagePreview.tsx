import React, { useState } from "react";

interface Props { url: string; }

export function ImagePreview({ url }: Props) {
  const [failed, setFailed] = useState(false);
  const isHttp = url.startsWith("http://");

  if (isHttp) {
    return (
      <div style={styles.warning}>
        <span style={styles.icon}>⚠</span>
        HTTP image blocked by security policy.{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); postMsg(url); }}>
          Open in browser
        </a>
      </div>
    );
  }

  if (failed) {
    return (
      <div style={styles.warning}>
        Image failed to load.{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); postMsg(url); }}>
          Open URL
        </a>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <img
        src={url}
        alt=""
        style={styles.img}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function postMsg(url: string) {
  window.dispatchEvent(new CustomEvent("jl:openurl", { detail: url }));
}

const styles = {
  container: {
    marginTop: 8,
    border: "1px solid var(--vscode-widget-border, var(--vscode-input-border))",
    borderRadius: 2,
    overflow: "hidden",
    display: "inline-block",
    maxWidth: "100%",
  } as React.CSSProperties,
  img: {
    display: "block",
    maxWidth: "100%",
    maxHeight: 320,
  } as React.CSSProperties,
  warning: {
    marginTop: 8,
    padding: "6px 10px",
    background: "var(--vscode-inputValidation-warningBackground)",
    border: "1px solid var(--vscode-inputValidation-warningBorder)",
    borderRadius: 2,
    fontSize: "0.9em",
  } as React.CSSProperties,
  icon: { marginRight: 4 } as React.CSSProperties,
};
