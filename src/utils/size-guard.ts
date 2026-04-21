import { getConfig } from "./config.js";

export type ParseTier = "small" | "medium" | "large";

export function classifySize(byteLength: number): ParseTier {
  const { largeFileMB, veryLargeFileMB } = getConfig();
  const mb = byteLength / (1024 * 1024);
  if (mb > veryLargeFileMB) return "large";
  if (mb > largeFileMB) return "medium";
  return "small";
}

export function isLikelyBinary(sample: string): boolean {
  // Check for null bytes or high concentration of non-printable chars
  let nonPrintable = 0;
  const limit = Math.min(sample.length, 512);
  for (let i = 0; i < limit; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      nonPrintable++;
    }
  }
  return nonPrintable / limit > 0.1;
}
