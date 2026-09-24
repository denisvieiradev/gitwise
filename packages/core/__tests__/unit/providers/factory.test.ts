import { describe, it, expect } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProvider, buildProviderConfig } from "../../../src/providers/factory.js";
import { AnthropicProvider } from "../../../src/providers/anthropic.js";
import { ClaudeCodeProvider } from "../../../src/providers/claude-code.js";
import { CliSubprocessProvider } from "../../../src/providers/cli-subprocess.js";
import type { ProviderConfig } from "../../../src/providers/types.js";
import { DEFAULT_USER_CONFIG, type MergedConfig } from "../../../src/config/types.js";

const MODELS = { fast: "f", balanced: "b", powerful: "p" };

function fakeCli(stdout: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "gitwise-factory-"));
  const path = join(dir, "fake-cli");
  writeFileSync(
    path,
    `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on("end", () => { process.stdout.write(${JSON.stringify(stdout)}); process.exit(0); });
`,
  );
  chmodSync(path, 0o755);
  return { dir, path };
}

describe("createProvider", () => {
  it('kind "api" returns an AnthropicProvider', () => {
    expect(createProvider({ kind: "api", models: MODELS, apiKey: "k" })).toBeInstanceOf(AnthropicProvider);
  });

  it('kind "claude-code" returns a ClaudeCodeProvider that spawns the configured claudeCliPath', async () => {
    const cli = fakeCli(JSON.stringify({ result: "from-configured-path", is_error: false, usage: { input_tokens: 1, output_tokens: 1 } }));
    try {
      const provider = createProvider({ kind: "claude-code", models: MODELS, claudeCliPath: cli.path });
      expect(provider).toBeInstanceOf(ClaudeCodeProvider);
      const res = await provider.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" });
      expect(res.content).toBe("from-configured-path");
    } finally {
      rmSync(cli.dir, { recursive: true, force: true });
    }
  });

  it("ProviderConfig accepts all four optional per-tool CLI path fields", () => {
    const config: ProviderConfig = {
      kind: "claude-code",
      models: MODELS,
      claudeCliPath: "/x/claude",
      codexCliPath: "/x/codex",
      copilotCliPath: "/x/copilot",
      kiroCliPath: "/x/kiro-cli",
    };
    expect(createProvider(config)).toBeInstanceOf(ClaudeCodeProvider);
  });

  // Each fake CLI answers in its own tool's output format, so a provider wired
  // to the wrong spec (or the wrong configured path) fails to produce "ANSWER".
  const CODEX_JSONL = [
    '{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"ANSWER"}}',
    '{"type":"turn.completed","usage":{"input_tokens":7,"output_tokens":3}}',
  ].join("\n");

  it('kind "codex" returns a CLI provider that runs the configured codexCliPath and parses Codex JSONL', async () => {
    const cli = fakeCli(CODEX_JSONL);
    try {
      const provider = createProvider({ kind: "codex", models: MODELS, codexCliPath: cli.path, claudeCliPath: "/nope" });
      expect(provider).toBeInstanceOf(CliSubprocessProvider);
      const res = await provider.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" });
      expect(res.content).toBe("ANSWER");
      expect(res.tokens).toEqual({ input: 7, output: 3 });
      expect(res.tokensAvailable).toBe(true);
    } finally {
      rmSync(cli.dir, { recursive: true, force: true });
    }
  });

  it('kind "copilot" returns a CLI provider that runs the configured copilotCliPath with usage unavailable', async () => {
    const cli = fakeCli("ANSWER\n");
    try {
      const provider = createProvider({ kind: "copilot", models: MODELS, copilotCliPath: cli.path, codexCliPath: "/nope" });
      const res = await provider.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" });
      expect(res.content).toBe("ANSWER");
      expect(res.tokensAvailable).toBe(false);
    } finally {
      rmSync(cli.dir, { recursive: true, force: true });
    }
  });

  it('kind "kiro" returns a CLI provider that runs the configured kiroCliPath with usage unavailable', async () => {
    const cli = fakeCli("ANSWER\n");
    try {
      const provider = createProvider({ kind: "kiro", models: MODELS, kiroCliPath: cli.path, copilotCliPath: "/nope" });
      const res = await provider.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" });
      expect(res.content).toBe("ANSWER");
      expect(res.tokensAvailable).toBe(false);
    } finally {
      rmSync(cli.dir, { recursive: true, force: true });
    }
  });

  it("each CLI kind reports its own tool when the configured binary is missing", async () => {
    const cases = [
      { kind: "codex", key: "codexCliPath", tool: "Codex CLI" },
      { kind: "copilot", key: "copilotCliPath", tool: "Copilot CLI" },
      { kind: "kiro", key: "kiroCliPath", tool: "Kiro CLI" },
    ] as const;
    for (const c of cases) {
      const missing = join(tmpdir(), `gitwise-missing-${c.kind}`);
      const provider = createProvider({ kind: c.kind, models: MODELS, [c.key]: missing });
      const err = (await provider.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" }).catch((e: unknown) => e)) as {
        code: string;
        message: string;
      };
      expect(err.code).toBe("PROVIDER_UNAVAILABLE");
      expect(err.message).toContain(c.tool);
      expect(err.message).toContain(missing);
    }
  });

  it("an unrecognized kind (e.g. a hand-edited config) raises CONFIG_INVALID pointing at `gw provider`", () => {
    const bad = { kind: "anthropic", models: MODELS } as unknown as ProviderConfig;
    let err: { code?: string; message?: string } | undefined;
    try {
      createProvider(bad);
    } catch (e) {
      err = e as { code?: string; message?: string };
    }
    expect(err?.code).toBe("CONFIG_INVALID");
    expect(err?.message).toContain('"anthropic"');
    expect(err?.message).toContain("gw provider");
  });
});

describe("buildProviderConfig", () => {
  function mergedWith(overrides: Partial<MergedConfig>): MergedConfig {
    return {
      ...DEFAULT_USER_CONFIG,
      claudeCliPath: "/x/claude",
      codexCliPath: "/x/codex",
      copilotCliPath: "/x/copilot",
      kiroCliPath: "/x/kiro-cli",
      ...overrides,
    };
  }

  const PROVIDER_KINDS = ["api", "claude-code", "codex", "copilot", "kiro"] as const;

  it.each(PROVIDER_KINDS)("resolves models[%s] and every CLI path field for kind %s", (kind) => {
    const merged = mergedWith({ provider: kind });
    const result = buildProviderConfig(merged, "test-api-key");

    expect(result.kind).toBe(kind);
    expect(result.models).toEqual(DEFAULT_USER_CONFIG.models[kind]);
    expect(result.apiKey).toBe("test-api-key");
    expect(result.claudeCliPath).toBe("/x/claude");
    expect(result.codexCliPath).toBe("/x/codex");
    expect(result.copilotCliPath).toBe("/x/copilot");
    expect(result.kiroCliPath).toBe("/x/kiro-cli");
  });

  it("never reads another provider's model block", () => {
    const merged = mergedWith({
      provider: "codex",
      models: {
        ...DEFAULT_USER_CONFIG.models,
        codex: { fast: "codex-fast", balanced: "codex-balanced", powerful: "codex-powerful" },
        api: { fast: "should-not-be-used", balanced: "should-not-be-used", powerful: "should-not-be-used" },
      },
    });
    const result = buildProviderConfig(merged);
    expect(result.models).toEqual({ fast: "codex-fast", balanced: "codex-balanced", powerful: "codex-powerful" });
  });

  it("omits apiKey when not provided", () => {
    const merged = mergedWith({ provider: "api" });
    const result = buildProviderConfig(merged);
    expect(result.apiKey).toBeUndefined();
  });

  it("returns a ProviderConfig usable directly by createProvider", () => {
    const merged = mergedWith({ provider: "api" });
    const config = buildProviderConfig(merged, "sk-test");
    expect(createProvider(config)).toBeInstanceOf(AnthropicProvider);
  });
});
