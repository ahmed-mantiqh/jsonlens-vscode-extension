import type { WebviewMessage } from "./types.js";

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let _api: ReturnType<typeof acquireVsCodeApi> | null = null;

function getApi() {
  if (!_api) _api = acquireVsCodeApi();
  return _api;
}

export function postMessage(msg: WebviewMessage): void {
  getApi().postMessage(msg);
}
