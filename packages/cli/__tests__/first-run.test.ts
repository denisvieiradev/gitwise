import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
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

// CFG-03: the wizard detects and offers all five providers, not just Claude Code.
describe("runFirstRun provider detection (CFG-03)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-firstrun-detect-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    jest.dontMock("../src/detect-providers.js");
    jest.dontMock("@clack/prompts");
    jest.resetModules();
  });

  const CANCEL = Symbol.for("clack:cancel");

  async function runWizard(
    detected: Array<{ kind: string; label: string; binaryPath: string | null; detected: boolean }>,
    answers: { select?: unknown; password?: unknown },
  ): Promise<{ select: jest.Mock; password: jest.Mock }> {
    jest.resetModules();
    const select = jest.fn(async () => answers.select);
    const password = jest.fn(async () => answers.password);
    jest.unstable_mockModule("@clack/prompts", () => ({
      intro: jest.fn(),
      outro: jest.fn(),
      cancel: jest.fn(),
      log: { info: jest.fn() },
      select,
      password,
      isCancel: (v: unknown) => v === CANCEL,
    }));
    jest.unstable_mockModule("../src/detect-providers.js", () => ({
      detectAvailableProviders: () => detected,
    }));
    const mod = await import("../src/first-run.js");
    await mod.runFirstRun({ homeDir: tempDir });
    return { select, password };
  }

  async function readConfig(): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(tempDir, ".gitwise", "config.json"), "utf-8")) as Record<string, unknown>;
  }

  const ALL = [
    { kind: "claude-code", label: "Claude Code CLI", binaryPath: "/bin/claude", detected: true },
    { kind: "codex", label: "Codex CLI", binaryPath: "/bin/codex", detected: true },
    { kind: "copilot", label: "Copilot CLI", binaryPath: null, detected: false },
    { kind: "kiro", label: "Kiro CLI", binaryPath: null, detected: false },
    { kind: "api", label: "Anthropic API key", binaryPath: null, detected: true },
  ];

  it("offers every detected CLI plus the API key option, in detection order", async () => {
    const { select } = await runWizard(ALL, { select: "codex" });

    const options = (select.mock.calls[0]?.[0] as { options: Array<{ value: string }> }).options;
    expect(options.map((o) => o.value)).toEqual(["claude-code", "codex", "api"]);
  });

  it("persists a non-Claude choice with its resolved CLI path", async () => {
    await runWizard(ALL, { select: "codex" });

    const config = await readConfig();
    expect(config.provider).toBe("codex");
    expect(config.codexCliPath).toBe("/bin/codex");
  });

  it("works when only a non-Claude CLI is detected", async () => {
    const onlyKiro = ALL.map((d) =>
      d.kind === "kiro" ? { ...d, binaryPath: "/bin/kiro-cli", detected: true } : { ...d, detected: d.kind === "api" },
    );
    await runWizard(onlyKiro, { select: "kiro" });

    const config = await readConfig();
    expect(config.provider).toBe("kiro");
    expect(config.kiroCliPath).toBe("/bin/kiro-cli");
  });

  it("falls back to the API key prompt when nothing is detected", async () => {
    const none = ALL.map((d) => ({ ...d, detected: d.kind === "api" }));
    const { select, password } = await runWizard(none, { password: "sk-ant-1234567890" });

    expect(select).not.toHaveBeenCalled();
    expect(password).toHaveBeenCalledTimes(1);
    expect((await readConfig()).provider).toBe("api");
  });

  it("falls back to the API key prompt when the user picks the API key option", async () => {
    const { password } = await runWizard(ALL, { select: "api", password: "sk-ant-1234567890" });

    expect(password).toHaveBeenCalledTimes(1);
    expect((await readConfig()).provider).toBe("api");
  });
});
