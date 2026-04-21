import { describe, it, expect } from "vitest";
import { parseDocument } from "../src/core/parser.js";
import { loadChildrenAll } from "../src/core/parser.js";

// Test the subtree-isolation logic that incremental-updater.ts relies on.
// We verify: loadChildrenAll skips pagination and returns all children.

describe("loadChildrenAll", () => {
  it("returns all children without sentinel for small arrays", () => {
    const json = '{"items": [1,2,3]}';
    const { root } = parseDocument(json, "small");
    const itemsNode = root.children![0];
    const all = loadChildrenAll(itemsNode, json);
    expect(all.length).toBe(3);
    expect(all.every(c => c.key !== " more")).toBe(true);
  });

  it("returns all children without pagination for large arrays", () => {
    // Build JSON with 250 items; loadChildrenAll skips pagination
    const items = Array.from({ length: 250 }, (_, i) => i);
    const json = JSON.stringify({ arr: items });
    const { root } = parseDocument(json, "small");
    const arrNode = root.children![0];

    const all = loadChildrenAll(arrNode, json);
    expect(all.length).toBe(250);
    expect(all.every(c => c.key !== " more")).toBe(true);
  });
});

describe("subtree range detection (parseDocument small tier)", () => {
  it("children have absolute ranges that match their text", () => {
    const json = '{"a":{"x":1},"b":[1,2,3]}';
    const { root } = parseDocument(json, "small");
    for (const child of root.children!) {
      const slice = json.slice(child.range[0], child.range[1]);
      // slice should be parseable as valid JSON
      expect(() => JSON.parse(slice)).not.toThrow();
    }
  });

  it("range[0] of child matches its value start in the text", () => {
    const json = '{"key": "value"}';
    const { root } = parseDocument(json, "small");
    const keyNode = root.children![0];
    expect(json.slice(keyNode.range[0], keyNode.range[1])).toBe('"value"');
  });

  it("array items have sequential ranges", () => {
    const json = "[1, 2, 3]";
    const { root } = parseDocument(json, "small");
    const children = root.children!;
    expect(children[0].range[0]).toBeLessThan(children[1].range[0]);
    expect(children[1].range[0]).toBeLessThan(children[2].range[0]);
  });
});

describe("value-only change detection (structural char check)", () => {
  const STRUCTURAL = new Set(["{", "}", "[", "]", ":", ","]);

  function isStructural(text: string): boolean {
    for (const ch of text) if (STRUCTURAL.has(ch)) return true;
    return false;
  }

  it("plain string edit is not structural", () => {
    expect(isStructural("hello")).toBe(false);
    expect(isStructural("world 123")).toBe(false);
  });

  it("adding a brace is structural", () => {
    expect(isStructural("{")).toBe(true);
    expect(isStructural("}")).toBe(true);
    expect(isStructural("[")).toBe(true);
    expect(isStructural("]")).toBe(true);
  });

  it("colon addition is structural", () => {
    expect(isStructural(":")).toBe(true);
  });

  it("comma addition is structural", () => {
    expect(isStructural(",")).toBe(true);
  });
});
