import os from "node:os";
import path from "node:path";
import { resolveCliBinary } from "./cli-subprocess.js";
import type { CliProviderSpec } from "./types.js";

// CLI contract verified 2026-09-22 against the installed GitHub Copilot CLI
// 1.0.82 (`copilot --help` plus live runs):
// - `-p, --prompt <text>` runs one prompt non-interactively and exits. The
//   `--prompt=<text>` form is used so a prompt starting with "-" is never
//   parsed as an option.
// - With no `--prompt` and a piped stdin, the stdin text is the prompt. This is
//   how large prompts travel. (`-p -` is NOT stdin: "-" is taken literally.)
// - `--no-ask-user` disables the ask_user tool; `-s, --silent` prints only the
//   agent response (no stats footer); `--model <model>` selects the model.
// - Failures exit 1 with the error on stderr, e.g.
//   `Error: Model "x" from --model flag is not available.`
// - Silent stdout carries no token usage, so tokens are always null.
//   (1.0.82 can write usage to a file via `--usage-output-file`, which the
//   stdout-only CliProviderSpec contract does not read.)
// - Copilot has no system-prompt flag, so the system prompt is folded in.

const COMMON_COPILOT_PATHS = [
  // Native/Homebrew installs — preferred over npm
  "/opt/homebrew/bin/copilot",
  "/usr/local/bin/copilot",
  // Copilot's install script (non-root) target
  path.join(os.homedir(), ".local", "bin", "copilot"),
  // npm global installs (`npm install -g @github/copilot`) — fallback
  path.join(os.homedir(), ".npm-global", "bin", "copilot"),
];

// Same precedence as the other CLI providers (see resolveCliBinary).
export function resolveCopilotBinary(customPath?: string): string | null {
  return resolveCliBinary("copilot", COMMON_COPILOT_PATHS, customPath);
}

export const copilotSpec: CliProviderSpec = {
  toolName: "Copilot CLI",
  installHint: "Install it (`npm install -g @github/copilot`) or re-run `gw provider` to choose another provider.",
  defaultCommand: "copilot",
  foldSystemPrompt: true,
  resolveBinary: resolveCopilotBinary,

  buildArgs({ prompt, modelId, large }) {
    return [...(large ? [] : [`--prompt=${prompt}`]), "--no-ask-user", "--silent", "--model", modelId];
  },

  parseOutput(stdout) {
    const content = stdout.trim();
    if (!content) throw new Error("Copilot CLI returned an empty response");
    return { content, tokens: null };
  },
};
