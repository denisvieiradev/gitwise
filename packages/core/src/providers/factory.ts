import { AnthropicProvider } from "./anthropic.js";
import { ClaudeCodeProvider } from "./claude-code.js";
import { CliSubprocessProvider } from "./cli-subprocess.js";
import { codexSpec } from "./codex.js";
import { copilotSpec } from "./copilot.js";
import { kiroSpec } from "./kiro.js";
import type { LLMProvider, ProviderConfig } from "./types.js";

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
      throw new Error(`Unknown provider kind: ${String(unhandled)}`);
    }
  }
}
