import { describe, it, expect } from "vitest";
import { analyzeSlice } from "../src/analysis/field-analyzer.js";

const ITEMS = [
  { name: "Alice", age: 30, email: "alice@example.com" },
  { name: "Bob",   age: 25, email: "bob@example.com" },
  { name: "Carol", age: 28 },
];

describe("analyzeSlice", () => {
  it("returns empty payload for non-array", () => {
    const r = analyzeSlice('{"a":1}', "$", 100);
    expect(r.rows).toHaveLength(0);
    expect(r.totalItems).toBe(0);
  });

  it("returns empty payload for invalid JSON", () => {
    const r = analyzeSlice("not json", "$", 100);
    expect(r.rows).toHaveLength(0);
  });

  it("counts keys correctly", () => {
    const r = analyzeSlice(JSON.stringify(ITEMS), "$.users", 100);
    expect(r.totalItems).toBe(3);
    expect(r.sampledItems).toBe(3);
    expect(r.skippedNonObjects).toBe(0);

    const nameRow = r.rows.find(x => x.key === "name")!;
    expect(nameRow.count).toBe(3);
    expect(nameRow.coverage).toBeCloseTo(1.0);
    expect(nameRow.status).toBe("ok");

    const emailRow = r.rows.find(x => x.key === "email")!;
    expect(emailRow.count).toBe(2);
    expect(emailRow.coverage).toBeCloseTo(2 / 3);
    expect(emailRow.status).toBe("sparse");
  });

  it("marks inconsistent type as inconsistent", () => {
    const data = [
      { val: "hello" },
      { val: 42 },
      { val: "world" },
    ];
    const r = analyzeSlice(JSON.stringify(data), "$", 100);
    const row = r.rows.find(x => x.key === "val")!;
    expect(row.types).toContain("string");
    expect(row.types).toContain("number");
    expect(row.status).toBe("inconsistent");
  });

  it("skips non-object items", () => {
    const data = [{ a: 1 }, "not-an-object", 42, { a: 2 }];
    const r = analyzeSlice(JSON.stringify(data), "$", 100);
    expect(r.skippedNonObjects).toBe(2);
    const row = r.rows.find(x => x.key === "a")!;
    expect(row.count).toBe(2);
    expect(row.coverage).toBeCloseTo(1.0);
  });

  it("respects maxItems cap", () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const r = analyzeSlice(JSON.stringify(data), "$", 10);
    expect(r.totalItems).toBe(100);
    expect(r.sampledItems).toBe(10);
    expect(r.rows[0].count).toBe(10);
  });

  it("sorts rows by count descending by default", () => {
    const data = [
      { a: 1, b: 1, c: 1 },
      { a: 2, b: 2 },
      { a: 3 },
    ];
    const r = analyzeSlice(JSON.stringify(data), "$", 100);
    expect(r.rows[0].key).toBe("a");
    expect(r.rows[0].count).toBe(3);
  });

  it("firstPath points to first occurrence", () => {
    const r = analyzeSlice(JSON.stringify(ITEMS), "$.users", 100);
    const emailRow = r.rows.find(x => x.key === "email")!;
    expect(emailRow.firstPath).toBe('$.users[0]["email"]');
  });

  it("handles empty array", () => {
    const r = analyzeSlice("[]", "$", 100);
    expect(r.rows).toHaveLength(0);
    expect(r.totalItems).toBe(0);
  });

  it("null values counted as null type", () => {
    const data = [{ x: null }, { x: null }];
    const r = analyzeSlice(JSON.stringify(data), "$", 100);
    const row = r.rows.find(x => x.key === "x")!;
    expect(row.types).toEqual(["null"]);
    expect(row.status).toBe("ok");
  });
});
