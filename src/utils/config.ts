import * as vscode from "vscode";

export function getConfig() {
  const cfg = vscode.workspace.getConfiguration("jsonlens");
  return {
    largeFileMB: cfg.get<number>("largeFileThresholdMB", 2),
    veryLargeFileMB: cfg.get<number>("veryLargeFileThresholdMB", 20),
    maxChildrenPerNode: cfg.get<number>("maxChildrenPerNode", 200),
    debug: cfg.get<boolean>("debug", false),
  };
}
