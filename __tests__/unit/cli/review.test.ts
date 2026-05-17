import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChat = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadConfig = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockHandleLLMError = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetDiff = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockValidateProvider = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateProvider = jest.fn<any>();

jest.unstable_mockModule("../../../src/core/config.js", () => ({
  readConfig: mockReadConfig,
}));

jest.unstable_mockModule("../../../src/providers/claude.js", () => ({
  handleLLMError: mockHandleLLMError,
}));

jest.unstable_mockModule("../../../src/providers/factory.js", () => ({
  createProvider: mockCreateProvider,
  validateProvider: mockValidateProvider,
}));

jest.unstable_mockModule("../../../src/providers/model-router.js", () => ({
  resolveModelTier: () => "powerful",
}));

jest.unstable_mockModule("../../../src/infra/git.js", () => ({
  getDiff: mockGetDiff,
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
    mockReadConfig.mockResolvedValue({
      models: { powerful: "claude-opus-4-6" },
      contextMode: "normal",
    });
    mockCreateProvider.mockReturnValue({ chat: mockChat });
    mockGetDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: "## Suggestions\n- Use better naming",
      usage: { inputTokens: 100, outputTokens: 50 },
    });
  });

  it("should exit when no config found", async () => {
    mockReadConfig.mockResolvedValue(null);
    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when diff is empty", async () => {
    mockGetDiff.mockResolvedValue("");
    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should generate review and display output", async () => {
    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(p.log.message).toHaveBeenCalledWith("## Suggestions\n- Use better naming");
  });

  it("should fallback to unstaged diff when base diff fails then succeeds", async () => {
    mockGetDiff
      .mockRejectedValueOnce(new Error("no base branch"))
      .mockResolvedValueOnce("diff --git a/fallback.ts");

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockGetDiff).toHaveBeenCalledTimes(2);
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it("should exit when both diff calls fail", async () => {
    mockGetDiff.mockRejectedValue(new Error("git error"));

    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should handle LLM error and return early", async () => {
    mockGetDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockRejectedValue(new Error("API error"));

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockHandleLLMError).toHaveBeenCalled();
  });

  it("should use --base option when provided", async () => {
    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "--base", "develop"]);

    expect(mockGetDiff).toHaveBeenCalledWith(expect.any(String), "develop");
  });
});
