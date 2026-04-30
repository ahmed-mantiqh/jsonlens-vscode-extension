import * as vscode from "vscode";
import * as path from "path";

type GroupItem = { kind: "group"; label: string; id: string };
type FileItem  = { kind: "file";  uri: vscode.Uri };
export type JsonFilesItem = GroupItem | FileItem;

export class JsonFilesProvider implements vscode.TreeDataProvider<JsonFilesItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void { this._onDidChangeTreeData.fire(); }

  getParent(): undefined { return undefined; }

  async getChildren(item?: JsonFilesItem): Promise<JsonFilesItem[]> {
    if (!item) {
      return [
        { kind: "group", label: "Open Editors", id: "openEditors" },
        { kind: "group", label: "Workspace JSON", id: "workspaceJson" },
      ];
    }
    if (item.kind !== "group") return [];

    if (item.id === "openEditors") {
      const seen = new Set<string>();
      const items: FileItem[] = [];
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (tab.input instanceof vscode.TabInputCustom && tab.input.viewType === "jsonlens.preview") {
            const key = tab.input.uri.toString();
            if (!seen.has(key)) { seen.add(key); items.push({ kind: "file", uri: tab.input.uri }); }
          } else if (tab.input instanceof vscode.TabInputText) {
            const uri = tab.input.uri;
            const ext = uri.fsPath.toLowerCase();
            if ((ext.endsWith(".json") || ext.endsWith(".jsonc")) && !seen.has(uri.toString())) {
              seen.add(uri.toString());
              items.push({ kind: "file", uri });
            }
          }
        }
      }
      return items;
    }

    if (item.id === "workspaceJson") {
      const uris = await vscode.workspace.findFiles("**/*.{json,jsonc}", "**/node_modules/**", 500);
      uris.sort((a, b) => path.basename(a.fsPath).localeCompare(path.basename(b.fsPath)));
      if (uris.length === 0) {
        return [{ kind: "file", uri: vscode.Uri.from({ scheme: "jsonlens-empty", path: "empty" }) }];
      }
      return uris.map((uri) => ({ kind: "file", uri }));
    }

    return [];
  }

  getTreeItem(item: JsonFilesItem): vscode.TreeItem {
    if (item.kind === "group") {
      const ti = new vscode.TreeItem(item.label, vscode.TreeItemCollapsibleState.Expanded);
      ti.contextValue = "group";
      return ti;
    }

    if (item.uri.scheme === "jsonlens-empty") {
      const ti = new vscode.TreeItem("No JSON files found", vscode.TreeItemCollapsibleState.None);
      ti.contextValue = "empty";
      ti.command = { command: "jsonlens.openInJsonLens", title: "Open JSON in JsonLens…" };
      return ti;
    }

    const label = path.basename(item.uri.fsPath);
    const ti = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    ti.description = vscode.workspace.asRelativePath(path.dirname(item.uri.fsPath));
    ti.resourceUri = item.uri;
    ti.command = { command: "jsonlens.openWithPreview", title: "Open Preview", arguments: [item.uri] };
    ti.contextValue = "jsonFile";
    return ti;
  }
}
