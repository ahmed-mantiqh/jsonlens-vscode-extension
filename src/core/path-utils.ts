import type { Path } from "./tree-node.js";

const NEEDS_BRACKET = /[.\[\]]/;

export function pathToString(path: Path): string {
  if (path.length === 0) return "$";
  let result = "$";
  for (const segment of path) {
    if (typeof segment === "number") {
      result += `[${segment}]`;
    } else if (NEEDS_BRACKET.test(segment) || segment === "") {
      result += `["${segment.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
    } else {
      result += `.${segment}`;
    }
  }
  return result;
}

export function pathToPointer(path: Path): string {
  if (path.length === 0) return "";
  return path
    .map((s) => String(s).replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/");
}

export function pathParent(path: Path): Path {
  return path.slice(0, -1);
}

export function pathEquals(a: Path, b: Path): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function isAncestor(ancestor: Path, child: Path): boolean {
  if (ancestor.length >= child.length) return false;
  for (let i = 0; i < ancestor.length; i++) {
    if (ancestor[i] !== child[i]) return false;
  }
  return true;
}

export function pathToSegments(path: Path): { label: string; path: Path }[] {
  return path.map((_, i) => ({
    label: String(path[i]),
    path: path.slice(0, i + 1),
  }));
}

export function stringToPath(s: string): Path {
  if (!s || s === "$") return [];
  const path: Path = [];
  let rest = s.startsWith("$") ? s.slice(1) : s;

  while (rest.length > 0) {
    if (rest.startsWith("[")) {
      const end = rest.indexOf("]");
      if (end === -1) break;
      const raw = rest.slice(1, end);
      rest = rest.slice(end + 1);
      if ((raw.startsWith('"') && raw.endsWith('"')) ||
          (raw.startsWith("'") && raw.endsWith("'"))) {
        path.push(raw.slice(1, -1));
      } else {
        const n = parseInt(raw, 10);
        path.push(isNaN(n) ? raw : n);
      }
    } else if (rest.startsWith(".")) {
      rest = rest.slice(1);
      const next = rest.search(/[.\[]/);
      const seg = next === -1 ? rest : rest.slice(0, next);
      if (seg) path.push(seg);
      rest = next === -1 ? "" : rest.slice(next);
    } else {
      break;
    }
  }

  return path;
}
