import Anthropic from "@anthropic-ai/sdk";
import * as p from "@clack/prompts";
import { debug } from "../infra/logger.js";
import type { DevflowConfig } from "../core/types.js";
import type { ChatParams, ChatResponse, LLMProvider, ModelTier } from "./types.js";

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export function validateApiKey(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    p.cancel("ANTHROPIC_API_KEY not set. Run `devflow init` to configure, or: export ANTHROPIC_API_KEY=your-key");
    process.exit(1);
  }
}

export function handleLLMError(error: unknown): never {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401) {
      p.cancel("Invalid API key. Check your ANTHROPIC_API_KEY.");
      process.exit(1);
    }
    if (error.status === 400) {
      p.cancel(`Bad request: ${error.message}`);
      process.exit(1);
    }
    p.cancel(`API error (${error.status}): ${error.message}`);
    process.exit(1);
  }
  if (error instanceof Error) {
    if (error.message.includes("ENOTFOUND") || error.message.includes("ETIMEDOUT") || error.message.includes("ECONNREFUSED")) {
      p.cancel("Network error. Check your internet connection.");
      process.exit(1);
    }
  }
  p.cancel(`LLM call failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

export class ClaudeProvider implements LLMProvider {
  private readonly client: Anthropic;
  private readonly models: DevflowConfig["models"];

  constructor(config: DevflowConfig) {
    this.client = new Anthropic({ timeout: DEFAULT_TIMEOUT_MS });
    this.models = config.models;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const modelId = this.resolveModel(params.model ?? "balanced");
    debug("Calling Claude API", { model: modelId, tier: params.model });
    return this.callWithRetry(params, modelId);
  }

  private async callWithRetry(
    params: ChatParams,
    modelId: string,
  ): Promise<ChatResponse> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.callApi(params, modelId);
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (this.isRetryable(err)) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          debug("Retrying after error", { attempt, delay, error: lastError.message });
          await this.sleep(delay);
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new Error("Max retries exceeded");
  }

  private async callApi(
    params: ChatParams,
    modelId: string,
  ): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: modelId,
      max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: params.systemPrompt,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return {
      content: text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private resolveModel(tier: ModelTier): string {
    return this.models[tier];
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof Anthropic.APIError) {
      return err.status === 429 || err.status === 529;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
