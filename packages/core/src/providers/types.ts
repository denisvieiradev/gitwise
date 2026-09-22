export type ModelTier = "fast" | "balanced" | "powerful";

// TechSpec "Core Interfaces" LLMProvider shape
export interface LLMChatRequest {
  systemPrompt: string;
  userMessage: string;
  tier: ModelTier;
}

export interface LLMChatResponse {
  content: string;
  tokens: { input: number; output: number };
}

export interface LLMProvider {
  chat(req: LLMChatRequest): Promise<LLMChatResponse>;
}

export interface ModelConfig {
  fast: string;
  balanced: string;
  powerful: string;
}

// AD-001: everything that differs between CLI-subprocess providers.
// SPEC_DEVIATION: design.md's `buildArgs({ combinedPrompt, modelId, large })`
// is extended with `systemPrompt` + a `foldSystemPrompt` flag, and an optional
// `formatExitError` hook is added.
// Reason: Claude Code has a dedicated `--system-prompt` flag and a JSON
// `is_error` exit contract that must stay byte-for-byte unchanged (T1
// characterization tests); tools without a system-prompt flag fold it in.
export interface CliProviderSpec {
  toolName: string;
  installHint: string;
  /** Command name spawned when `resolveBinary()` finds nothing (ENOENT then maps to PROVIDER_UNAVAILABLE). */
  defaultCommand: string;
  /** false → CLI takes a separate system prompt; true → system prompt is folded into `prompt`. */
  foldSystemPrompt: boolean;
  resolveBinary(customPath?: string): string | null;
  /** `prompt` is omitted from argv by the spec when `large` is true — it is written to stdin instead. */
  buildArgs(input: { prompt: string; systemPrompt: string; modelId: string; large: boolean }): string[];
  parseOutput(stdout: string): { content: string; tokens: { input: number; output: number } | null };
  /** Optional override for the non-zero-exit error message; default surfaces stderr verbatim. */
  formatExitError?(code: number | null, stdout: string, stderr: string): string;
}

export interface ProviderConfig {
  kind: "api" | "claude-code";
  models: ModelConfig;
  apiKey?: string;
  claudeCliPath?: string;
}
