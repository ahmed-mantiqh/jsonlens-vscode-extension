import * as vscode from "vscode";
import * as documentStore from "../core/document-store.js";
import { loadDocument } from "../core/document-loader.js";
import { generateNonce } from "../webview/content-security.js";
import { buildNodePayload } from "../webview/node-payload.js";
import { analyzeArrayNode } from "../analysis/field-analyzer.js";
import { inferSchemaNode } from "../analysis/schema-inferrer.js";
import { stringToPath } from "../core/path-utils.js";
import type { ExtensionMessage, WebviewMessage } from "../webview/message-bridge.js";
import type { JsonTreeProvider } from "../tree/json-tree-provider.js";
import type { JsonFilesProvider } from "../tree/json-files-provider.js";

export class JsonLensEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = "jsonlens.preview";

  readonly panels = new Map<string, vscode.WebviewPanel>();
  activeUri: string | undefined;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly treeProvider: JsonTreeProvider,
    private readonly filesProvider: JsonFilesProvider,
  ) {}

  static register(
    ctx: vscode.ExtensionContext,
    treeProvider: JsonTreeProvider,
    filesProvider: JsonFilesProvider,
  ): JsonLensEditorProvider {
    const provider = new JsonLensEditorProvider(ctx, treeProvider, filesProvider);
    ctx.subscriptions.push(
      vscode.window.registerCustomEditorProvider(
        JsonLensEditorProvider.viewType,
        provider,
        { webviewOptions: { retainContextWhenHidden: true } },
      )
    );
    return provider;
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const uri = document.uri.toString();

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media")],
    };
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview);

    await loadDocument(document, this.treeProvider);

    this.panels.set(uri, webviewPanel);
    this.filesProvider.refresh();

    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) this.activeUri = uri;
    }, null, this.ctx.subscriptions);

    webviewPanel.onDidDispose(() => {
      this.panels.delete(uri);
      if (this.activeUri === uri) this.activeUri = undefined;
      this.filesProvider.refresh();
    }, null, this.ctx.subscriptions);

    webviewPanel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleMessage(msg, uri),
      null,
      this.ctx.subscriptions,
    );
  }

  send(uri: string, msg: ExtensionMessage): void {
    this.panels.get(uri)?.webview.postMessage(msg).then(undefined, () => {});
  }

  private handleMessage(msg: WebviewMessage, uri: string): void {
    if (msg.type === "navigate.path") {
      const nodePath = stringToPath(msg.payload.path);
      const node = documentStore.getNodeAtPath(uri, nodePath);
      if (!node) return;
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === uri
      );
      if (editor) {
        const start = editor.document.positionAt(node.range[0]);
        const end   = editor.document.positionAt(node.range[1]);
        editor.selection = new vscode.Selection(start, start);
        editor.revealRange(
          new vscode.Range(start, end),
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        );
      }
    } else if (msg.type === "copy.value") {
      const nodePath = stringToPath(msg.payload.path);
      const node = documentStore.getNodeAtPath(uri, nodePath);
      if (!node) return;
      const text = node.value !== undefined ? JSON.stringify(node.value) : `[${node.type}]`;
      vscode.env.clipboard.writeText(text);
      vscode.window.setStatusBarMessage("Copied value", 2000);
    } else if (msg.type === "open.url") {
      vscode.env.openExternal(vscode.Uri.parse(msg.payload.url));
    } else if (msg.type === "analyze.request") {
      const nodePath = stringToPath(msg.payload.path);
      const node = documentStore.getNodeAtPath(uri, nodePath);
      if (!node || node.type !== "array") return;
      const state = documentStore.get(uri);
      if (!state) return;
      this.send(uri, { type: "node.loading" });
      analyzeArrayNode(node, state.rawText).then(
        (payload) => this.send(uri, { type: "analysis.result", payload }),
        (err) => this.send(uri, { type: "error", payload: { message: `Analysis failed: ${err}` } }),
      );
    } else if (msg.type === "schema.request") {
      const nodePath = stringToPath(msg.payload.path);
      const node = documentStore.getNodeAtPath(uri, nodePath);
      if (!node || (node.type !== "object" && node.type !== "array")) return;
      const state = documentStore.get(uri);
      if (!state) return;
      this.send(uri, { type: "node.loading" });
      inferSchemaNode(node, state.rawText).then(
        (payload) => this.send(uri, { type: "schema.result", payload }),
        (err) => this.send(uri, { type: "error", payload: { message: `Schema inference failed: ${err}` } }),
      );
    } else if (msg.type === "schema.export") {
      const content = JSON.stringify(msg.payload.schema, null, 2);
      vscode.workspace.openTextDocument({ language: "json", content }).then(
        (doc) => vscode.window.showTextDocument(doc, { preview: false }),
        () => {},
      );
    } else if (msg.type === "ready") {
      const node = documentStore.getNodeAtOffset(uri, 0);
      if (node) this.send(uri, { type: "node.selected", payload: buildNodePayload(node) });
    }
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
