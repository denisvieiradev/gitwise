import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { clearTimeout, setTimeout } from "node:timers";
import { debug } from "../infra/logger.js";
import { EXIT_CODES, GitwiseError } from "../errors.js";
import type {
  CliProviderSpec,
  LLMChatRequest,
  LLMChatResponse,
  LLMProvider,
  ModelConfig,
} from "./types.js";

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shared CLI binary resolution (resolveClaudeBinary's original precedence):
 * explicit path (no fallback when it is not executable) → common install
 * paths → `which <name>` → nvm global installs.
 */
export function resolveCliBinary(
  name: string,
  commonPaths: readonly string[],
  customPath?: string,
): string | null {
  if (customPath) return isExecutable(customPath) ? customPath : null;

  for (const candidate of commonPaths) {
    if (isExecutable(candidate)) return candidate;
  }

  try {
    const found = execSync(`which ${name}`, { stdio: "pipe" }).toString().trim();
    if (found && isExecutable(found)) return found;
  } catch {
    // not in PATH
  }

  const nvmDir = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    for (const version of fs.readdirSync(nvmDir)) {
      const candidate = path.join(nvmDir, version, "bin", name);
      if (isExecutable(candidate)) return candidate;
    }
  } catch {
    // nvm not installed
  }

  return null;
}

export const LARGE_PROMPT_THRESHOLD = 100_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const KILL_GRACE_MS = 5_000;

// AD-001: one spawn/timeout/stderr-capture/ENOENT-wrapping implementation
// shared by every CLI-backed LLM provider. Tool specifics live in the spec.
export class CliSubprocessProvider implements LLMProvider {
  protected readonly binaryPath: string;

  constructor(
    private readonly spec: CliProviderSpec,
    private readonly models: ModelConfig,
    cliPath?: string,
  ) {
    // `||` (not `??`): an empty configured path means "not configured".
    this.binaryPath = cliPath || spec.resolveBinary() || spec.defaultCommand;
  }

  async chat(req: LLMChatRequest): Promise<LLMChatResponse> {
    const modelId = this.models[req.tier];
    debug(`Calling ${this.spec.toolName}`, { model: modelId, tier: req.tier, binary: this.binaryPath });

    const prompt = this.spec.foldSystemPrompt
      ? `${req.systemPrompt}\n\n${req.userMessage}`
      : req.userMessage;
    // Bytes, not UTF-16 units: OS argv limits (e.g. Linux MAX_ARG_STRLEN) are byte-based.
    const large = Buffer.byteLength(prompt, "utf8") > LARGE_PROMPT_THRESHOLD;
    const args = this.spec.buildArgs({ prompt, systemPrompt: req.systemPrompt, modelId, large });

    // Small prompts travel via argv; stdin is still closed immediately so a
    // CLI that treats non-TTY stdin as piped input does not wait on it.
    const stdout = await this.spawnCli(args, large ? prompt : "");
    const parsed = this.spec.parseOutput(stdout);
    return {
      content: parsed.content,
      tokens: parsed.tokens ?? { input: 0, output: 0 },
      tokensAvailable: parsed.tokens !== null,
    };
  }

  private spawnCli(args: string[], input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Agentic CLIs run tool calls as child processes. Own process group (POSIX)
      // so a timeout can signal the whole tree; Node's `timeout` option would
      // only signal the direct child and orphan any tool subprocess.
      const ownGroup = process.platform !== "win32";
      const child = spawn(this.binaryPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        detached: ownGroup,
      });

      const killTree = (sig: NodeJS.Signals): void => {
        try {
          if (ownGroup && child.pid !== undefined) process.kill(-child.pid, sig);
          else child.kill(sig);
        } catch {
          // group already gone
        }
      };

      const timeoutMs = this.spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      let timedOut = false;
      let escalation: NodeJS.Timeout | undefined;
      const timer = setTimeout(() => {
        timedOut = true;
        killTree("SIGTERM");
        escalation = setTimeout(() => killTree("SIGKILL"), KILL_GRACE_MS);
        escalation.unref();
      }, timeoutMs);

      // A detached group no longer receives the terminal's Ctrl-C, so reap it on exit and on SIGINT/SIGTERM.
      const reapOnExit = (): void => killTree("SIGKILL");
      let interruptedBy: NodeJS.Signals | undefined;
      const onSignal = (sig: NodeJS.Signals): void => {
        interruptedBy = sig;
        killTree("SIGKILL");
        reject(new Error(`${this.spec.toolName} was interrupted by ${sig}`));
        cleanup();
        if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
      };
      const onSigint = (): void => onSignal("SIGINT");
      const onSigterm = (): void => onSignal("SIGTERM");
      process.once("exit", reapOnExit);
      process.on("SIGINT", onSigint);
      process.on("SIGTERM", onSigterm);
      function cleanup(): void {
        clearTimeout(timer);
        clearTimeout(escalation);
        process.off("exit", reapOnExit);
        process.off("SIGINT", onSigint);
        process.off("SIGTERM", onSigterm);
      }

      let stdout = "";
      let stderr = "";

      // StringDecoder keeps multi-byte UTF-8 characters intact across chunk boundaries.
      const outDecoder = new StringDecoder("utf8");
      const errDecoder = new StringDecoder("utf8");
      child.stdout.on("data", (data: Buffer) => {
        stdout += outDecoder.write(data);
      });
      child.stderr.on("data", (data: Buffer) => {
        stderr += errDecoder.write(data);
      });

      child.on("close", (code, signal) => {
        // Sweep tool subprocesses that outlived the CLI itself after a timeout.
        if (timedOut) killTree("SIGKILL");
        cleanup();
        stdout += outDecoder.end();
        stderr += errDecoder.end();
        if (interruptedBy) return;
        if (code === null && signal) {
          const reason = timedOut
            ? `${this.spec.toolName} timed out after ${Math.round(timeoutMs / 1000)}s`
            : `${this.spec.toolName} was terminated by signal ${signal}`;
          reject(new Error(reason));
          return;
        }
        if (code !== 0) {
          reject(new Error(this.exitErrorMessage(code, stdout, stderr)));
          return;
        }
        resolve(stdout);
      });

      child.on("error", (err) => {
        cleanup();
        reject(this.wrapError(err));
      });

      // A CLI that exits before draining stdin raises EPIPE here; the close
      // handler already reports the real failure, so the write error is ignored.
      child.stdin.on("error", () => undefined);
      child.stdin.write(input);
      child.stdin.end();
    });
  }

  private exitErrorMessage(code: number | null, stdout: string, stderr: string): string {
    if (this.spec.formatExitError) return this.spec.formatExitError(code, stdout, stderr);
    const trimmed = stderr.trim();
    return `${this.spec.toolName} exited with code ${code}${trimmed ? `: ${trimmed}` : ""}`;
  }

  private wrapError(err: unknown): Error {
    // Duck-typed rather than `instanceof Error`: spawn errors can originate in
    // another realm (e.g. Node internals under a VM sandbox).
    const message = err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err);
    const code = (err as { code?: unknown } | null)?.code;
    if (code === "ENOENT" || message.includes("ENOENT")) {
      return new GitwiseError({
        code: "PROVIDER_UNAVAILABLE",
        message: `${this.spec.toolName} not found at "${this.binaryPath}". ${this.spec.installHint}`,
        exitCode: EXIT_CODES.API_FAILED,
        cause: err,
      });
    }
    return err instanceof Error ? err : new Error(message);
  }
}
