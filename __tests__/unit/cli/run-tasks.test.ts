import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { FeatureState } from "../../../src/core/types.js";

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
const mockCompleteTask = jest.fn<any>((state: unknown) => state);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResolveFeatureRef = jest.fn<any>();
const mockGetFeaturePath = (_cwd: string, ref: string) => `/tmp/.devflow/features/${ref}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockValidateApiKey = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockHandleLLMError = jest.fn<any>();
const mockFileExists = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetChangedFiles = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAdd = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGitCommit = jest.fn<any>();
const mockGetLog = jest.fn<() => Promise<string>>().mockResolvedValue("abc1234 feat: task done");
const mockCheckDrift = jest.fn<() => Promise<never[]>>().mockResolvedValue([]);
const mockReadFile = jest.fn<() => Promise<string>>().mockResolvedValue("");
const mockWriteFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule("../../../src/core/config.js", () => ({
  readConfig: mockReadConfig,
}));

jest.unstable_mockModule("../../../src/core/state.js", () => ({
  readState: mockReadState,
  writeState: mockWriteState,
  updatePhase: mockUpdatePhase,
  completeTask: mockCompleteTask,
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

jest.unstable_mockModule("../../../src/core/drift.js", () => ({
  checkDrift: mockCheckDrift,
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

jest.unstable_mockModule("../../../src/infra/filesystem.js", () => ({
  fileExists: mockFileExists,
}));

jest.unstable_mockModule("../../../src/infra/git.js", () => ({
  getChangedFiles: mockGetChangedFiles,
  add: mockAdd,
  commit: mockGitCommit,
  getLog: mockGetLog,
}));

jest.unstable_mockModule("node:fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

jest.unstable_mockModule("@clack/prompts", () => ({
  intro: jest.fn(),
  cancel: jest.fn(),
  outro: jest.fn(),
  log: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), step: jest.fn(), message: jest.fn() },
  isCancel: () => false,
}));

const p = await import("@clack/prompts");
const { makeRunTasksCommand } = await import("../../../src/cli/commands/run-tasks.js");

function makeFeature(overrides?: Partial<FeatureState>): FeatureState {
  return {
    slug: "auth-oauth",
    number: 1,
    phase: "tasks_created",
    tasks: [
      { number: 1, title: "Setup config", completed: false },
      { number: 2, title: "Implement flow", completed: false },
    ],
    artifacts: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("run-tasks command", () => {
  const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should exit when no config found", async () => {
    mockReadConfig.mockResolvedValue(null);
    const cmd = makeRunTasksCommand();
    await expect(cmd.parseAsync(["node", "test", "001"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when no ref provided", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: {}, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: {} });
    const cmd = makeRunTasksCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when no pending tasks", async () => {
    const feature = makeFeature({
      tasks: [{ number: 1, title: "Done", completed: true }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": feature } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");

    const cmd = makeRunTasksCommand();
    await expect(cmd.parseAsync(["node", "test", "001"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should execute pending tasks sequentially and commit", async () => {
    const feature = makeFeature();
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockCompleteTask.mockReturnValue(state);
    mockChat.mockResolvedValue({
      content: "Implementation details",
      usage: { inputTokens: 50, outputTokens: 30 },
    });
    mockGetChangedFiles.mockResolvedValue(["src/config.ts"]);
    mockGitCommit.mockResolvedValue("abc1234");

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(mockCompleteTask).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockGitCommit).toHaveBeenCalledTimes(2);
  });

  it("should filter out sensitive files from staging", async () => {
    const feature = makeFeature({
      tasks: [{ number: 1, title: "Setup", completed: false }],
    });
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockCompleteTask.mockReturnValue(state);
    mockChat.mockResolvedValue({
      content: "done",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockGetChangedFiles.mockResolvedValue(["src/app.ts", ".env", ".env.local", "credentials.json"]);
    mockGitCommit.mockResolvedValue("def5678");

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockAdd).toHaveBeenCalledWith(
      expect.any(String),
      ["src/app.ts"],
    );
  });

  it("should handle LLM error and return early", async () => {
    const feature = makeFeature({
      tasks: [{ number: 1, title: "Setup", completed: false }],
    });
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockChat.mockRejectedValue(new Error("API error"));

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockHandleLLMError).toHaveBeenCalled();
    expect(mockGitCommit).not.toHaveBeenCalled();
  });

  it("should exit when feature not found in state", async () => {
    const state = { features: {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-nonexistent");

    const cmd = makeRunTasksCommand();
    await expect(cmd.parseAsync(["node", "test", "001"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should skip commit when all changed files are sensitive", async () => {
    const feature = makeFeature({
      tasks: [{ number: 1, title: "Setup", completed: false }],
    });
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockCompleteTask.mockReturnValue(state);
    mockChat.mockResolvedValue({
      content: "done",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockGetChangedFiles.mockResolvedValue([".env", ".env.local", "credentials.json"]);

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockGitCommit).not.toHaveBeenCalled();
  });

  it("should not update phase when already in_progress", async () => {
    const feature = makeFeature({
      phase: "in_progress",
      tasks: [{ number: 1, title: "Setup", completed: false }],
    });
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockCompleteTask.mockReturnValue(state);
    mockChat.mockResolvedValue({
      content: "done",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockGetChangedFiles.mockResolvedValue(["src/file.ts"]);
    mockGitCommit.mockResolvedValue("abc1234");

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockUpdatePhase).not.toHaveBeenCalled();
  });

  it("should log info when git error is 'nothing to commit'", async () => {
    const feature = makeFeature({
      tasks: [{ number: 1, title: "Setup", completed: false }],
    });
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockCompleteTask.mockReturnValue(state);
    mockChat.mockResolvedValue({
      content: "done",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockGetChangedFiles.mockRejectedValue(new Error("nothing to commit, working tree clean"));

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(p.log.info).toHaveBeenCalledWith(expect.stringContaining("no changes to commit"));
  });

  it("should log warning when git error is a real failure", async () => {
    const feature = makeFeature({
      tasks: [{ number: 1, title: "Setup", completed: false }],
    });
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockCompleteTask.mockReturnValue(state);
    mockChat.mockResolvedValue({
      content: "done",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockGetChangedFiles.mockRejectedValue(new Error("fatal: permission denied"));

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining("git operation failed"));
  });
});
