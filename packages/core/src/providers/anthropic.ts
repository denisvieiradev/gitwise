import Anthropic from "@anthropic-ai/sdk";
import { debug } from "../infra/logger.js";
import { GitwiseError } from "../errors.js";
import type { LLMChatRequest, LLMChatResponse, LLMProvider, ModelConfig, ModelTier } from "./types.js";

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class AnthropicProvider implements LLMProvider {
  private readonly client: Anthropic;
  private readonly models: ModelConfig;

  constructor(apiKey: string | undefined, models: ModelConfig) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env["ANTHROPIC_API_KEY"],
      timeout: DEFAULT_TIMEOUT_MS,
    });
    this.models = models;
  }

  async chat(req: LLMChatRequest): Promise<LLMChatResponse> {
    const modelId = this.resolveModel(req.tier);
    debug("Calling Anthropic API", { model: modelId, tier: req.tier });
    return this.callWithRetry(req, modelId);
  }

  private async callWithRetry(
    req: LLMChatRequest,
    modelId: string,
  ): Promise<LLMChatResponse> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.callApi(req, modelId);
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
    throw new GitwiseError({
      code: "API_RATE_LIMITED",
      message: lastError?.message ?? "Max retries exceeded",
      cause: lastError,
    });
  }

  private async callApi(
    req: LLMChatRequest,
    modelId: string,
  ): Promise<LLMChatResponse> {
    const response = await this.client.messages.create({
      model: modelId,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: req.systemPrompt,
      messages: [{ role: "user", content: req.userMessage }],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return {
      content: text,
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
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
