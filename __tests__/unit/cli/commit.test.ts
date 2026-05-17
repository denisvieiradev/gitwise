import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChat = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadConfig = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockValidateApiKey = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockHandleLLMError = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetStagedDiff = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetStagedFilesList = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGitCommit = jest.fn<any>();
const mockGetBranch = jest.fn<() => Promise<string>>().mockResolvedValue("feature/test");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPush = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResetStaged = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAdd = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockConfirm = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSelect = jest.fn<any>();

jest.unstable_mockModule("../../../src/core/config.js", () => ({
  readConfig: mockReadConfig,
}));

jest.unstable_mockModule("../../../src/providers/claude.js", () => ({
  ClaudeProvider: jest.fn().mockImplementation(() => ({
    chat: mockChat,
  })),
  validateApiKey: mockValidateApiKey,
  handleLLMError: mockHandleLLMError,
}));

jest.unstable_mockModule("../../../src/providers/model-router.js", () => ({
  resolveModelTier: () => "fast",
}));

jest.unstable_mockModule("../../../src/infra/git.js", () => ({
  getStagedDiff: mockGetStagedDiff,
  getStagedFilesList: mockGetStagedFilesList,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getStagedFiles: jest.fn<any>().mockResolvedValue([]),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUnstagedFiles: jest.fn<any>().mockResolvedValue([]),
  commit: mockGitCommit,
  getBranch: mockGetBranch,
  push: mockPush,
  add: mockAdd,
  resetStaged: mockResetStaged,
}));

jest.unstable_mockModule("chalk", () => ({
  default: {
    green: (s: string) => s,
    cyan: (s: string) => s,
    bold: (s: string) => s,
    yellow: (s: string) => s,
    red: (s: string) => s,
    dim: (s: string) => s,
  },
}));

jest.unstable_mockModule("@clack/prompts", () => ({
  intro: jest.fn(),
  cancel: jest.fn(),
  outro: jest.fn(),
  log: { info: jest.fn(), success: jest.fn(), message: jest.fn() },
  confirm: mockConfirm,
  select: mockSelect,
  multiselect: jest.fn(),
  groupMultiselect: jest.fn(),
  isCancel: () => false,
}));

const { makeCommitCommand } = await import("../../../src/cli/commands/commit.js");

describe("commit command", () => {
  const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
    mockGetStagedFilesList.mockResolvedValue(["file.ts"]);
  });

  it("should exit when no config found", async () => {
    mockReadConfig.mockResolvedValue(null);
    const cmd = makeCommitCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when no staged changes", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: {}, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("");
    const cmd = makeCommitCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should generate single commit message and commit on confirmation", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: '{"type": "single", "message": "feat(core): add new feature"}',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockConfirm.mockResolvedValue(true);
    mockGitCommit.mockResolvedValue("abc1234");

    const cmd = makeCommitCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockGitCommit).toHaveBeenCalledWith(
      expect.any(String),
      "feat(core): add new feature",
    );
  });

  it("should parse JSON wrapped in code fences with extra text after", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: '```json\n{\n  "type": "single",\n  "message": "refactor: rename example services"\n}\n```\n\n**Rationale:** This is a cohesive refactoring.',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockConfirm.mockResolvedValue(true);
    mockGitCommit.mockResolvedValue("abc1234");

    const cmd = makeCommitCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockGitCommit).toHaveBeenCalledWith(
      expect.any(String),
      "refactor: rename example services",
    );
  });

  it("should parse JSON mixed with surrounding explanation text", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: 'Here is the commit message:\n{"type": "single", "message": "fix(api): resolve timeout issue"}\nThis fixes the connection problem.',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockConfirm.mockResolvedValue(true);
    mockGitCommit.mockResolvedValue("abc1234");

    const cmd = makeCommitCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockGitCommit).toHaveBeenCalledWith(
      expect.any(String),
      "fix(api): resolve timeout issue",
    );
  });

  it("should handle raw commit message (non-JSON fallback)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: "feat(core): add new feature",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockConfirm.mockResolvedValue(true);
    mockGitCommit.mockResolvedValue("abc1234");

    const cmd = makeCommitCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockGitCommit).toHaveBeenCalledWith(
      expect.any(String),
      "feat(core): add new feature",
    );
  });

  it("should show commit plan and split into separate commits", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/auth.ts\ndiff --git a/db.ts");
    mockGetStagedFilesList.mockResolvedValue(["src/auth.ts", "src/db.ts"]);
    mockChat.mockResolvedValue({
      content: JSON.stringify({
        type: "plan",
        commits: [
          { message: "feat(auth): add login endpoint", files: ["src/auth.ts"] },
          { message: "fix(db): resolve connection timeout", files: ["src/db.ts"] },
        ],
      }),
      usage: { inputTokens: 20, outputTokens: 10 },
    });
    mockSelect.mockResolvedValue("split");
    mockResetStaged.mockResolvedValue(undefined);
    mockAdd.mockResolvedValue(undefined);
    mockGitCommit.mockResolvedValue("abc1234");

    const cmd = makeCommitCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockResetStaged).toHaveBeenCalledWith(expect.any(String));
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledWith(expect.any(String), ["src/auth.ts"]);
    expect(mockAdd).toHaveBeenCalledWith(expect.any(String), ["src/db.ts"]);
    expect(mockGitCommit).toHaveBeenCalledTimes(2);
    expect(mockGitCommit).toHaveBeenCalledWith(expect.any(String), "feat(auth): add login endpoint");
    expect(mockGitCommit).toHaveBeenCalledWith(expect.any(String), "fix(db): resolve connection timeout");
  });

  it("should show commit plan and commit all as single when chosen", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/auth.ts\ndiff --git a/db.ts");
    mockGetStagedFilesList.mockResolvedValue(["src/auth.ts", "src/db.ts"]);
    mockChat.mockResolvedValue({
      content: JSON.stringify({
        type: "plan",
        commits: [
          { message: "feat(auth): add login endpoint", files: ["src/auth.ts"] },
          { message: "fix(db): resolve connection timeout", files: ["src/db.ts"] },
        ],
      }),
      usage: { inputTokens: 20, outputTokens: 10 },
    });
    mockSelect.mockResolvedValue("single");
    mockGitCommit.mockResolvedValue("abc1234");

    const cmd = makeCommitCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockResetStaged).not.toHaveBeenCalled();
    expect(mockGitCommit).toHaveBeenCalledTimes(1);
    expect(mockGitCommit).toHaveBeenCalledWith(
      expect.any(String),
      "feat(auth): add login endpoint\n\nfix(db): resolve connection timeout",
    );
  });

  it("should exit when user cancels confirmation", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: '{"type": "single", "message": "feat: something"}',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockConfirm.mockResolvedValue(false);

    const cmd = makeCommitCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockGitCommit).not.toHaveBeenCalled();
  });

  it("should handle LLM error gracefully", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockRejectedValue(new Error("API error"));

    const cmd = makeCommitCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockHandleLLMError).toHaveBeenCalled();
    expect(mockGitCommit).not.toHaveBeenCalled();
  });
});
