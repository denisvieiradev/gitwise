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
const mockStatus = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetLatestTag = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetLog = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetBranch = jest.fn<any>().mockResolvedValue("main");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAdd = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGitCommit = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateTag = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPushWithTags = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockIsGhAvailable = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateGitHubRelease = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFileExists = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadJSON = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockWriteJSON = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockEnsureDir = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockConfirm = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSelect = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadState = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockWriteState = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUpdatePhase = jest.fn<any>();

const mockReadFile = jest.fn<() => Promise<string>>();
const mockWriteFile = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("node:fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

jest.unstable_mockModule("../../../src/core/config.js", () => ({
  readConfig: mockReadConfig,
}));

jest.unstable_mockModule("../../../src/core/state.js", () => ({
  readState: mockReadState,
  updatePhase: mockUpdatePhase,
  writeState: mockWriteState,
}));

jest.unstable_mockModule("../../../src/core/pipeline.js", () => ({
  resolveFeatureRef: jest.fn<() => Promise<string | null>>().mockResolvedValue(null),
}));

jest.unstable_mockModule("../../../src/core/template.js", () => ({
  TemplateEngine: jest.fn().mockImplementation(() => ({
    load: jest.fn<() => Promise<string>>().mockResolvedValue("template content"),
    interpolate: jest.fn<() => string>().mockReturnValue("interpolated prompt"),
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
  resolveModelTier: () => "balanced",
}));

jest.unstable_mockModule("../../../src/infra/git.js", () => ({
  status: mockStatus,
  getLatestTag: mockGetLatestTag,
  getLog: mockGetLog,
  getBranch: mockGetBranch,
  add: mockAdd,
  commit: mockGitCommit,
  createTag: mockCreateTag,
  pushWithTags: mockPushWithTags,
}));

jest.unstable_mockModule("../../../src/infra/github.js", () => ({
  isGhAvailable: mockIsGhAvailable,
  createGitHubRelease: mockCreateGitHubRelease,
}));

jest.unstable_mockModule("../../../src/infra/filesystem.js", () => ({
  fileExists: mockFileExists,
  readJSON: mockReadJSON,
  writeJSON: mockWriteJSON,
  ensureDir: mockEnsureDir,
}));

jest.unstable_mockModule("chalk", () => ({
  default: {
    green: (s: string) => s,
    cyan: (s: string) => s,
    bold: (s: string) => s,
    dim: (s: string) => s,
    yellow: (s: string) => s,
  },
}));

jest.unstable_mockModule("@clack/prompts", () => ({
  intro: jest.fn(),
  cancel: jest.fn(),
  outro: jest.fn(),
  log: { info: jest.fn(), success: jest.fn(), message: jest.fn(), warn: jest.fn() },
  confirm: mockConfirm,
  select: mockSelect,
  isCancel: () => false,
}));

const { makeReleaseCommand } = await import("../../../src/cli/commands/release.js");

const DEFAULT_CONFIG = {
  models: { balanced: "sonnet" },
  contextMode: "normal",
  templatesPath: ".devflow/templates",
  project: { name: "test-project" },
};

describe("release command", () => {
  const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);

  beforeEach(() => {
    jest.clearAllMocks();
    // Happy path defaults
    mockReadConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockFileExists.mockResolvedValue(true);
    mockStatus.mockResolvedValue("");
    mockGetLatestTag.mockResolvedValue("v1.0.0");
    mockGetLog.mockResolvedValue("abc1234 feat: add feature\ndef5678 fix: bug fix");
    mockReadJSON.mockResolvedValue({ version: "1.0.0" });
    mockReadState.mockResolvedValue({ features: {} });
    mockConfirm.mockResolvedValue(true);
    mockGitCommit.mockResolvedValue("sha123");
    mockCreateTag.mockResolvedValue(undefined);
    mockPushWithTags.mockResolvedValue(undefined);
    mockIsGhAvailable.mockResolvedValue(true);
    mockCreateGitHubRelease.mockResolvedValue({ url: "https://github.com/test/releases/v1.1.0" });
    mockWriteJSON.mockResolvedValue(undefined);
    mockEnsureDir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue("# Changelog\n\n## [1.0.0] - 2026-03-01\n\n### Added\n- Initial release\n");
  });

  it("should exit when no config found", async () => {
    mockReadConfig.mockResolvedValue(null);
    const cmd = makeReleaseCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when no package.json found", async () => {
    mockFileExists.mockResolvedValue(false);
    const cmd = makeReleaseCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when working tree is dirty", async () => {
    mockStatus.mockResolvedValue("M src/file.ts");
    const cmd = makeReleaseCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when no commits since last tag", async () => {
    mockGetLog.mockResolvedValue("");
    const cmd = makeReleaseCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should handle first release (no tags)", async () => {
    mockGetLatestTag.mockResolvedValue(null);

    // AI calls: version suggestion, changelog, release notes
    mockChat
      .mockResolvedValueOnce({
        content: '{"suggestion": "minor", "reasoning": "new features added"}',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "### Added\n- Initial features",
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "Exciting first release!",
        usage: { inputTokens: 10, outputTokens: 5 },
      });

    // select: version bump (minor), language (English)
    mockSelect.mockResolvedValueOnce("minor").mockResolvedValueOnce("English");

    const cmd = makeReleaseCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockGetLog).toHaveBeenCalledWith(expect.any(String), undefined);
    expect(mockGitCommit).toHaveBeenCalled();
    expect(mockCreateTag).toHaveBeenCalledWith(expect.any(String), "v1.1.0", "Release v1.1.0");
  });

  it("should complete full release flow", async () => {
    // AI calls: version suggestion, changelog, release notes
    mockChat
      .mockResolvedValueOnce({
        content: '{"suggestion": "patch", "reasoning": "only bug fixes"}',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "### Fixed\n- Fixed a bug",
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "Bug fix release notes",
        usage: { inputTokens: 10, outputTokens: 5 },
      });

    // select: version bump (patch), language (English)
    mockSelect.mockResolvedValueOnce("patch").mockResolvedValueOnce("English");

    const cmd = makeReleaseCommand();
    await cmd.parseAsync(["node", "test"]);

    // Verify version bump
    expect(mockWriteJSON).toHaveBeenCalledWith(
      expect.stringContaining("package.json"),
      expect.objectContaining({ version: "1.0.1" }),
    );

    // Verify git operations
    expect(mockAdd).toHaveBeenCalled();
    expect(mockGitCommit).toHaveBeenCalledWith(expect.any(String), "chore(release): v1.0.1");
    expect(mockCreateTag).toHaveBeenCalledWith(expect.any(String), "v1.0.1", "Release v1.0.1");
    expect(mockPushWithTags).toHaveBeenCalledWith(expect.any(String), "origin", "main");
    expect(mockCreateGitHubRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "v1.0.1",
        title: "v1.0.1",
        body: "Bug fix release notes",
      }),
    );
  });

  it("should skip GitHub release when gh is not available", async () => {
    mockIsGhAvailable.mockResolvedValue(false);

    mockChat
      .mockResolvedValueOnce({
        content: '{"suggestion": "patch", "reasoning": "bug fix"}',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "### Fixed\n- Fix",
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "Notes",
        usage: { inputTokens: 10, outputTokens: 5 },
      });

    mockSelect.mockResolvedValueOnce("patch").mockResolvedValueOnce("English");

    const cmd = makeReleaseCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockCreateGitHubRelease).not.toHaveBeenCalled();
  });

  it("should handle LLM error gracefully", async () => {
    mockChat.mockRejectedValue(new Error("API error"));

    const cmd = makeReleaseCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockHandleLLMError).toHaveBeenCalled();
    expect(mockGitCommit).not.toHaveBeenCalled();
  });

  it("should cancel when user rejects version confirmation", async () => {
    mockChat.mockResolvedValueOnce({
      content: '{"suggestion": "patch", "reasoning": "fixes"}',
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    mockSelect.mockResolvedValueOnce("patch");
    // Second confirm (version) returns false
    mockConfirm.mockResolvedValueOnce(false);

    const cmd = makeReleaseCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockGitCommit).not.toHaveBeenCalled();
  });

  it("should handle push failure gracefully", async () => {
    mockPushWithTags.mockRejectedValue(new Error("push failed"));

    mockChat
      .mockResolvedValueOnce({
        content: '{"suggestion": "patch", "reasoning": "fix"}',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "### Fixed\n- Fix",
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "Notes",
        usage: { inputTokens: 10, outputTokens: 5 },
      });

    mockSelect.mockResolvedValueOnce("patch").mockResolvedValueOnce("English");

    const cmd = makeReleaseCommand();
    await cmd.parseAsync(["node", "test"]);

    // Should still complete without throwing
    expect(mockGitCommit).toHaveBeenCalled();
    expect(mockCreateTag).toHaveBeenCalled();
  });

  it("should handle malformed AI version suggestion", async () => {
    mockChat
      .mockResolvedValueOnce({
        content: "not valid json",
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "### Added\n- Feature",
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "Release notes",
        usage: { inputTokens: 10, outputTokens: 5 },
      });

    mockSelect.mockResolvedValueOnce("minor").mockResolvedValueOnce("English");

    const cmd = makeReleaseCommand();
    await cmd.parseAsync(["node", "test"]);

    // Should still work — falls back to no suggestion
    expect(mockGitCommit).toHaveBeenCalled();
    expect(mockCreateTag).toHaveBeenCalledWith(expect.any(String), "v1.1.0", "Release v1.1.0");
  });

  it("should skip push when user declines", async () => {
    mockChat
      .mockResolvedValueOnce({
        content: '{"suggestion": "patch", "reasoning": "fix"}',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "### Fixed\n- Fix",
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: "Notes",
        usage: { inputTokens: 10, outputTokens: 5 },
      });

    mockSelect.mockResolvedValueOnce("patch").mockResolvedValueOnce("English");
    // confirm: version=true, changelog=true, notes=true, push=false
    mockConfirm
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const cmd = makeReleaseCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockGitCommit).toHaveBeenCalled();
    expect(mockCreateTag).toHaveBeenCalled();
    expect(mockPushWithTags).not.toHaveBeenCalled();
    expect(mockCreateGitHubRelease).not.toHaveBeenCalled();
  });
});
