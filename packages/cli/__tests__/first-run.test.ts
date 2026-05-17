import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { needsFirstRun, runFirstRun } from "../src/first-run.js";

describe("needsFirstRun", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-firstrun-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns true when ~/.gitwise/config.json does not exist", async () => {
    expect(await needsFirstRun(tempDir)).toBe(true);
  });

  it("returns false when ~/.gitwise/config.json exists", async () => {
    // Write a config first
    await runFirstRun({ apiKey: "test-api-key-123", homeDir: tempDir });
    expect(await needsFirstRun(tempDir)).toBe(false);
  });
});

describe("runFirstRun with --api-key", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-firstrun-api-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes config.json with provider: api when --api-key supplied", async () => {
    await runFirstRun({ apiKey: "test-api-key-123", homeDir: tempDir });

    const configPath = join(tempDir, ".gitwise", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf-8")) as { provider: string };
    expect(config.provider).toBe("api");
  });

  it("writes .env file with mode 0600 when --api-key supplied", async () => {
    await runFirstRun({ apiKey: "test-api-key-123", homeDir: tempDir });

    const envPath = join(tempDir, ".gitwise", ".env");
    const content = await readFile(envPath, "utf-8");
    expect(content).toContain("ANTHROPIC_API_KEY=test-api-key-123");

    const { stat } = await import("node:fs/promises");
    const stats = await stat(envPath);
    if (process.platform !== "win32") {
      expect(stats.mode & 0o777).toBe(0o600);
    }
  });

  it("after first run, needsFirstRun returns false", async () => {
    await runFirstRun({ apiKey: "test-api-key", homeDir: tempDir });
    expect(await needsFirstRun(tempDir)).toBe(false);
  });
});
