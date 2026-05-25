import { execFile, execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { debug } from "../infra/logger.js";
import { EXIT_CODES, GitwiseError } from "../errors.js";
import type { LLMChatRequest, LLMChatResponse, LLMProvider, ModelConfig, ModelTier } from "./types.js";

const execFileAsync = promisify(execFile);
const LARGE_PROMPT_THRESHOLD = 100_000;
const DEFAULT_TIMEOUT_MS = 120_000;

const COMMON_CLAUDE_PATHS = [
  // Native installs (Homebrew, manual) — preferred over npm
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  path.join(os.homedir(), ".claude", "local", "claude"),
  // npm global installs — fallback
  path.join(os.homedir(), ".npm-global", "bin", "claude"),
];

interface ClaudeCliResult {
  result: string;
  is_error: boolean;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveClaudeBinary(customPath?: string): string | null {
  if (customPath) {
    if (isExecutable(customPath)) return customPath;
    return null;
  }

  // 1. Check known native install paths first (Homebrew, manual)
  for (const candidate of COMMON_CLAUDE_PATHS) {
    if (isExecutable(candidate)) return candidate;
  }

  // 2. Fall back to PATH lookup (may find nvm/npm version)
  try {
    const found = execSync("which claude", { stdio: "pipe" }).toString().trim();
    if (found && isExecutable(found)) return found;
  } catch {
    // not in PATH
  }

  // 3. Check nvm installations as last resort
  const nvmDir = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    const versions = fs.readdirSync(nvmDir);
    for (const version of versions) {
      const candidate = path.join(nvmDir, version, "bin", "claude");
      if (isExecutable(candidate)) return candidate;
    }
  } catch {
    // nvm not installed
  }

  return null;
}

export class ClaudeCodeProvider implements LLMProvider {
  private readonly models: ModelConfig;
  private readonly claudeBinaryPath: string;

  constructor(models: ModelConfig, claudeCliPath?: string) {
    this.models = models;
    this.claudeBinaryPath =
      claudeCliPath ?? resolveClaudeBinary() ?? "claude";
  }

  async chat(req: LLMChatRequest): Promise<LLMChatResponse> {
    const modelId = this.resolveModel(req.tier);
    debug("Calling Claude Code CLI", { model: modelId, tier: req.tier, binary: this.claudeBinaryPath });

    const userContent = req.userMessage;
    const args = this.buildArgs(req.systemPrompt, modelId, userContent);

    const result =
      userContent.length > LARGE_PROMPT_THRESHOLD
        ? await this.callViaStdin(args, userContent)
        : await this.callViaCli(args);

    return {
      content: result.result,
      tokens: {
        input: result.usage.input_tokens,
        output: result.usage.output_tokens,
      },
    };
  }

  private buildArgs(
    systemPrompt: string,
    modelId: string,
    userContent: string,
  ): string[] {
    const args = [
      "-p",
      ...(userContent.length <= LARGE_PROMPT_THRESHOLD ? [userContent] : []),
      "--system-prompt",
      systemPrompt,
      "--model",
      modelId,
      "--output-format",
      "json",
    ];
    return args;
  }

  private async callViaCli(args: string[]): Promise<ClaudeCliResult> {
    try {
      const { stdout } = await execFileAsync(this.claudeBinaryPath, args, {
        timeout: DEFAULT_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        ...({ input: "" } as Record<string, unknown>),
      });
      return this.parseResponse(stdout as string);
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string };
      if (execErr.stdout) {
        try {
          const parsed = JSON.parse(execErr.stdout);
          if (parsed.is_error) {
            throw new Error(`Claude CLI error: ${parsed.result}`);
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.startsWith("Claude CLI error:")) {
            throw parseErr;
          }
        }
      }
      const stderr = execErr.stderr
        ?.replace(/Warning: no stdin data.*\n?/g, "")
        .trim();
      if (stderr) {
        throw new Error(`Claude CLI failed: ${stderr}`);
      }
      throw this.wrapError(err);
    }
  }

  private async callViaStdin(
    args: string[],
    input: string,
  ): Promise<ClaudeCliResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.claudeBinaryPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: DEFAULT_TIMEOUT_MS,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code !== 0) {
          if (stdout) {
            try {
              const parsed = JSON.parse(stdout);
              if (parsed.is_error) {
                reject(new Error(`Claude CLI error: ${parsed.result}`));
                return;
              }
            } catch {
              // stdout wasn't valid JSON
            }
          }
          const filteredStderr = stderr
            .replace(/Warning: no stdin data.*\n?/g, "")
            .trim();
          reject(
            new Error(
              `Claude CLI exited with code ${code}${filteredStderr ? `: ${filteredStderr}` : ""}`,
            ),
          );
          return;
        }
        try {
          resolve(this.parseResponse(stdout));
        } catch (err) {
          reject(err);
        }
      });

      child.on("error", (err) => {
        reject(this.wrapError(err));
      });

      child.stdin.write(input);
      child.stdin.end();
    });
  }

  private parseResponse(stdout: string): ClaudeCliResult {
    const parsed = JSON.parse(stdout);

    if (parsed.is_error) {
      throw new Error(`Claude CLI returned error: ${parsed.result}`);
    }

    const usage = { input_tokens: 0, output_tokens: 0 };
    if (parsed.usage) {
      usage.input_tokens = parsed.usage.input_tokens ?? 0;
      usage.output_tokens = parsed.usage.output_tokens ?? 0;
    }

    return {
      result: parsed.result ?? "",
      is_error: false,
      usage,
    };
  }

  private resolveModel(tier: ModelTier): string {
    return this.models[tier];
  }

  private wrapError(err: unknown): Error {
    if (err instanceof Error) {
      if (err.message.includes("ENOENT")) {
        return new GitwiseError({
          code: "PROVIDER_UNAVAILABLE",
          message: `Claude Code CLI not found at "${this.claudeBinaryPath}". Re-run \`gw config\` to reconfigure.`,
          exitCode: EXIT_CODES.API_FAILED,
          cause: err,
        });
      }
      return err;
    }
    return new Error(String(err));
  }
}
