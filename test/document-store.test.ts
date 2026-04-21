import { describe, it, expect, beforeEach } from "vitest";
import * as store from "../src/core/document-store.js";
import { parseDocument } from "../src/core/parser.js";
import type { ParsedDocumentState } from "../src/core/document-store.js";

function makeState(uri: string, json: string): ParsedDocumentState {
  const { root, errors } = parseDocument(json, "small");
  return {
    uri,
    version: 1,
    root,
    rawText: json,
    parseErrors: errors,
    lastAccessedAt: Date.now(),
    isLarge: false,
  };
}

describe("DocumentStore", () => {
  beforeEach(() => {
    store.invalidate("file:///a.json");
    store.invalidate("file:///b.json");
    store.invalidate("file:///c.json");
  });

  it("set and get", () => {
    const state = makeState("file:///a.json", '{"x": 1}');
    store.set("file:///a.json", state);
    expect(store.get("file:///a.json")).toBe(state);
  });

  it("invalidate removes entry", () => {
    store.set("file:///a.json", makeState("file:///a.json", '{"x": 1}'));
    store.invalidate("file:///a.json");
    expect(store.get("file:///a.json")).toBeUndefined();
  });

  describe("getNodeAtPath", () => {
    it("finds root", () => {
      store.set("file:///a.json", makeState("file:///a.json", '{"x": 1}'));
      const node = store.getNodeAtPath("file:///a.json", []);
      expect(node?.type).toBe("object");
    });

    it("finds nested key", () => {
      store.set("file:///a.json", makeState("file:///a.json", '{"user": {"name": "Alice"}}'));
      const node = store.getNodeAtPath("file:///a.json", ["user", "name"]);
      expect(node?.value).toBe("Alice");
    });

    it("returns null for missing path", () => {
      store.set("file:///a.json", makeState("file:///a.json", '{"x": 1}'));
      expect(store.getNodeAtPath("file:///a.json", ["missing"])).toBeNull();
    });

    it("finds array index", () => {
      store.set("file:///a.json", makeState("file:///a.json", '[10, 20, 30]'));
      const node = store.getNodeAtPath("file:///a.json", [2]);
      expect(node?.value).toBe(30);
    });
  });

  describe("getNodeAtOffset", () => {
    it("finds leaf at offset", () => {
      const text = '{"a": 1}';
      // "a" value is at offset 6 (the '1')
      store.set("file:///a.json", makeState("file:///a.json", text));
      const node = store.getNodeAtOffset("file:///a.json", 6);
      expect(node?.type).toBe("number");
      expect(node?.value).toBe(1);
    });

    it("returns null for unknown uri", () => {
      expect(store.getNodeAtOffset("file:///unknown.json", 0)).toBeNull();
    });
  });
});
