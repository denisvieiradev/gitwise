import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { debug } from "../infra/logger.js";
import { EXIT_CODES, GitwiseError } from "../errors.js";
import type {
  CliProviderSpec,
  LLMChatRequest,
  LLMChatResponse,
  LLMProvider,
  ModelConfig,
} from "./types.js";

export const LARGE_PROMPT_THRESHOLD = 100_000;
const DEFAULT_TIMEOUT_MS = 120_000;

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
      const child = spawn(this.binaryPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: DEFAULT_TIMEOUT_MS,
      });

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
        stdout += outDecoder.end();
        stderr += errDecoder.end();
        if (code === null && signal) {
          reject(new Error(`${this.spec.toolName} was terminated by signal ${signal}`));
          return;
        }
        if (code !== 0) {
          reject(new Error(this.exitErrorMessage(code, stdout, stderr)));
          return;
        }
        resolve(stdout);
      });

      child.on("error", (err) => {
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
