// Minimal VS Code API mock for unit tests

export const workspace = {
  getConfiguration: (_section: string) => ({
    get: <T>(_key: string, defaultVal: T): T => defaultVal,
  }),
};

export const window = {
  createOutputChannel: () => ({ appendLine: () => {}, dispose: () => {} }),
  showInformationMessage: () => Promise.resolve(undefined),
  setStatusBarMessage: () => ({ dispose: () => {} }),
  activeTextEditor: undefined,
};

export const env = {
  clipboard: { writeText: () => Promise.resolve() },
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve(),
};

export class ThemeIcon {
  constructor(public id: string, public color?: unknown) {}
}
export class ThemeColor {
  constructor(public id: string) {}
}
export class TreeItem {
  constructor(public label: string, public collapsibleState?: number) {}
}
export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}
export class EventEmitter<T> {
  event = (_listener: (e: T) => void) => ({ dispose: () => {} });
  fire(_event: T) {}
  dispose() {}
}
export class Uri {
  static parse(s: string) { return { toString: () => s }; }
}
