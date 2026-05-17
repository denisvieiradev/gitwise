import { describe, it, expect } from "@jest/globals";
import { ContextBuilder } from "../../../src/core/context.js";
import type { Document } from "../../../src/core/context.js";

describe("ContextBuilder", () => {
  const builder = new ContextBuilder();

  describe("normal mode", () => {
    it("should concatenate documents with headers", () => {
      const docs: Document[] = [
        { name: "PRD", content: "# My PRD\nContent here", priority: "high" },
        { name: "Techspec", content: "# My Techspec\nMore content", priority: "medium" },
      ];
      const result = builder.build(docs, "normal");
      expect(result).toContain("--- PRD ---");
      expect(result).toContain("--- Techspec ---");
      expect(result).toContain("# My PRD\nContent here");
    });

    it("should handle empty documents array", () => {
      const result = builder.build([], "normal");
      expect(result).toBe("");
    });
  });

  describe("light mode", () => {
    it("should sort by priority and chunk content", () => {
      const docs: Document[] = [
        { name: "Low", content: "## Section A\nLow content", priority: "low" },
        { name: "High", content: "## Section B\nHigh content", priority: "high" },
      ];
      const result = builder.build(docs, "light");
      const highPos = result.indexOf("--- High ---");
      const lowPos = result.indexOf("--- Low ---");
      expect(highPos).toBeLessThan(lowPos);
    });

    it("should chunk by headings", () => {
      const content = "## Section 1\nContent 1\n## Section 2\nContent 2";
      const docs: Document[] = [
        { name: "Doc", content, priority: "high" },
      ];
      const result = builder.build(docs, "light");
      expect(result).toContain("Section 1");
      expect(result).toContain("Section 2");
    });

    it("should respect character limit", () => {
      const longContent = Array(500).fill("## Heading\n" + "x".repeat(100)).join("\n");
      const docs: Document[] = [
        { name: "Big", content: longContent, priority: "high" },
      ];
      const result = builder.build(docs, "light");
      expect(result.length).toBeLessThan(longContent.length);
    });
  });
});
