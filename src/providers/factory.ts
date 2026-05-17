import type { DevflowConfig } from "../core/types.js";
import { ClaudeProvider, validateApiKey } from "./claude.js";
import { ClaudeCodeProvider, validateClaudeCli } from "./claude-code.js";
import type { LLMProvider } from "./types.js";

export function createProvider(config: DevflowConfig): LLMProvider {
  if (config.provider === "claude-code-cli") {
    return new ClaudeCodeProvider(config);
  }
  // "claude-code-api-key" and legacy "claude" both use the API provider
  return new ClaudeProvider(config);
}

export function validateProvider(config: DevflowConfig): void {
  if (config.provider === "claude-code-cli") {
    validateClaudeCli(config);
  } else {
    validateApiKey();
  }
}
