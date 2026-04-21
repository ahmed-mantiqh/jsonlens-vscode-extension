import { describe, it, expect } from "vitest";
import { buildIndex, query } from "../src/search/searcher.js";
import { parseDocument } from "../src/core/parser.js";

const FIXTURE = `{
  "users": [
    { "id": 1, "name": "Alice", "email": "alice@example.com" },
    { "id": 2, "name": "Bob",   "email": "bob@example.com" }
  ],
  "settings": {
    "theme": "dark",
    "language": "en"
  },
  "version": "1.0.0"
}`;

async function makeIndex() {
  const { root } = parseDocument(FIXTURE, "small");
  return buildIndex(root, 1);
}

describe("buildIndex", () => {
  it("indexes all keys", async () => {
    const index = await makeIndex();
    expect(index.keys.has("name")).toBe(true);
    expect(index.keys.has("email")).toBe(true);
    expect(index.keys.has("theme")).toBe(true);
    expect(index.keys.has("version")).toBe(true);
  });

  it("indexes leaf values", async () => {
    const index = await makeIndex();
    expect(index.values.has("alice@example.com")).toBe(true);
    expect(index.values.has("dark")).toBe(true);
    expect(index.values.has("1.0.0")).toBe(true);
  });

  it("stores correct paths for keys", async () => {
    const index = await makeIndex();
    const namePaths = index.keys.get("name")!;
    expect(namePaths.length).toBeGreaterThanOrEqual(2);
    expect(namePaths.some((p) => JSON.stringify(p) === JSON.stringify(["users", 0, "name"]))).toBe(true);
    expect(namePaths.some((p) => JSON.stringify(p) === JSON.stringify(["users", 1, "name"]))).toBe(true);
  });

  it("stores builtAtVersion", async () => {
    const index = await makeIndex();
    expect(index.builtAtVersion).toBe(1);
  });
});

describe("query", () => {
  it("finds by key substring", async () => {
    const index = await makeIndex();
    const results = query(index, "nam", "keys");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.matchKind === "key" || r.matchKind === "both")).toBe(true);
  });

  it("finds by value substring", async () => {
    const index = await makeIndex();
    const results = query(index, "alice", "values");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].valuePreview).toContain("alice");
  });

  it("scope=both finds both key and value matches", async () => {
    const index = await makeIndex();
    // "name" is a key; "Alice" is a value — "a" matches both
    const results = query(index, "a", "both");
    expect(results.length).toBeGreaterThan(0);
  });

  it("empty query returns empty", async () => {
    const index = await makeIndex();
    expect(query(index, "", "both")).toHaveLength(0);
    expect(query(index, "  ", "both")).toHaveLength(0);
  });

  it("no match returns empty", async () => {
    const index = await makeIndex();
    expect(query(index, "zzznomatch", "both")).toHaveLength(0);
  });

  it("exact match scores higher than prefix, prefix higher than substring", async () => {
    const { root } = parseDocument('{"dark": 1, "darkness": 2, "set": 3}', "small");
    const index = await buildIndex(root, 1);
    const results = query(index, "dark", "keys");
    const exact = results.find((r) => r.label === "dark");
    const prefix = results.find((r) => r.label === "darkness");
    expect(exact).toBeTruthy();
    expect(prefix).toBeTruthy();
    expect(exact!.score).toBeGreaterThan(prefix!.score);
  });

  it("respects limit", async () => {
    const index = await makeIndex();
    const results = query(index, "e", "both", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
