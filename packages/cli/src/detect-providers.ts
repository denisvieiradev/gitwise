import {
  resolveClaudeBinary,
  resolveCodexBinary,
  resolveCopilotBinary,
  resolveKiroBinary,
} from "@denisvieiradev/gitwise-core";
import type { ProviderKind } from "@denisvieiradev/gitwise-core";

// CFG-01: shared detection used by both the first-run wizard and `gw
// provider`, so the two can never disagree about what's installed.
export interface DetectedProvider {
  kind: ProviderKind;
  label: string;
  /** Resolved CLI path, or null when not found (and for `api`, which has no CLI). */
  binaryPath: string | null;
  /** `api` is always usable (only needs a key); every CLI-based provider needs its binary found. */
  detected: boolean;
}

/**
 * Detects which of Claude Code, Codex, Copilot, and Kiro CLIs are installed
 * (reusing each provider's own binary-resolution logic) and returns all five
 * providers — CLI-based ones plus the always-available Anthropic API key
 * fallback — for a picker to present.
 */
export function detectAvailableProviders(): DetectedProvider[] {
  const claudeCliPath = resolveClaudeBinary();
  const codexCliPath = resolveCodexBinary();
  const copilotCliPath = resolveCopilotBinary();
  const kiroCliPath = resolveKiroBinary();

  return [
    {
      kind: "claude-code",
      label: "Claude Code CLI",
      binaryPath: claudeCliPath,
      detected: claudeCliPath !== null,
    },
    {
      kind: "codex",
      label: "Codex CLI",
      binaryPath: codexCliPath,
      detected: codexCliPath !== null,
    },
    {
      kind: "copilot",
      label: "Copilot CLI",
      binaryPath: copilotCliPath,
      detected: copilotCliPath !== null,
    },
    {
      kind: "kiro",
      label: "Kiro CLI",
      binaryPath: kiroCliPath,
      detected: kiroCliPath !== null,
    },
    {
      kind: "api",
      label: "Anthropic API key",
      binaryPath: null,
      detected: true,
    },
  ];
}
