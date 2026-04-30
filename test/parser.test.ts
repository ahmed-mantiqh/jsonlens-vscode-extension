import { describe, it, expect } from "vitest";
import { parseDocument, loadChildren } from "../src/core/parser.js";

describe("parseDocument (small tier)", () => {
  it("parses flat object", () => {
    const { root, errors } = parseDocument('{"a": 1, "b": "hello"}', "small");
    expect(errors).toHaveLength(0);
    expect(root.type).toBe("object");
    expect(root.childCount).toBe(2);
    expect(root.children).toHaveLength(2);
    const a = root.children![0];
    expect(a.key).toBe("a");
    expect(a.type).toBe("number");
    expect(a.value).toBe(1);
    expect(a.path).toEqual(["a"]);
  });

  it("parses nested object", () => {
    const { root } = parseDocument('{"user": {"name": "Alice"}}', "small");
    expect(root.children![0].type).toBe("object");
    expect(root.children![0].key).toBe("user");
    const name = root.children![0].children![0];
    expect(name.key).toBe("name");
    expect(name.value).toBe("Alice");
    expect(name.path).toEqual(["user", "name"]);
  });

  it("parses array", () => {
    const { root } = parseDocument('[1, 2, 3]', "small");
    expect(root.type).toBe("array");
    expect(root.childCount).toBe(3);
    expect(root.children![0].path).toEqual([0]);
    expect(root.children![2].value).toBe(3);
  });

  it("parses null/bool", () => {
    const { root } = parseDocument('{"x": null, "y": true}', "small");
    expect(root.children![0].type).toBe("null");
    expect(root.children![1].type).toBe("boolean");
    expect(root.children![1].value).toBe(true);
  });

  it("handles JSONC comments", () => {
    const { root, errors } = parseDocument('{"a": 1 /* comment */}', "small");
    expect(errors).toHaveLength(0);
    expect(root.children![0].value).toBe(1);
  });

  it("partial tree on syntax error, no throw", () => {
    const { root, errors } = parseDocument('{"a": }', "small");
    expect(errors.length).toBeGreaterThan(0);
    // Should not throw — root exists
    expect(root).toBeTruthy();
  });

  it("all nodes have correct ranges", () => {
    const text = '{"a": 1}';
    const { root } = parseDocument(text, "small");
    expect(root.range[0]).toBe(0);
    expect(root.range[1]).toBe(text.length);
  });
});

describe("parseDocument (medium tier)", () => {
  it("parses flat object, top-level only loaded", () => {
    const { root, errors } = parseDocument('{"a": {"x": 1}, "b": [1,2]}', "medium");
    expect(errors).toHaveLength(0);
    expect(root.type).toBe("object");
    const a = root.children!.find((c) => c.key === "a");
    expect(a).toBeTruthy();
    expect(a!.loaded).toBe(false); // lazy
    expect(a!.type).toBe("object");
  });
});

describe("loadChildren", () => {
  it("loads object children on demand", () => {
    const text = '{"user": {"name": "Alice", "age": 30}}';
    const { root } = parseDocument(text, "medium");
    const userNode = root.children!.find((c) => c.key === "user")!;
    expect(userNode.loaded).toBe(false);

    const children = loadChildren(userNode, text);
    expect(children).toHaveLength(2);
    expect(children[0].key).toBe("name");
    expect(children[0].value).toBe("Alice");
    expect(children[0].path).toEqual(["user", "name"]);
    expect(children[1].key).toBe("age");
    expect(children[1].value).toBe(30);
  });

  it("loads array children", () => {
    const text = '{"items": [10, 20, 30]}';
    const { root } = parseDocument(text, "medium");
    const items = root.children!.find((c) => c.key === "items")!;
    const children = loadChildren(items, text);
    expect(children).toHaveLength(3);
    expect(children[0].path).toEqual(["items", 0]);
    expect(children[2].value).toBe(30);
  });
});
