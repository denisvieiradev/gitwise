import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getMergedConfig, getApiKey } from "../../../src/config/merge.js";
import { writeUserConfig, writeApiKey, readUserConfig } from "../../../src/config/user.js";
import { DEFAULT_USER_CONFIG } from "../../../src/config/types.js";

describe("config (core)", () => {
  let homeDir: string;
  let cwd: string;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "gitwise-home-"));
    cwd = await mkdtemp(join(tmpdir(), "gitwise-repo-"));
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });

  describe("getMergedConfig", () => {
    it("returns defaults when neither user nor repo config exists", async () => {
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.provider).toBe(DEFAULT_USER_CONFIG.provider);
      expect(config.models.fast).toBe(DEFAULT_USER_CONFIG.models.fast);
      expect(config.language).toBe("en");
      expect(config.commitConvention).toBe("conventional");
    });

    it("user config alone overrides the defaults", async () => {
      await writeUserConfig({ provider: "claude-code", language: "pt-br" }, homeDir);
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.provider).toBe("claude-code");
      expect(config.language).toBe("pt-br");
    });

    it("repo config alone overrides defaults (deep-merged into models)", async () => {
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ models: { fast: "claude-haiku-custom" } }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.models.fast).toBe("claude-haiku-custom");
      // Other model tiers stay as defaults
      expect(config.models.balanced).toBe(DEFAULT_USER_CONFIG.models.balanced);
    });

    it("repo config takes precedence over user config in all fields", async () => {
      await writeUserConfig({ language: "es", commitConvention: "gitmoji" }, homeDir);
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ language: "de", commitConvention: "angular" }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.language).toBe("de");
      expect(config.commitConvention).toBe("angular");
    });

    it("getMergedConfig does NOT include the API key", async () => {
      const config = await getMergedConfig({ cwd, homeDir }) as unknown as Record<string, unknown>;
      expect(config["apiKey"]).toBeUndefined();
      expect(config["ANTHROPIC_API_KEY"]).toBeUndefined();
    });

    it("throws INVALID_REPO_CONFIG for malformed repo config JSON", async () => {
      await writeFile(join(cwd, ".gitwise.json"), "not-json", "utf-8");
      await expect(getMergedConfig({ cwd, homeDir })).rejects.toMatchObject({
        code: "INVALID_REPO_CONFIG",
      });
    });
  });

  describe("writeUserConfig / readUserConfig", () => {
    it("round-trips atomically", async () => {
      await writeUserConfig({ provider: "claude-code", language: "fr" }, homeDir);
      const loaded = await readUserConfig(homeDir);
      expect(loaded.provider).toBe("claude-code");
      expect(loaded.language).toBe("fr");
    });

    it("preserves fields not in the partial update", async () => {
      await writeUserConfig({ language: "es" }, homeDir);
      await writeUserConfig({ commitConvention: "gitmoji" }, homeDir);
      const loaded = await readUserConfig(homeDir);
      expect(loaded.language).toBe("es");
      expect(loaded.commitConvention).toBe("gitmoji");
    });
  });

  describe("writeApiKey / getApiKey", () => {
    it("writes the file with mode 0600", async () => {
      await writeApiKey("test-api-key-123", homeDir);
      const envPath = join(homeDir, ".gitwise", ".env");
      const stats = await stat(envPath);
      // mode & 0o777 gives unix permissions bits
      if (process.platform !== "win32") {
        expect(stats.mode & 0o777).toBe(0o600);
      }
    });

    it("getApiKey prefers process.env over the .env file", async () => {
      await writeApiKey("sk-from-file", homeDir);
      const origKey = process.env["ANTHROPIC_API_KEY"];
      process.env["ANTHROPIC_API_KEY"] = "sk-from-env";
      const key = await getApiKey(homeDir);
      expect(key).toBe("sk-from-env");
      if (origKey !== undefined) {
        process.env["ANTHROPIC_API_KEY"] = origKey;
      } else {
        delete process.env["ANTHROPIC_API_KEY"];
      }
    });

    it("getApiKey falls back to .env file when process.env key absent", async () => {
      const origKey = process.env["ANTHROPIC_API_KEY"];
      delete process.env["ANTHROPIC_API_KEY"];
      await writeApiKey("sk-from-file", homeDir);
      const key = await getApiKey(homeDir);
      expect(key).toBe("sk-from-file");
      if (origKey !== undefined) process.env["ANTHROPIC_API_KEY"] = origKey;
    });
  });

  describe("integration round-trip", () => {
    it("write user config, write repo config, read merged shape", async () => {
      await writeUserConfig({ provider: "api", language: "en", models: { fast: "haiku", balanced: "sonnet", powerful: "opus" } }, homeDir);
      await writeFile(
        join(cwd, ".gitwise.json"),
        JSON.stringify({ language: "de", templatesPath: "/tmp/templates" }),
        "utf-8",
      );
      const config = await getMergedConfig({ cwd, homeDir });
      expect(config.provider).toBe("api");
      expect(config.language).toBe("de");
      expect(config.models.fast).toBe("haiku");
      expect(config.templatesPath).toBe("/tmp/templates");
    });
  });
});
