import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function initLogger(ctx: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel("JsonLens");
  ctx.subscriptions.push(channel);
}

function isDebug(): boolean {
  return vscode.workspace.getConfiguration("jsonlens").get<boolean>("debug", false);
}

export function log(msg: string): void {
  if (isDebug()) channel?.appendLine(`[JsonLens] ${msg}`);
}

export function time<T>(label: string, fn: () => T): T {
  if (!isDebug()) return fn();
  const start = performance.now();
  const result = fn();
  const ms = (performance.now() - start).toFixed(1);
  channel?.appendLine(`[JsonLens] ${label}: ${ms}ms`);
  return result;
}

export async function timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!isDebug()) return fn();
  const start = performance.now();
  const result = await fn();
  const ms = (performance.now() - start).toFixed(1);
  channel?.appendLine(`[JsonLens] ${label}: ${ms}ms`);
  return result;
}
