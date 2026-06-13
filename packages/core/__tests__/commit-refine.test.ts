import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { LLMChatRequest, LLMChatResponse } from "../src/providers/types.js";

// ─── Module mocks ────────────────────────────────────────────────────────────

jest.mock("../src/infra/git.js", () => ({
  getStagedFilesList: jest.fn(async () => ["src/index.ts"]),
  getStagedDiff: jest.fn(async () => "diff --git a/src/index.ts b/src/index.ts\n+const x = 1;"),
}));

jest.mock("../src/template/loader.js", () => ({
  loadTemplate: jest.fn(async () => ""),
}));

jest.mock("../src/infra/lockfile.js", () => ({
  acquireRepoLock: jest.fn(async () => async () => undefined),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { commit } from "../src/commands/commit.js";
import type { CommitAlternatives } from "../src/commands/commit.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProvider(responseContent: string) {
  return {
    async chat(_req: LLMChatRequest): Promise<LLMChatResponse> {
      return { content: responseContent, tokens: { input: 10, output: 5 } };
    },
  };
}

function makeCapturingProvider(responseContent: string) {
  let capturedRequest: LLMChatRequest | null = null;
  const provider = {
    async chat(req: LLMChatRequest): Promise<LLMChatResponse> {
      capturedRequest = req;
      return { content: responseContent, tokens: { input: 10, output: 5 } };
    },
    getLastRequest(): LLMChatRequest | null {
      return capturedRequest;
    },
  };
  return provider;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("commit() — generateAlternatives", () => {
  it("returns CommitAlternatives when LLM responds with alternatives JSON", async () => {
    const provider = makeProvider(
      JSON.stringify({ alternatives: ["feat(a): one", "feat(b): two", "fix(c): three"] })
    );

    const result = await commit({ cwd: "/tmp", provider, generateAlternatives: true });

    expect(result.kind).toBe("alternatives");
    const alt = result as CommitAlternatives;
    expect(alt.options.length).toBe(3);
    expect(alt.options[0]).toBe("feat(a): one");
  });

  it("falls back to a single option when LLM ignores alternatives instruction", async () => {
    const provider = makeProvider(
      JSON.stringify({ type: "single", message: "fix: something" })
    );

    const result = await commit({ cwd: "/tmp", provider, generateAlternatives: true });

    expect(result.kind).toBe("alternatives");
    const alt = result as CommitAlternatives;
    expect(alt.options.length).toBe(1);
  });
});

describe("commit() — feedbackHint", () => {
  it("includes feedbackHint in the user message sent to the provider", async () => {
    const provider = makeCapturingProvider(
      JSON.stringify({ type: "single", message: "fix: concise message" })
    );

    await commit({ cwd: "/tmp", provider, feedbackHint: "make it more concise" });

    const req = provider.getLastRequest();
    expect(req).not.toBeNull();
    expect(req!.userMessage).toContain("make it more concise");
  });
});
