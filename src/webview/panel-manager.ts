import * as vscode from "vscode";
import { generateNonce } from "./content-security.js";
import type { ExtensionMessage, WebviewMessage } from "./message-bridge.js";

export class PanelManager {
  private panel?: vscode.WebviewPanel;
  private messageHandler?: (msg: WebviewMessage) => void;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  onMessage(handler: (msg: WebviewMessage) => void): void {
    this.messageHandler = handler;
  }

  getOrCreate(): vscode.WebviewPanel {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      return this.panel;
    }

    this.panel = vscode.window.createWebviewPanel(
      "jsonlensPreview",
      "JsonLens",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media")],
      }
    );

    this.panel.webview.html = this.buildHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.messageHandler?.(msg),
      undefined,
      this.ctx.subscriptions
    );

    this.panel.onDidDispose(
      () => { this.panel = undefined; },
      undefined,
      this.ctx.subscriptions
    );

    return this.panel;
  }

  send(msg: ExtensionMessage): void {
    if (!this.panel) return;
    this.panel.webview.postMessage(msg).then(undefined, () => {});
  }

  isOpen(): boolean {
    return !!this.panel;
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = generateNonce();
    const bundleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, "media", "webview-bundle.js")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src https: http: data: ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JsonLens</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      line-height: 1.6;
      overflow-x: hidden;
    }
    #root { min-height: 100vh; }
    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }
    a:hover { text-decoration: underline; color: var(--vscode-textLink-activeForeground); }
    button {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 3px 10px;
      border-radius: 2px;
      cursor: pointer;
      font-size: inherit;
      font-family: inherit;
      line-height: 1.6;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    code, .mono {
      font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Consolas', monospace);
      font-size: var(--vscode-editor-font-size, 12px);
    }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${bundleUri}"></script>
</body>
</html>`;
  }
}
