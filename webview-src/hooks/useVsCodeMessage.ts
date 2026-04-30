import { useEffect } from "react";
import type { ExtensionMessage } from "../types.js";

export function useVsCodeMessage(handler: (msg: ExtensionMessage) => void): void {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => handler(event.data as ExtensionMessage);
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handler]);
}
