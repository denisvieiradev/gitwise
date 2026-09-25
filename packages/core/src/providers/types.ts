export type ModelTier = "fast" | "balanced" | "powerful";

// Single source of truth for provider kinds — import it, never redefine it.
export type ProviderKind = "api" | "claude-code" | "codex" | "copilot" | "kiro";

// Runtime companion to ProviderKind, for code that needs to iterate/validate
// against the actual value set (e.g. `gw config provider <value>` validation,
// legacy-config migration). Import this instead of hand-rolling another
// literal array of the same five values.
export const PROVIDER_KINDS: readonly ProviderKind[] = ["api", "claude-code", "codex", "copilot", "kiro"];

// TechSpec "Core Interfaces" LLMProvider shape
export interface LLMChatRequest {
  systemPrompt: string;
  userMessage: string;
  tier: ModelTier;
}

export interface LLMChatResponse {
  content: string;
  tokens: { input: number; output: number };
  /** AD-002: false when the provider does not report usage; `tokens` is then 0/0 and must not be shown as real. */
  tokensAvailable: boolean;
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
  /** Optional single retry with a compatibility model for model availability/version errors. */
  modelCompatibilityFallback?: {
    shouldRetry(error: unknown): boolean;
    buildArgs(input: { prompt: string; systemPrompt: string; large: boolean }): string[];
  };
  // SPEC_DEVIATION: `timeoutMs` is not in design.md's CliProviderSpec.
  // Reason: Codex/Copilot/Kiro run full agent turns and need more than the
  // 120s Claude Code has always used (post-validation follow-up G4).
  /** Subprocess timeout in ms; omitted → the shared 120s default. */
  timeoutMs?: number;
}

export interface ProviderConfig {
  kind: ProviderKind;
  models: ModelConfig;
  apiKey?: string;
  claudeCliPath?: string;
  codexCliPath?: string;
  copilotCliPath?: string;
  kiroCliPath?: string;
}
