import { describe, it, expect } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProvider } from "../../../src/providers/factory.js";
import { AnthropicProvider } from "../../../src/providers/anthropic.js";
import { ClaudeCodeProvider } from "../../../src/providers/claude-code.js";
import type { ProviderConfig } from "../../../src/providers/types.js";

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
});
