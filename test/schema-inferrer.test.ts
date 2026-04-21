import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { inferSchemaSlice, mergeSchemas } from "../src/analysis/schema-inferrer.js";

const ajv = new Ajv({ strict: false });

function validSchema(schema: object): boolean {
  try {
    ajv.compile(schema);
    return true;
  } catch {
    return false;
  }
}

describe("inferSchemaSlice", () => {
  it("returns empty on invalid JSON", () => {
    const r = inferSchemaSlice("not json", 20);
    expect(r.schema).toEqual({});
    expect(r.nodeCount).toBe(0);
  });

  it("infers null", () => {
    const r = inferSchemaSlice("null", 20);
    expect(r.schema).toMatchObject({ type: "null" });
  });

  it("infers boolean", () => {
    expect(inferSchemaSlice("true", 20).schema).toMatchObject({ type: "boolean" });
  });

  it("infers integer", () => {
    expect(inferSchemaSlice("42", 20).schema).toMatchObject({ type: "integer" });
  });

  it("infers number (float)", () => {
    expect(inferSchemaSlice("3.14", 20).schema).toMatchObject({ type: "number" });
  });

  it("infers string", () => {
    expect(inferSchemaSlice('"hello"', 20).schema).toMatchObject({ type: "string" });
  });

  describe("format hints", () => {
    it("detects date format", () => {
      const r = inferSchemaSlice('"2024-01-15"', 20);
      expect(r.schema).toMatchObject({ type: "string", format: "date" });
    });

    it("detects date-time format", () => {
      const r = inferSchemaSlice('"2024-01-15T10:30:00Z"', 20);
      expect(r.schema).toMatchObject({ type: "string", format: "date-time" });
    });

    it("detects uri format", () => {
      const r = inferSchemaSlice('"https://example.com/path"', 20);
      expect(r.schema).toMatchObject({ type: "string", format: "uri" });
    });

    it("detects email format", () => {
      const r = inferSchemaSlice('"alice@example.com"', 20);
      expect(r.schema).toMatchObject({ type: "string", format: "email" });
    });
  });

  describe("object inference", () => {
    it("infers object schema", () => {
      const obj = { name: "Alice", age: 30, active: true };
      const r = inferSchemaSlice(JSON.stringify(obj), 20);
      expect(r.schema.type).toBe("object");
      expect(r.schema.properties).toBeDefined();
      expect((r.schema.properties as Record<string, unknown>)["name"]).toMatchObject({ type: "string" });
      expect((r.schema.properties as Record<string, unknown>)["age"]).toMatchObject({ type: "integer" });
    });

    it("single object: all keys required", () => {
      const r = inferSchemaSlice('{"a":1,"b":2}', 20);
      expect(r.schema.required).toContain("a");
      expect(r.schema.required).toContain("b");
    });

    it("produces valid Draft-07 schema", () => {
      const obj = { user: { name: "Bob", scores: [1, 2, 3] } };
      const r = inferSchemaSlice(JSON.stringify(obj), 20);
      expect(validSchema(r.schema)).toBe(true);
    });
  });

  describe("array inference", () => {
    it("infers array of objects", () => {
      const arr = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
      const r = inferSchemaSlice(JSON.stringify(arr), 20);
      expect(r.schema.type).toBe("array");
      expect(r.schema.items).toBeDefined();
      expect(r.schema.items!.type).toBe("object");
    });

    it("required keys at 80% threshold", () => {
      const arr = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        ...(i < 9 ? { name: `user${i}` } : {}), // name in 9/10 = 90%
        ...(i < 4 ? { rare: true } : {}),          // rare in 4/10 = 40%
      }));
      const r = inferSchemaSlice(JSON.stringify(arr), 20);
      const required = r.schema.items?.required ?? [];
      expect(required).toContain("id");
      expect(required).toContain("name");
      expect(required).not.toContain("rare");
    });

    it("enum detection for repeated values", () => {
      const arr = [
        { status: "active" }, { status: "inactive" }, { status: "active" },
        { status: "pending" }, { status: "active" }, { status: "inactive" },
      ];
      const r = inferSchemaSlice(JSON.stringify(arr), 20);
      const statusSchema = (r.schema.items?.properties as Record<string, unknown> | undefined)?.["status"] as { enum?: unknown[] };
      expect(statusSchema?.enum).toBeDefined();
      expect(statusSchema?.enum?.length).toBeLessThanOrEqual(10);
    });

    it("empty array", () => {
      const r = inferSchemaSlice("[]", 20);
      expect(r.schema.type).toBe("array");
      expect(r.schema.items).toBeUndefined();
    });

    it("array of mixed types", () => {
      const r = inferSchemaSlice('[1, "hello", true]', 20);
      const itemType = r.schema.items?.type;
      expect(Array.isArray(itemType) ? itemType : [itemType]).toContain("string");
    });
  });

  it("respects depth cap", () => {
    // deeply nested — should not throw
    let deep: unknown = "leaf";
    for (let i = 0; i < 30; i++) deep = { child: deep };
    const r = inferSchemaSlice(JSON.stringify(deep), 20);
    expect(r.schema.type).toBe("object");
    expect(r.nodeCount).toBeGreaterThan(0);
  });

  it("tracks nodeCount", () => {
    const r = inferSchemaSlice('{"a":1,"b":"x","c":true}', 20);
    expect(r.nodeCount).toBeGreaterThan(1);
  });
});

describe("mergeSchemas", () => {
  it("merges object schemas: required = ≥80%", () => {
    const schemas = Array.from({ length: 5 }, (_, i) => ({
      type: "object" as const,
      properties: {
        id: { type: "integer" as const },
        ...(i < 4 ? { name: { type: "string" as const } } : {}),
      },
      required: ["id", ...(i < 4 ? ["name"] : [])],
    }));
    const merged = mergeSchemas(schemas);
    expect(merged.required).toContain("id");
    expect(merged.required).toContain("name"); // 4/5 = 80%
  });

  it("enum from repeated strings", () => {
    const schemas = ["a", "b", "a", "b", "c"].map(v => ({
      type: "string" as const,
      _raw: v,
    }));
    const merged = mergeSchemas(schemas);
    expect(merged.enum).toBeDefined();
    expect(new Set(merged.enum)).toEqual(new Set(["a", "b", "c"]));
  });

  it("no enum when unique count > 10", () => {
    const schemas = Array.from({ length: 15 }, (_, i) => ({
      type: "string" as const,
      _raw: `val${i}`,
    }));
    const merged = mergeSchemas(schemas);
    expect(merged.enum).toBeUndefined();
    expect(merged.type).toBe("string");
  });

  it("integer + number → number", () => {
    const merged = mergeSchemas([
      { type: "integer" as const },
      { type: "number" as const },
    ]);
    expect(merged.type).toBe("number");
  });
});
