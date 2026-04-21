import { describe, it, expect } from "vitest";
import { detectSemantics } from "../src/analysis/type-checker.js";

describe("detectSemantics", () => {
  it("returns null for non-strings", () => {
    expect(detectSemantics(42)).toBeNull();
    expect(detectSemantics(null)).toBeNull();
    expect(detectSemantics(true)).toBeNull();
    expect(detectSemantics({})).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detectSemantics("")).toBeNull();
    expect(detectSemantics("  ")).toBeNull();
  });

  describe("image URL detection", () => {
    it("detects https image URLs", () => {
      const r = detectSemantics("https://example.com/photo.jpg");
      expect(r?.kind).toBe("image");
    });
    it("detects png, gif, webp, svg", () => {
      expect(detectSemantics("https://cdn.example.com/a.png")?.kind).toBe("image");
      expect(detectSemantics("https://cdn.example.com/a.gif")?.kind).toBe("image");
      expect(detectSemantics("https://cdn.example.com/a.webp")?.kind).toBe("image");
      expect(detectSemantics("https://cdn.example.com/a.svg")?.kind).toBe("image");
    });
    it("image URL takes priority over generic URL", () => {
      const r = detectSemantics("https://example.com/img.png?v=2");
      expect(r?.kind).toBe("image");
    });
  });

  describe("URL detection", () => {
    it("detects https URLs", () => {
      const r = detectSemantics("https://example.com/page");
      expect(r?.kind).toBe("url");
    });
    it("detects http URLs", () => {
      const r = detectSemantics("http://example.com");
      expect(r?.kind).toBe("url");
    });
    it("ignores non-http protocols", () => {
      expect(detectSemantics("ftp://example.com")).toBeNull();
      // mailto: is not a URL — falls through to email detection since a@b.com is valid
    });
    it("plain text not URL", () => {
      expect(detectSemantics("hello world")).toBeNull();
    });
  });

  describe("date detection", () => {
    it("detects ISO 8601 date", () => {
      const r = detectSemantics("2024-01-15");
      expect(r?.kind).toBe("date");
    });
    it("detects datetime with time", () => {
      const r = detectSemantics("2024-01-15T10:30:00Z");
      expect(r?.kind).toBe("date");
      expect((r as { display: string })?.display).toBeTruthy();
    });
    it("does NOT detect bare year", () => {
      expect(detectSemantics("2024")).toBeNull();
    });
    it("does NOT detect bare number string", () => {
      expect(detectSemantics("2")).toBeNull();
    });
    it("does NOT detect invalid date", () => {
      expect(detectSemantics("2024-99-99")).toBeNull();
    });
  });

  describe("color detection", () => {
    it("detects 6-digit hex", () => {
      const r = detectSemantics("#FF5733");
      expect(r?.kind).toBe("color");
      if (r?.kind === "color") expect(r.hex).toBe("#FF5733");
    });
    it("detects 3-digit hex", () => {
      expect(detectSemantics("#fff")?.kind).toBe("color");
    });
    it("detects 8-digit hex (alpha)", () => {
      expect(detectSemantics("#FF573380")?.kind).toBe("color");
    });
    it("rejects non-hex color", () => {
      expect(detectSemantics("#GGGGGG")).toBeNull();
      expect(detectSemantics("red")).toBeNull();
    });
  });

  describe("email detection", () => {
    it("detects email addresses", () => {
      const r = detectSemantics("alice@example.com");
      expect(r?.kind).toBe("email");
    });
    it("rejects non-email strings", () => {
      expect(detectSemantics("notanemail")).toBeNull();
      expect(detectSemantics("missing@tld")).toBeNull();
    });
  });

  describe("detection order", () => {
    it("image URL beats generic URL", () => {
      expect(detectSemantics("https://example.com/a.png")?.kind).toBe("image");
    });
    it("URL beats date (URL takes priority for http strings)", () => {
      // A URL that happens to look date-like won't be detected as date first
      const r = detectSemantics("https://2024-01-15.example.com/");
      expect(r?.kind).toBe("url");
    });
  });
});
