import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadEnv, writeEnvVar, readEnvVar, read } from "../../../src/infra/env.js";

describe("env (core)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-env-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("writeEnvVar", () => {
    it("should create .gitwise/.env with the key", async () => {
      await writeEnvVar(tempDir, "ANTHROPIC_API_KEY", "test-api-key-123");
      const content = await readFile(join(tempDir, ".gitwise", ".env"), "utf-8");
      expect(content.trim()).toBe("ANTHROPIC_API_KEY=test-api-key-123");
    });

    it("should update an existing key without duplicating", async () => {
      await writeEnvVar(tempDir, "ANTHROPIC_API_KEY", "old-key");
      await writeEnvVar(tempDir, "ANTHROPIC_API_KEY", "new-key");
      const content = await readFile(join(tempDir, ".gitwise", ".env"), "utf-8");
      expect(content.trim()).toBe("ANTHROPIC_API_KEY=new-key");
    });

    it("should preserve other keys when updating", async () => {
      await writeEnvVar(tempDir, "OTHER_VAR", "value1");
      await writeEnvVar(tempDir, "ANTHROPIC_API_KEY", "test-api-key");
      const content = await readFile(join(tempDir, ".gitwise", ".env"), "utf-8");
      expect(content).toContain("OTHER_VAR=value1");
      expect(content).toContain("ANTHROPIC_API_KEY=test-api-key");
    });
  });

  describe("readEnvVar", () => {
    it("should return undefined when file does not exist", async () => {
      const result = await readEnvVar(tempDir, "ANTHROPIC_API_KEY");
      expect(result).toBeUndefined();
    });

    it("should return the value for an existing key", async () => {
      await writeEnvVar(tempDir, "ANTHROPIC_API_KEY", "test-api-key-123");
      const result = await readEnvVar(tempDir, "ANTHROPIC_API_KEY");
      expect(result).toBe("test-api-key-123");
    });

    it("should return undefined for a missing key", async () => {
      await writeEnvVar(tempDir, "OTHER_VAR", "value");
      const result = await readEnvVar(tempDir, "ANTHROPIC_API_KEY");
      expect(result).toBeUndefined();
    });
  });

  describe("loadEnv", () => {
    it("should be a no-op when file does not exist", async () => {
      await expect(loadEnv(tempDir)).resolves.toBeUndefined();
    });

    it("should set env var from file", async () => {
      const key = "GITWISE_TEST_LOAD_" + Date.now();
      await writeEnvVar(tempDir, key, "test-value");
      delete process.env[key];

      await loadEnv(tempDir);
      expect(process.env[key]).toBe("test-value");

      delete process.env[key];
    });

    it("should not overwrite existing env vars", async () => {
      const key = "GITWISE_TEST_NOOVERWRITE_" + Date.now();
      process.env[key] = "original";
      await writeEnvVar(tempDir, key, "from-file");

      await loadEnv(tempDir);
      expect(process.env[key]).toBe("original");

      delete process.env[key];
    });

    it("should skip blank lines and comments", async () => {
      const key = "GITWISE_TEST_COMMENTS_" + Date.now();
      await mkdir(join(tempDir, ".gitwise"), { recursive: true });
      await writeFile(
        join(tempDir, ".gitwise", ".env"),
        `# This is a comment\n\n${key}=hello\n`,
        "utf-8",
      );
      delete process.env[key];

      await loadEnv(tempDir);
      expect(process.env[key]).toBe("hello");

      delete process.env[key];
    });
  });

  describe("read", () => {
    it("reads ANTHROPIC_API_KEY from process.env", async () => {
      const key = "ANTHROPIC_API_KEY_TEST_" + Date.now();
      process.env[key] = "test-value-from-env";
      const result = await read(key);
      expect(result).toBe("test-value-from-env");
      delete process.env[key];
    });

    it("reads from .env file when not in process.env", async () => {
      const key = "GITWISE_FILE_KEY_" + Date.now();
      await writeEnvVar(tempDir, key, "from-file-value");
      delete process.env[key];
      const result = await read(key, tempDir);
      expect(result).toBe("from-file-value");
    });

    it("returns undefined when key missing everywhere", async () => {
      const result = await read("DEFINITELY_NOT_SET_KEY_XYZ");
      expect(result).toBeUndefined();
    });
  });
});
