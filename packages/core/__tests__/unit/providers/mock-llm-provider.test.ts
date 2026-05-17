import { describe, it, expect } from "@jest/globals";
import { MockLLMProvider } from "../../../src/testing/mock-llm-provider.js";

describe("MockLLMProvider", () => {
  it("returns scripted responses keyed by call index", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: "first response" });
    mock.queueByIndex({ content: "second response" });

    const r1 = await mock.chat({ systemPrompt: "s", userMessage: "u1", tier: "fast" });
    const r2 = await mock.chat({ systemPrompt: "s", userMessage: "u2", tier: "fast" });

    expect(r1.content).toBe("first response");
    expect(r2.content).toBe("second response");
  });

  it("returns scripted responses keyed by prompt-prefix match", async () => {
    const mock = new MockLLMProvider();
    mock.queueByPrefix("Analyze", { content: "analysis result" });
    mock.queueByPrefix("Summarize", { content: "summary result" });

    const r1 = await mock.chat({ systemPrompt: "s", userMessage: "Analyze this code", tier: "fast" });
    const r2 = await mock.chat({ systemPrompt: "s", userMessage: "Summarize this", tier: "fast" });

    expect(r1.content).toBe("analysis result");
    expect(r2.content).toBe("summary result");
  });

  it("records token totals and exposes them via assertTotalTokens", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: "r1", tokens: { input: 10, output: 5 } });
    mock.queueByIndex({ content: "r2", tokens: { input: 20, output: 10 } });

    await mock.chat({ systemPrompt: "s", userMessage: "u1", tier: "fast" });
    await mock.chat({ systemPrompt: "s", userMessage: "u2", tier: "fast" });

    mock.assertTotalTokens({ input: 30, output: 15 });
    expect(mock.getTotalTokens()).toEqual({ input: 30, output: 15 });
  });

  it("assertCallCount passes when exact match", async () => {
    const mock = new MockLLMProvider();
    await mock.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" });
    mock.assertCallCount(1);
  });

  it("assertCallCount throws when mismatch", async () => {
    const mock = new MockLLMProvider();
    await mock.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" });
    expect(() => mock.assertCallCount(2)).toThrow("Expected 2 LLM call(s), got 1");
  });

  it("returns default mock response when no scripted response matches", async () => {
    const mock = new MockLLMProvider();
    const r = await mock.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" });
    expect(r.content).toBe("mock-response-0");
  });

  it("returns the LLMChatResponse shape with content and tokens", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: "test", tokens: { input: 5, output: 3 } });
    const r = await mock.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" });
    expect(r).toEqual({ content: "test", tokens: { input: 5, output: 3 } });
  });

  it("getCalls returns all recorded call requests", async () => {
    const mock = new MockLLMProvider();
    await mock.chat({ systemPrompt: "sys", userMessage: "msg1", tier: "fast" });
    await mock.chat({ systemPrompt: "sys", userMessage: "msg2", tier: "powerful" });
    const calls = mock.getCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.userMessage).toBe("msg1");
    expect(calls[1]?.tier).toBe("powerful");
  });

  it("reset clears all state", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: "r" });
    await mock.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" });
    mock.reset();
    expect(mock.getCallCount()).toBe(0);
    expect(mock.getTotalTokens()).toEqual({ input: 0, output: 0 });
    const r = await mock.chat({ systemPrompt: "s", userMessage: "u", tier: "fast" });
    expect(r.content).toBe("mock-response-0");
  });
});

// Integration test: consumer importing from testing subpath
describe("MockLLMProvider integration", () => {
  it("can be used as LLMProvider in a fake command path", async () => {
    const { MockLLMProvider: MockProvider } = await import("../../../src/testing/index.js");
    const mock = new MockProvider();
    mock.queueByIndex({ content: "commit message: feat: add button" });

    // Simulate a command that calls LLM once
    const fakeCoreCommit = async (provider: typeof mock) => {
      const result = await provider.chat({
        systemPrompt: "Generate commit message",
        userMessage: "diff: + button added",
        tier: "fast",
      });
      return result.content;
    };

    const result = await fakeCoreCommit(mock);
    expect(result).toBe("commit message: feat: add button");
    mock.assertCallCount(1);
  });
});
