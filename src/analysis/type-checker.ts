import type { SemanticHint } from "../webview/message-bridge.js";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|tiff?)(\?[^#]*)?$/i;
const COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Must be at least YYYY-MM-DD; reject bare numbers like "2" or "2024"
const DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])([ T][\d:.Z+\-]+)?$/;

export type { SemanticHint };

export function detectSemantics(value: unknown): SemanticHint | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > 2048) return null;

  // Image URL — check before generic URL to give it a distinct kind
  if (IMAGE_EXT.test(v)) {
    try {
      const url = new URL(v);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return { kind: "image", url: v };
      }
    } catch {
      // relative image path
      if (/^\.{0,2}\//.test(v)) return { kind: "image", url: v };
    }
  }

  // URL
  try {
    const url = new URL(v);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return { kind: "url", value: v };
    }
  } catch {}

  // Date — must parse cleanly and not be a plain number
  if (DATE_RE.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return { kind: "date", iso: v, display: formatDate(d) };
    }
  }

  // Hex color
  if (COLOR_RE.test(v)) {
    return { kind: "color", hex: v };
  }

  // Email
  if (EMAIL_RE.test(v) && v.length <= 254) {
    return { kind: "email", value: v };
  }

  return null;
}

function formatDate(d: Date): string {
  try {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return d.toISOString();
  }
}
