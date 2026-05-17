import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { TemplateEngine } from "../../../src/core/template.js";

describe("TemplateEngine", () => {
  let tempDir: string;
  let engine: TemplateEngine;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "devflow-template-"));
    engine = new TemplateEngine(join(tempDir, "project-templates"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("load", () => {
    it("should load bundled template when no override exists", async () => {
      const content = await engine.load("prd");
      expect(content).toContain("{{feature_name}}");
    });

    it("should load project override when it exists", async () => {
      const overridePath = join(tempDir, "project-templates");
      await mkdir(overridePath, { recursive: true });
      await writeFile(
        join(overridePath, "prd.md"),
        "# Custom PRD: {{feature_name}}",
      );
      const content = await engine.load("prd");
      expect(content).toBe("# Custom PRD: {{feature_name}}");
    });

    it("should throw when template does not exist", async () => {
      await expect(engine.load("nonexistent")).rejects.toThrow(
        "Template 'nonexistent' not found",
      );
    });

    it("should reject path traversal attempts", async () => {
      await expect(engine.load("../../../.env")).rejects.toThrow(
        "Invalid template name",
      );
    });

    it("should reject template names with slashes", async () => {
      await expect(engine.load("foo/bar")).rejects.toThrow(
        "Invalid template name",
      );
    });

    it("should reject template names with dots", async () => {
      await expect(engine.load("..")).rejects.toThrow("Invalid template name");
    });

    it("should accept valid template names with hyphens and underscores", async () => {
      await expect(engine.load("my-template_v2")).rejects.toThrow(
        "not found",
      );
    });
  });

  describe("interpolate", () => {
    it("should replace variables with values", () => {
      const template = "Hello {{name}}, welcome to {{project}}!";
      const result = engine.interpolate(template, {
        name: "John",
        project: "DevFlow",
      });
      expect(result).toBe("Hello John, welcome to DevFlow!");
    });

    it("should keep unmatched variables as-is", () => {
      const template = "Hello {{name}}, your role is {{role}}";
      const result = engine.interpolate(template, { name: "John" });
      expect(result).toBe("Hello John, your role is {{role}}");
    });

    it("should handle template with no variables", () => {
      const template = "No variables here";
      const result = engine.interpolate(template, { name: "John" });
      expect(result).toBe("No variables here");
    });

    it("should handle empty vars", () => {
      const template = "Hello {{name}}";
      const result = engine.interpolate(template, {});
      expect(result).toBe("Hello {{name}}");
    });
  });

  describe("validateRequiredVars", () => {
    it("should return empty array when all required vars are provided", () => {
      const template = "{{name}} — {{project}}";
      const missing = engine.validateRequiredVars(template, ["name", "project"], {
        name: "John",
        project: "DevFlow",
      });
      expect(missing).toHaveLength(0);
    });

    it("should return missing vars", () => {
      const template = "{{name}} — {{project}}";
      const missing = engine.validateRequiredVars(template, ["name", "project"], {
        name: "John",
      });
      expect(missing).toEqual(["project"]);
    });

    it("should ignore vars not in template", () => {
      const template = "{{name}} only";
      const missing = engine.validateRequiredVars(template, ["name", "project"], {
        name: "John",
      });
      expect(missing).toHaveLength(0);
    });
  });
});
