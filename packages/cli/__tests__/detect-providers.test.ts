/**
 * T18 — CFG-01: detectAvailableProviders() reuses each provider's own
 * binary-resolution logic and returns all 5 ProviderKind values with the
 * correct detected/not-detected state, so the first-run wizard and `gw
 * provider` can never disagree about what's installed.
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";

function mockResolvers(paths: {
  claude?: string | null;
  codex?: string | null;
  copilot?: string | null;
  kiro?: string | null;
}): void {
  jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
    resolveClaudeBinary: jest.fn(() => paths.claude ?? null),
    resolveCodexBinary: jest.fn(() => paths.codex ?? null),
    resolveCopilotBinary: jest.fn(() => paths.copilot ?? null),
    resolveKiroBinary: jest.fn(() => paths.kiro ?? null),
  }));
}

afterEach(() => {
  jest.dontMock("@denisvieiradev/gitwise-core");
  jest.resetModules();
});

describe("detectAvailableProviders (CFG-01)", () => {
  it("always includes 'api' as detected: true, with no binary path", async () => {
    jest.resetModules();
    mockResolvers({});
    const { detectAvailableProviders } = await import("../src/detect-providers.js");

    const providers = detectAvailableProviders();
    const api = providers.find((p) => p.kind === "api");

    expect(api).toEqual({
      kind: "api",
      label: "Anthropic API key",
      binaryPath: null,
      detected: true,
    });
  });

  it("marks claude-code detected:true with its resolved path when found", async () => {
    jest.resetModules();
    mockResolvers({ claude: "/usr/local/bin/claude" });
    const { detectAvailableProviders } = await import("../src/detect-providers.js");

    const claudeCode = detectAvailableProviders().find((p) => p.kind === "claude-code");
    expect(claudeCode).toEqual({
      kind: "claude-code",
      label: "Claude Code CLI",
      binaryPath: "/usr/local/bin/claude",
      detected: true,
    });
  });

  it("marks codex detected:false with a null binary path when not found", async () => {
    jest.resetModules();
    mockResolvers({ codex: null });
    const { detectAvailableProviders } = await import("../src/detect-providers.js");

    const codex = detectAvailableProviders().find((p) => p.kind === "codex");
    expect(codex).toEqual({
      kind: "codex",
      label: "Codex CLI",
      binaryPath: null,
      detected: false,
    });
  });

  it("marks copilot detected:true with its resolved path when found", async () => {
    jest.resetModules();
    mockResolvers({ copilot: "/usr/local/bin/copilot" });
    const { detectAvailableProviders } = await import("../src/detect-providers.js");

    const copilot = detectAvailableProviders().find((p) => p.kind === "copilot");
    expect(copilot).toEqual({
      kind: "copilot",
      label: "Copilot CLI",
      binaryPath: "/usr/local/bin/copilot",
      detected: true,
    });
  });

  it("marks kiro detected:false with a null binary path when not found", async () => {
    jest.resetModules();
    mockResolvers({ kiro: null });
    const { detectAvailableProviders } = await import("../src/detect-providers.js");

    const kiro = detectAvailableProviders().find((p) => p.kind === "kiro");
    expect(kiro).toEqual({
      kind: "kiro",
      label: "Kiro CLI",
      binaryPath: null,
      detected: false,
    });
  });

  it("reports every CLI-based provider as detected when all 4 are installed", async () => {
    jest.resetModules();
    mockResolvers({
      claude: "/bin/claude",
      codex: "/bin/codex",
      copilot: "/bin/copilot",
      kiro: "/bin/kiro-cli",
    });
    const { detectAvailableProviders } = await import("../src/detect-providers.js");

    const providers = detectAvailableProviders();
    expect(providers).toHaveLength(5);
    expect(providers.every((p) => p.detected)).toBe(true);
    expect(providers.map((p) => p.kind)).toEqual([
      "claude-code",
      "codex",
      "copilot",
      "kiro",
      "api",
    ]);
  });

  it("shows all of multiple installed CLIs, not just the first match (edge case)", async () => {
    jest.resetModules();
    mockResolvers({ claude: null, codex: "/bin/codex", copilot: "/bin/copilot", kiro: null });
    const { detectAvailableProviders } = await import("../src/detect-providers.js");

    const providers = detectAvailableProviders();
    const detectedKinds = providers.filter((p) => p.detected).map((p) => p.kind);
    expect(detectedKinds).toEqual(["codex", "copilot", "api"]);
  });
});
