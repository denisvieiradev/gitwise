import { AnthropicProvider } from "./anthropic.js";
import { ClaudeCodeProvider } from "./claude-code.js";
import { CliSubprocessProvider } from "./cli-subprocess.js";
import { codexSpec } from "./codex.js";
import { copilotSpec } from "./copilot.js";
import { kiroSpec } from "./kiro.js";
import { GitwiseError } from "../errors.js";
import type { LLMProvider, ProviderConfig } from "./types.js";
import type { MergedConfig } from "../config/types.js";

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.kind) {
    case "claude-code":
      return new ClaudeCodeProvider(config.models, config.claudeCliPath);
    case "codex":
      return new CliSubprocessProvider(codexSpec, config.models, config.codexCliPath);
    case "copilot":
      return new CliSubprocessProvider(copilotSpec, config.models, config.copilotCliPath);
    case "kiro":
      return new CliSubprocessProvider(kiroSpec, config.models, config.kiroCliPath);
    case "api":
      return new AnthropicProvider(config.apiKey, config.models);
    default: {
      const unhandled: never = config.kind;
      throw new GitwiseError({
        code: "CONFIG_INVALID",
        message: `Unknown provider "${String(unhandled)}" in config. Re-run \`gw provider\` to choose a supported provider.`,
      });
    }
  }
}

/**
 * The single place that turns a MergedConfig (+ optional API key) into the
 * ProviderConfig createProvider() expects — narrowing the per-provider
 * `models` map down to the active provider's tier block and threading every
 * per-tool CLI path field through. Replaces the 8 duplicated inline
 * `{ kind: config.provider, models: config.models, ... }` object literals
 * that predated the per-provider models map (MDL-03, MDL-04).
 */
export function buildProviderConfig(merged: MergedConfig, apiKey?: string): ProviderConfig {
  return {
    kind: merged.provider,
    models: merged.models[merged.provider],
    apiKey,
    claudeCliPath: merged.claudeCliPath,
    codexCliPath: merged.codexCliPath,
    copilotCliPath: merged.copilotCliPath,
    kiroCliPath: merged.kiroCliPath,
  };
}
