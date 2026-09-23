/**
 * T20 — CFG-01/CFG-02: `gw provider` lists detected providers and persists
 * the selection to ~/.gitwise/config.json the same way runFirstRun does.
 */
import { describe, it, expect, jest, afterEach } from "@jest/globals";

const CANCEL = Symbol.for("clack:cancel");

const DETECTED = [
  { kind: "claude-code", label: "Claude Code CLI", binaryPath: "/bin/claude", detected: true },
  { kind: "codex", label: "Codex CLI", binaryPath: "/bin/codex", detected: true },
  { kind: "copilot", label: "Copilot CLI", binaryPath: null, detected: false },
  { kind: "kiro", label: "Kiro CLI", binaryPath: null, detected: false },
  { kind: "api", label: "Anthropic API key", binaryPath: null, detected: true },
];

async function runProvider(
  selection: unknown,
  opts: { storedKey?: string; password?: unknown } = {},
): Promise<{
  select: jest.Mock;
  writeUserConfig: jest.Mock;
  cancel: jest.Mock;
  password: jest.Mock;
  writeApiKey: jest.Mock;
}> {
  jest.resetModules();
  const select = jest.fn(async () => selection);
  const cancel = jest.fn();
  const password = jest.fn(async () => opts.password);
  const writeApiKey = jest.fn(async () => undefined);
  const writeUserConfig = jest.fn(async () => undefined);
  jest.unstable_mockModule("@clack/prompts", () => ({
    intro: jest.fn(),
    outro: jest.fn(),
    cancel,
    select,
    password,
    isCancel: (v: unknown) => v === CANCEL,
  }));
  jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
    writeUserConfig,
    readUserConfig: jest.fn(),
    writeApiKey,
    getApiKey: jest.fn(async () => ("storedKey" in opts ? opts.storedKey : "sk-ant-stored")),
    fileExists: jest.fn(),
  }));
  jest.unstable_mockModule("../src/detect-providers.js", () => ({
    detectAvailableProviders: () => DETECTED,
  }));
  const { makeProviderCommand } = await import("../src/commands/provider.js");
  await makeProviderCommand().parseAsync(["node", "provider"]);
  return { select, writeUserConfig, cancel, password, writeApiKey };
}

afterEach(() => {
  jest.dontMock("@clack/prompts");
  jest.dontMock("@denisvieiradev/gitwise-core");
  jest.dontMock("../src/detect-providers.js");
  jest.resetModules();
});

describe("gw provider", () => {
  it("lists every detected provider (CLIs found + API key), omitting undetected CLIs", async () => {
    const { select } = await runProvider("api");

    const options = (select.mock.calls[0]?.[0] as { options: Array<{ value: string }> }).options;
    expect(options.map((o) => o.value)).toEqual(["claude-code", "codex", "api"]);
  });

  it("persists a CLI-based selection with its resolved CLI path", async () => {
    const { writeUserConfig } = await runProvider("codex");

    expect(writeUserConfig).toHaveBeenCalledTimes(1);
    expect(writeUserConfig.mock.calls[0]?.[0]).toEqual({ provider: "codex", codexCliPath: "/bin/codex" });
  });

  it("persists the api selection as provider: api only", async () => {
    const { writeUserConfig } = await runProvider("api");

    expect(writeUserConfig.mock.calls[0]?.[0]).toEqual({ provider: "api" });
  });

  it("leaves config untouched when the user cancels", async () => {
    const { writeUserConfig, cancel } = await runProvider(CANCEL);

    expect(writeUserConfig).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it("never writes models, so each provider keeps its own model block", async () => {
    const { writeUserConfig } = await runProvider("claude-code");

    expect(writeUserConfig.mock.calls[0]?.[0]).not.toHaveProperty("models");
  });

  it("prompts for and stores an API key when switching to api with none stored", async () => {
    const { password, writeApiKey, writeUserConfig } = await runProvider("api", {
      storedKey: undefined,
      password: "sk-ant-1234567890",
    });

    expect(password).toHaveBeenCalledTimes(1);
    expect(writeApiKey.mock.calls[0]?.[0]).toBe("sk-ant-1234567890");
    expect(writeUserConfig.mock.calls[0]?.[0]).toEqual({ provider: "api" });
  });

  it("does not prompt for a key when one is already stored", async () => {
    const { password } = await runProvider("api");

    expect(password).not.toHaveBeenCalled();
  });

  it("leaves config untouched when the API key prompt is cancelled", async () => {
    const { writeUserConfig, writeApiKey } = await runProvider("api", {
      storedKey: undefined,
      password: CANCEL,
    });

    expect(writeApiKey).not.toHaveBeenCalled();
    expect(writeUserConfig).not.toHaveBeenCalled();
  });
});
