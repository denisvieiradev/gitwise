import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreate = jest.fn<(...args: any[]) => any>();

const DEFAULT_MODELS = {
  fast: "claude-haiku-4-5",
  balanced: "claude-sonnet-4-5",
  powerful: "claude-opus-4-5",
};

describe("AnthropicProvider (core)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let AnthropicProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Anthropic: any;
  const originalApiKey = process.env["ANTHROPIC_API_KEY"];

  beforeEach(async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-api-key-for-unit-tests";
    mockCreate.mockReset();
    const mod = await import("../../../src/providers/anthropic.js");
    AnthropicProvider = mod.AnthropicProvider;
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env["ANTHROPIC_API_KEY"] = originalApiKey;
    } else {
      delete process.env["ANTHROPIC_API_KEY"];
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createProvider(): any {
    const provider = new AnthropicProvider(process.env["ANTHROPIC_API_KEY"], DEFAULT_MODELS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider as any).client.messages = { create: mockCreate };
    return provider;
  }

  it("chat() calls the Anthropic SDK with the model selected by tier", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Hello world" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const provider = createProvider();
    const result = await provider.chat({
      systemPrompt: "You are a helper",
      userMessage: "Say hello",
      tier: "fast",
    });
    expect(result.content).toBe("Hello world");
    expect(result.tokens.input).toBe(10);
    expect(result.tokens.output).toBe(5);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_MODELS.fast,
        system: "You are a helper",
        messages: [{ role: "user", content: "Say hello" }],
      }),
    );
  });

  it("retries up to 3 times on 429 then throws API_RATE_LIMITED", async () => {
    const apiError = new Anthropic.APIError(429, undefined, "Rate limited", {});
    mockCreate
      .mockRejectedValueOnce(apiError)
      .mockRejectedValueOnce(apiError)
      .mockRejectedValueOnce(apiError);
    const provider = createProvider();
    const err = await provider.chat({
      systemPrompt: "test",
      userMessage: "test",
      tier: "fast",
    }).catch((e: unknown) => e);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(err).toMatchObject({ code: "API_RATE_LIMITED" });
  }, 30000);

  it("retries up to 3 times on 529 then throws API_RATE_LIMITED", async () => {
    const apiError = new Anthropic.APIError(529, undefined, "Overloaded", {});
    mockCreate
      .mockRejectedValueOnce(apiError)
      .mockRejectedValueOnce(apiError)
      .mockRejectedValueOnce(apiError);
    const provider = createProvider();
    const err = await provider.chat({
      systemPrompt: "test",
      userMessage: "test",
      tier: "fast",
    }).catch((e: unknown) => e);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(err).toMatchObject({ code: "API_RATE_LIMITED" });
  }, 30000);

  it("does not retry on non-retryable errors", async () => {
    mockCreate.mockRejectedValue(new Error("Bad request"));
    const provider = createProvider();
    await expect(provider.chat({
      systemPrompt: "test",
      userMessage: "test",
      tier: "fast",
    })).rejects.toThrow("Bad request");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("uses powerful model for powerful tier", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = createProvider();
    await provider.chat({ systemPrompt: "test", userMessage: "test", tier: "powerful" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: DEFAULT_MODELS.powerful }),
    );
  });
});
