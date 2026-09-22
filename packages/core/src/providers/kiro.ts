import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { resolveCliBinary } from "./cli-subprocess.js";
import type { CliProviderSpec } from "./types.js";

// CLI contract, verified 2026-09-22 without a live Kiro account (spec
// assumption: no paid subscription, so tests use mocked subprocess I/O):
// - Installed kiro-cli 2.23.0 `kiro-cli chat --help`: `chat [OPTIONS] [INPUT]`,
//   `--no-interactive`, `--model <MODEL>`, `--trust-tools=` (trust no tools),
//   `--wrap never` (raw output), `--output-format text|stream-json`.
// - https://kiro.dev/docs/cli/headless/ : the prompt is the positional INPUT,
//   or, "When stdin is piped and no positional argument is given, Kiro reads
//   the full stream as the instruction" (used for large prompts).
// - Neither source documents a token-usage field for text output, so tokens
//   are always null. The docs also leave the text-mode stdout shape and the
//   error channel unspecified, so terminal escapes are stripped from the
//   response defensively, and a failure surfaces stderr verbatim, or stdout
//   when stderr is empty.
// - Kiro has no system-prompt flag, so the system prompt is folded in.

const COMMON_KIRO_PATHS = [
  // macOS app bundle and the installer's symlink location — preferred
  "/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli",
  path.join(os.homedir(), ".local", "bin", "kiro-cli"),
  "/opt/homebrew/bin/kiro-cli",
  "/usr/local/bin/kiro-cli",
];

// Same precedence as the other CLI providers (see resolveCliBinary).
export function resolveKiroBinary(customPath?: string): string | null {
  return resolveCliBinary("kiro-cli", COMMON_KIRO_PATHS, customPath);
}

export const kiroSpec: CliProviderSpec = {
  toolName: "Kiro CLI",
  installHint: "Install it from https://kiro.dev/docs/cli/ or re-run `gw provider` to choose another provider.",
  defaultCommand: "kiro-cli",
  foldSystemPrompt: true,
  resolveBinary: resolveKiroBinary,

  buildArgs({ prompt, modelId, large }) {
    return [
      "chat",
      "--no-interactive",
      "--trust-tools=",
      "--wrap",
      "never",
      "--model",
      modelId,
      // `--` (standard for kiro-cli's clap-style parser) keeps a prompt that
      // starts with "-" from being read as an option.
      ...(large ? [] : ["--", prompt]),
    ];
  },

  parseOutput(stdout) {
    const content = stripVTControlCharacters(stdout).trim();
    if (!content) throw new Error("Kiro CLI returned an empty response");
    return { content, tokens: null };
  },

  formatExitError(code, stdout, stderr) {
    const detail = stderr.trim() || stripVTControlCharacters(stdout).trim();
    return `Kiro CLI exited with code ${code}${detail ? `: ${detail}` : ""}`;
  },
};
