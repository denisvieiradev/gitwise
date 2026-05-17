import { AnthropicProvider } from "./anthropic.js";
import { ClaudeCodeProvider } from "./claude-code.js";
import type { LLMProvider, ProviderConfig } from "./types.js";

export function createProvider(config: ProviderConfig): LLMProvider {
  if (config.kind === "claude-code") {
    return new ClaudeCodeProvider(config.models, config.claudeCliPath);
  }
  // kind: "api" — uses Anthropic SDK
  return new AnthropicProvider(config.apiKey, config.models);
}
