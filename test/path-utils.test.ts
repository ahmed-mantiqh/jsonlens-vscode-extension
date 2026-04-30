import { describe, it, expect } from "vitest";
import {
  pathToString,
  pathToPointer,
  pathParent,
  pathEquals,
  isAncestor,
  pathToSegments,
  stringToPath,
} from "../src/core/path-utils.js";

describe("pathToString", () => {
  it("empty path = $", () => expect(pathToString([])).toBe("$"));
  it("simple keys", () => expect(pathToString(["users", "name"])).toBe("$.users.name"));
  it("array index", () => expect(pathToString(["users", 0, "email"])).toBe("$.users[0].email"));
  it("key with dot uses bracket notation", () =>
    expect(pathToString(["a.b"])).toBe('$["a.b"]'));
  it("key with bracket uses bracket notation", () =>
    expect(pathToString(["a[0]"])).toBe('$["a[0]"]'));
  it("empty string key", () => expect(pathToString([""])).toBe('$[""]'));
});

describe("pathToPointer", () => {
  it("empty = empty string", () => expect(pathToPointer([])).toBe(""));
  it("simple", () => expect(pathToPointer(["a", "b"])).toBe("a/b"));
  it("escapes tilde", () => expect(pathToPointer(["a~b"])).toBe("a~0b"));
  it("escapes slash", () => expect(pathToPointer(["a/b"])).toBe("a~1b"));
});

describe("pathParent", () => {
  it("returns parent path", () => expect(pathParent(["a", "b", "c"])).toEqual(["a", "b"]));
  it("root parent = []", () => expect(pathParent(["a"])).toEqual([]));
});

describe("pathEquals", () => {
  it("equal paths", () => expect(pathEquals(["a", 0], ["a", 0])).toBe(true));
  it("different length", () => expect(pathEquals(["a"], ["a", "b"])).toBe(false));
  it("different value", () => expect(pathEquals(["a", 0], ["a", 1])).toBe(false));
});

describe("isAncestor", () => {
  it("parent is ancestor", () => expect(isAncestor(["a"], ["a", "b"])).toBe(true));
  it("grandparent is ancestor", () => expect(isAncestor(["a"], ["a", "b", "c"])).toBe(true));
  it("same path is not ancestor", () => expect(isAncestor(["a", "b"], ["a", "b"])).toBe(false));
  it("sibling is not ancestor", () => expect(isAncestor(["a", "x"], ["a", "b"])).toBe(false));
  it("root is ancestor of everything", () => expect(isAncestor([], ["a"])).toBe(true));
});

describe("stringToPath", () => {
  it("root", () => expect(stringToPath("$")).toEqual([]));
  it("simple keys", () => expect(stringToPath("$.users.name")).toEqual(["users", "name"]));
  it("array index", () => expect(stringToPath("$.users[0].email")).toEqual(["users", 0, "email"]));
  it("bracket string key", () => expect(stringToPath('$["a.b"]')).toEqual(["a.b"]));
  it("empty = []", () => expect(stringToPath("")).toEqual([]));
});

describe("pathToSegments", () => {
  it("produces correct segments", () => {
    const segs = pathToSegments(["users", 0, "email"]);
    expect(segs).toEqual([
      { label: "users", path: ["users"] },
      { label: "0", path: ["users", 0] },
      { label: "email", path: ["users", 0, "email"] },
    ]);
  });
});
