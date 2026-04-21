import { useCallback, useReducer } from "react";
import type { NodePayload, AnalysisPayload, ExtensionMessage } from "../types.js";
import { useVsCodeMessage } from "./useVsCodeMessage.js";

export interface WebviewState {
  selectedNode: NodePayload | null;
  analysisResult: AnalysisPayload | null;
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: "NODE_SELECTED"; payload: NodePayload }
  | { type: "ANALYSIS_RESULT"; payload: AnalysisPayload }
  | { type: "LOADING" }
  | { type: "ERROR"; message: string };

function reducer(state: WebviewState, action: Action): WebviewState {
  switch (action.type) {
    case "NODE_SELECTED":
      return { selectedNode: action.payload, analysisResult: null, loading: false, error: null };
    case "ANALYSIS_RESULT":
      return { ...state, analysisResult: action.payload, loading: false, error: null };
    case "LOADING":
      return { ...state, loading: true, error: null };
    case "ERROR":
      return { ...state, loading: false, error: action.message };
    default:
      return state;
  }
}

const initial: WebviewState = { selectedNode: null, analysisResult: null, loading: false, error: null };

export function useNodeData(): WebviewState {
  const [state, dispatch] = useReducer(reducer, initial);

  const handleMessage = useCallback((msg: ExtensionMessage) => {
    switch (msg.type) {
      case "node.selected":
        dispatch({ type: "NODE_SELECTED", payload: msg.payload });
        break;
      case "analysis.result":
        dispatch({ type: "ANALYSIS_RESULT", payload: msg.payload });
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
