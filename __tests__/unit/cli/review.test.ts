import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChat = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadConfig = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadState = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockWriteState = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUpdatePhase = jest.fn<any>((state: unknown) => state);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResolveFeatureRef = jest.fn<any>();
const mockGetFeaturePath = (_cwd: string, ref: string) => `/tmp/.devflow/features/${ref}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockValidateApiKey = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockHandleLLMError = jest.fn<any>();
const mockFileExists = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetDiff = jest.fn<any>();
const mockReadFile = jest.fn<() => Promise<string>>().mockResolvedValue("");
const mockWriteFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule("../../../src/core/config.js", () => ({
  readConfig: mockReadConfig,
}));

jest.unstable_mockModule("../../../src/core/state.js", () => ({
  readState: mockReadState,
  writeState: mockWriteState,
  updatePhase: mockUpdatePhase,
}));

jest.unstable_mockModule("../../../src/core/pipeline.js", () => ({
  resolveFeatureRef: mockResolveFeatureRef,
  getFeaturePath: mockGetFeaturePath,
}));

jest.unstable_mockModule("../../../src/core/context.js", () => ({
  ContextBuilder: jest.fn().mockImplementation(() => ({
    build: () => "mock context",
  })),
}));

jest.unstable_mockModule("../../../src/providers/claude.js", () => ({
  ClaudeProvider: jest.fn().mockImplementation(() => ({
    chat: mockChat,
  })),
  validateApiKey: mockValidateApiKey,
  handleLLMError: mockHandleLLMError,
}));

jest.unstable_mockModule("../../../src/providers/model-router.js", () => ({
  resolveModelTier: () => "powerful",
}));

jest.unstable_mockModule("../../../src/infra/filesystem.js", () => ({
  fileExists: mockFileExists,
}));

jest.unstable_mockModule("../../../src/infra/git.js", () => ({
  getDiff: mockGetDiff,
}));

jest.unstable_mockModule("node:fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

jest.unstable_mockModule("@clack/prompts", () => ({
  intro: jest.fn(),
  cancel: jest.fn(),
  outro: jest.fn(),
  log: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), message: jest.fn() },
  isCancel: () => false,
}));

const p = await import("@clack/prompts");
const { makeReviewCommand } = await import("../../../src/cli/commands/review.js");

describe("review command", () => {
  const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should exit when no config found", async () => {
    mockReadConfig.mockResolvedValue(null);
    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test", "001"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when no ref provided", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: {}, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: {} });
    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when feature not found", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: {}, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: {} });
    mockResolveFeatureRef.mockResolvedValue(null);
    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test", "999"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should generate review and save to file", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: "## Suggestions\n- Use better naming",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("review.md"),
      "## Suggestions\n- Use better naming",
      "utf-8",
    );
  });

  it("should detect critical findings and warn", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: "## Critical\n- Security bug found\n## Suggestions\n- None",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Critical findings"),
    );
  });

  it("should fallback to unstaged diff when base diff fails", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff
      .mockRejectedValueOnce(new Error("no base branch"))
      .mockResolvedValueOnce("diff --git a/fallback.ts");
    mockChat.mockResolvedValue({
      content: "## Suggestions\n- Minor improvement",
      usage: { inputTokens: 50, outputTokens: 25 },
    });

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockGetDiff).toHaveBeenCalledTimes(2);
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it("should exit when diff is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff.mockResolvedValue("");

    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test", "001"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should not warn when review has no critical findings", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: "## Critical\nNo critical issues found.\n## Suggestions\n- Minor fix",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(p.log.warn).not.toHaveBeenCalled();
  });

  it("should handle LLM error and return early", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockRejectedValue(new Error("API error"));

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockHandleLLMError).toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
