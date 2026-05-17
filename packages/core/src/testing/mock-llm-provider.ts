import type { LLMProvider, LLMChatRequest, LLMChatResponse } from "../providers/types.js";

export interface MockResponse {
  content: string;
  tokens?: { input: number; output: number };
}

export interface PrefixMatcher {
  prefix: string;
  response: MockResponse;
}

/**
 * MockLLMProvider — deterministic LLM stub for tests.
 *
 * Usage:
 *   const mock = new MockLLMProvider();
 *   mock.queueByIndex({ content: "result" });                  // first call
 *   mock.queueByPrefix("Analyze", { content: "analysis" });    // by prompt prefix
 *   await someFunction(mock);
 *   mock.assertCallCount(2);
 *   mock.assertTotalTokens({ input: 10, output: 5 });
 */
export class MockLLMProvider implements LLMProvider {
  private readonly indexedResponses: MockResponse[] = [];
  private readonly prefixResponses: PrefixMatcher[] = [];
  private callCount = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private readonly calls: LLMChatRequest[] = [];

  /** Queue a response to return for the N-th call (0-indexed). */
  queueByIndex(response: MockResponse): this {
    this.indexedResponses.push(response);
    return this;
  }

  /** Queue a response to return when userMessage starts with the given prefix. */
  queueByPrefix(prefix: string, response: MockResponse): this {
    this.prefixResponses.push({ prefix, response });
    return this;
  }

  async chat(req: LLMChatRequest): Promise<LLMChatResponse> {
    this.calls.push(req);
    const idx = this.callCount++;

    // Prefix matching takes precedence
    for (const matcher of this.prefixResponses) {
      if (req.userMessage.startsWith(matcher.prefix) || req.systemPrompt.startsWith(matcher.prefix)) {
        return this.buildResponse(matcher.response);
      }
    }

    // Index-based fallback
    const indexed = this.indexedResponses[idx];
    if (indexed) {
      return this.buildResponse(indexed);
    }

    // Default response
    return this.buildResponse({ content: `mock-response-${idx}` });
  }

  private buildResponse(r: MockResponse): LLMChatResponse {
    const tokens = r.tokens ?? { input: 10, output: 5 };
    this.totalInputTokens += tokens.input;
    this.totalOutputTokens += tokens.output;
    return { content: r.content, tokens };
  }

  /** Returns all recorded calls. */
  getCalls(): readonly LLMChatRequest[] {
    return this.calls;
  }

  /** Returns the number of chat() calls made. */
  getCallCount(): number {
    return this.callCount;
  }

  /** Assert the provider was called exactly N times. */
  assertCallCount(expected: number): void {
    if (this.callCount !== expected) {
      throw new Error(`Expected ${expected} LLM call(s), got ${this.callCount}`);
    }
  }

  /** Assert accumulated token totals. */
  assertTotalTokens(expected: { input?: number; output?: number }): void {
    if (expected.input !== undefined && this.totalInputTokens !== expected.input) {
      throw new Error(`Expected ${expected.input} input tokens, got ${this.totalInputTokens}`);
    }
    if (expected.output !== undefined && this.totalOutputTokens !== expected.output) {
      throw new Error(`Expected ${expected.output} output tokens, got ${this.totalOutputTokens}`);
    }
  }

  getTotalTokens(): { input: number; output: number } {
    return { input: this.totalInputTokens, output: this.totalOutputTokens };
  }

  reset(): void {
    this.indexedResponses.length = 0;
    this.prefixResponses.length = 0;
    this.calls.length = 0;
    this.callCount = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }
}
