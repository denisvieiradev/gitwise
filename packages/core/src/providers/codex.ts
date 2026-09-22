import os from "node:os";
import path from "node:path";
import { resolveCliBinary } from "./cli-subprocess.js";
import type { CliProviderSpec } from "./types.js";

// CLI contract verified 2026-09-22 against the installed codex-cli 0.155.1
// (`codex exec --help` plus live `codex exec --json` runs):
// - `codex exec [OPTIONS] [PROMPT]` runs non-interactively; PROMPT `-` reads
//   the prompt from stdin; `--` before PROMPT is accepted.
// - `--json` prints JSONL events. The final answer is the last
//   `{"type":"item.completed","item":{"type":"agent_message","text":...}}`.
//   `item.type: "error"` items are non-fatal warnings.
// - Usage IS reported: `{"type":"turn.completed","usage":{"input_tokens":N,
//   "output_tokens":M,...}}`, so tokensAvailable is true whenever it is present.
// - Failures exit 1 with the error on stdout as `{"type":"error","message"}` /
//   `{"type":"turn.failed","error":{"message"}}`; stderr only carries
//   "Reading additional input from stdin...".
// - `--model`, `--sandbox read-only`, `--ephemeral` (no session files) and
//   `--skip-git-repo-check` exist as used below.
// - Codex has no system-prompt flag, so the system prompt is folded in.

const COMMON_CODEX_PATHS = [
  // Native installs (Homebrew cask, manual, standalone installer) — preferred over npm
  "/opt/homebrew/bin/codex",
  "/usr/local/bin/codex",
  path.join(os.homedir(), ".local", "bin", "codex"),
  // npm global installs (`npm install -g @openai/codex`) — fallback
  path.join(os.homedir(), ".npm-global", "bin", "codex"),
];

// Same precedence as the other CLI providers (see resolveCliBinary).
export function resolveCodexBinary(customPath?: string): string | null {
  return resolveCliBinary("codex", COMMON_CODEX_PATHS, customPath);
}

interface CodexEvent {
  type?: string;
  message?: string;
  item?: { type?: string; text?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

function parseEvents(stdout: string): CodexEvent[] {
  const events: CodexEvent[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as CodexEvent);
    } catch {
      // non-JSON noise line
    }
  }
  return events;
}

export const codexSpec: CliProviderSpec = {
  toolName: "Codex CLI",
  installHint: "Install it (`npm install -g @openai/codex`) or re-run `gw provider` to choose another provider.",
  defaultCommand: "codex",
  foldSystemPrompt: true,
  resolveBinary: resolveCodexBinary,

  buildArgs({ prompt, modelId, large }) {
    return [
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--model",
      modelId,
      "--",
      large ? "-" : prompt,
    ];
  },

  parseOutput(stdout) {
    let content: string | undefined;
    let tokens: { input: number; output: number } | null = null;
    for (const event of parseEvents(stdout)) {
      if (event.type === "item.completed" && event.item?.type === "agent_message") {
        content = event.item.text ?? "";
      } else if (event.type === "turn.completed" && event.usage) {
        tokens = {
          input: event.usage.input_tokens ?? 0,
          output: event.usage.output_tokens ?? 0,
        };
      }
    }
    if (content === undefined) {
      throw new Error("Codex CLI returned no final agent message");
    }
    return { content, tokens };
  },

  // The CLI's own error text lives in the JSONL stream, not stderr; surface it
  // verbatim, falling back to stderr when the stream carries none.
  formatExitError(code, stdout, stderr) {
    const messages = new Set<string>();
    for (const event of parseEvents(stdout)) {
      if (event.type === "error" && event.message) messages.add(event.message);
      if (event.type === "turn.failed" && event.error?.message) messages.add(event.error.message);
    }
    const detail = messages.size > 0 ? [...messages].join("\n") : stderr.trim();
    return `Codex CLI exited with code ${code}${detail ? `: ${detail}` : ""}`;
  },
};
