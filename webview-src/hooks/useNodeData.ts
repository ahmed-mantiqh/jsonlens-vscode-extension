import { useCallback, useReducer } from "react";
import type { NodePayload, AnalysisPayload, SchemaPayload, SearchResultPayload, ExtensionMessage } from "../types.js";
import { useVsCodeMessage } from "./useVsCodeMessage.js";

export interface WebviewState {
  selectedNode: NodePayload | null;
  columns: NodePayload[];
  analysisResult: AnalysisPayload | null;
  schemaResult: SchemaPayload | null;
  searchResult: SearchResultPayload | null;
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: "NODE_SELECTED";    payload: NodePayload; columns?: NodePayload[] }
  | { type: "ANALYSIS_RESULT"; payload: AnalysisPayload }
  | { type: "SCHEMA_RESULT";   payload: SchemaPayload }
  | { type: "SEARCH_RESULT";   payload: SearchResultPayload }
  | { type: "LOADING" }
  | { type: "ERROR"; message: string };

function reducer(state: WebviewState, action: Action): WebviewState {
  switch (action.type) {
    case "NODE_SELECTED":
      return {
        selectedNode: action.payload,
        columns: action.columns ?? updateColumns(state.columns, action.payload),
        analysisResult: null,
        schemaResult: null,
        loading: false,
        error: null,
      };
    case "ANALYSIS_RESULT":
      return { ...state, analysisResult: action.payload, schemaResult: null, loading: false, error: null };
    case "SCHEMA_RESULT":
      return { ...state, schemaResult: action.payload, analysisResult: null, loading: false, error: null };
    case "SEARCH_RESULT":
      return { ...state, searchResult: action.payload };
    case "LOADING":
      return { ...state, loading: true, error: null };
    case "ERROR":
      return { ...state, loading: false, error: action.message };
    default:
      return state;
  }
}

const initial: WebviewState = {
  selectedNode: null, columns: [], analysisResult: null, schemaResult: null, searchResult: null, loading: false, error: null,
};

function updateColumns(columns: NodePayload[], node: NodePayload): NodePayload[] {
  if (node.path === "$") return [node];

  const existingIndex = columns.findIndex((column) => column.path === node.path);
  if (existingIndex >= 0) {
    return [...columns.slice(0, existingIndex), node];
  }

  const parentPath = node.breadcrumb[node.breadcrumb.length - 2]?.path;
  const parentIndex = parentPath
    ? columns.findIndex((column) => column.path === parentPath)
    : -1;

  if (parentIndex >= 0) {
    return [...columns.slice(0, parentIndex + 1), node];
  }

  return [node];
}

export function useNodeData(): WebviewState {
  const [state, dispatch] = useReducer(reducer, initial);

  const handleMessage = useCallback((msg: ExtensionMessage) => {
    switch (msg.type) {
      case "node.selected":
        dispatch({ type: "NODE_SELECTED", payload: msg.payload, columns: msg.columns });
        break;
      case "analysis.result":
        dispatch({ type: "ANALYSIS_RESULT", payload: msg.payload });
        break;
      case "schema.result":
        dispatch({ type: "SCHEMA_RESULT", payload: msg.payload });
        break;
      case "search.results":
        dispatch({ type: "SEARCH_RESULT", payload: msg.payload });
        break;
      case "node.loading":
        dispatch({ type: "LOADING" });
        break;
      case "error":
        dispatch({ type: "ERROR", message: msg.payload.message });
        break;
    }
  }, []);

  useVsCodeMessage(handleMessage);
  return state;
}
