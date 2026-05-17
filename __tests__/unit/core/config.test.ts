import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { readConfig, writeConfig, mergeWithDefaults, validateConfig } from "../../../src/core/config.js";
import { DEFAULT_CONFIG, type DevflowConfig } from "../../../src/core/types.js";
import { ensureDir, writeJSON } from "../../../src/infra/filesystem.js";

describe("ConfigManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "devflow-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("mergeWithDefaults", () => {
    it("should return default config when given empty object", () => {
      const result = mergeWithDefaults({});
      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it("should override top-level fields", () => {
      const result = mergeWithDefaults({ contextMode: "light" });
      expect(result.contextMode).toBe("light");
      expect(result.provider).toBe("claude-code-api-key");
    });

    it("should deep merge models", () => {
      const result = mergeWithDefaults({
        models: { fast: "custom-model", balanced: "", powerful: "" },
      });
      expect(result.models.fast).toBe("custom-model");
    });

    it("should deep merge project info", () => {
      const result = mergeWithDefaults({
        project: { name: "my-app", language: "typescript", framework: null, testFramework: null, hasCI: false },
      });
      expect(result.project.name).toBe("my-app");
    });
  });

  describe("validateConfig", () => {
    it("should return no errors for valid config", () => {
      const errors = validateConfig(DEFAULT_CONFIG);
      expect(errors).toHaveLength(0);
    });

    it("should return error for missing provider", () => {
      const config = { ...DEFAULT_CONFIG, provider: "" as DevflowConfig["provider"] };
      const errors = validateConfig(config);
      expect(errors).toContain("provider is required");
    });

    it("should return error for invalid context mode", () => {
      const config = { ...DEFAULT_CONFIG, contextMode: "invalid" as DevflowConfig["contextMode"] };
      const errors = validateConfig(config);
      expect(errors).toContain("contextMode must be 'light' or 'normal'");
    });
  });

  describe("readConfig", () => {
    it("should return null when config does not exist", async () => {
      const result = await readConfig(tempDir);
      expect(result).toBeNull();
    });

    it("should read and merge config with defaults", async () => {
      const configPath = join(tempDir, ".devflow", "config.json");
      await ensureDir(join(tempDir, ".devflow"));
      await writeJSON(configPath, { contextMode: "light" });
      const result = await readConfig(tempDir);
      expect(result).not.toBeNull();
      expect(result!.contextMode).toBe("light");
      expect(result!.provider).toBe("claude-code-api-key");
    });
  });

  describe("writeConfig", () => {
    it("should write config and create directories", async () => {
      await writeConfig(tempDir, DEFAULT_CONFIG);
      const result = await readConfig(tempDir);
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("claude-code-api-key");
    });
  });
});
