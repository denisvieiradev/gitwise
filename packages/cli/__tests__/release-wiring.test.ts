import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// We mock the core module so we can spy on what prepare/finish/abort receive.
// `unstable_mockModule` is the ESM-aware replacement for `jest.mock`; we must
// register it BEFORE importing the CLI module under test (dynamic import inside
// each test).
const prepareReleaseMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const finishReleaseMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const abortReleaseMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const runReleaseInProcessMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const loadReleasePlanMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const detectWorkspaceRootMock = jest.fn<(...args: unknown[]) => Promise<boolean>>();

const samplePlan = {
  schema: 1 as const,
  strategy: "github-flow" as const,
  currentVersion: "1.0.0",
  newVersion: "1.1.0",
  suggestedBump: "minor" as const,
  changelog: "### Added\n- thing",
  notes: "notes",
  commits: "feat: x",
  preparedAt: "2026-05-19T00:00:00Z",
  baseCommit: "abc",
  targetBranch: "main",
  releaseBranchCreated: false,
  tokens: { input: 1, output: 1 },
};

jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
  prepareRelease: prepareReleaseMock,
  finishRelease: finishReleaseMock,
  abortRelease: abortReleaseMock,
  runReleaseInProcess: runReleaseInProcessMock,
  loadReleasePlan: loadReleasePlanMock,
  detectWorkspaceRoot: detectWorkspaceRootMock,
  getMergedConfig: jest.fn(async () => ({
    provider: "api",
    models: {},
    claudeCliPath: "",
    releaseStrategy: undefined,
    developBranch: undefined,
  })),
  getApiKey: jest.fn(async () => "fake-key"),
  createProvider: jest.fn(() => ({
    chat: async () => ({ content: "", tokens: { input: 0, output: 0 } }),
  })),
}));

// @clack/prompts must be mocked to avoid blocking on interactive prompts.
const confirmMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule("@clack/prompts", () => ({
  intro: jest.fn(),
  outro: jest.fn(),
  cancel: jest.fn(),
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  confirm: confirmMock,
  isCancel: (v: unknown) => v === Symbol.for("clack:cancel"),
}));

let makeReleaseCommand: typeof import("../src/commands/release.js").makeReleaseCommand;

beforeEach(async () => {
  prepareReleaseMock.mockReset();
  finishReleaseMock.mockReset();
  abortReleaseMock.mockReset();
  runReleaseInProcessMock.mockReset();
  loadReleasePlanMock.mockReset();
  confirmMock.mockReset();

  prepareReleaseMock.mockResolvedValue(samplePlan);
  finishReleaseMock.mockResolvedValue(undefined);
  abortReleaseMock.mockResolvedValue(undefined);
  runReleaseInProcessMock.mockResolvedValue(samplePlan);
  detectWorkspaceRootMock.mockReset();
  detectWorkspaceRootMock.mockResolvedValue(false);

  const mod = await import("../src/commands/release.js");
  makeReleaseCommand = mod.makeReleaseCommand;
});

async function run(args: string[]): Promise<void> {
  const cmd = makeReleaseCommand();
  // commander throws via process.exit on errors; capture and rethrow to fail the test.
  const exitSpy = jest
    .spyOn(process, "exit")
    .mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as never);
  try {
    await cmd.parseAsync(["node", "gw", ...args]);
  } finally {
    exitSpy.mockRestore();
  }
}

describe("gw release prepare wiring", () => {
  it("forwards `--bump minor` as `bump: 'minor'` to prepareRelease", async () => {
    await run(["prepare", "--bump", "minor"]);
    expect(prepareReleaseMock).toHaveBeenCalledTimes(1);
    const call = prepareReleaseMock.mock.calls[0]?.[0] as { bump?: string };
    expect(call.bump).toBe("minor");
  });

  it("drops an unknown bump value (treats as undefined)", async () => {
    await run(["prepare", "--bump", "garbage"]);
    const call = prepareReleaseMock.mock.calls[0]?.[0] as { bump?: string };
    expect(call.bump).toBeUndefined();
  });

  it("does not pass a `strategy` flag (resolved from RepoConfig per ADR-002)", async () => {
    await run(["prepare"]);
    const call = prepareReleaseMock.mock.calls[0]?.[0] as { strategy?: string };
    expect(call.strategy).toBeUndefined();
  });
});

describe("gw release finish wiring", () => {
  it("`--no-delete-branch` forwards `deleteReleaseBranch: false`", async () => {
    await run(["finish", "--no-delete-branch"]);
    expect(finishReleaseMock).toHaveBeenCalledTimes(1);
    const call = finishReleaseMock.mock.calls[0]?.[0] as {
      deleteReleaseBranch?: boolean;
    };
    expect(call.deleteReleaseBranch).toBe(false);
  });

  it("default invocation leaves `deleteReleaseBranch` unset (core default = true)", async () => {
    await run(["finish"]);
    const call = finishReleaseMock.mock.calls[0]?.[0] as {
      deleteReleaseBranch?: boolean;
    };
    // CLI passes through opts.deleteBranch !== false → true by default.
    expect(call.deleteReleaseBranch).toBe(true);
  });

  it("`--no-gh-release` forwards `createGhRelease: false`", async () => {
    await run(["finish", "--no-gh-release"]);
    const call = finishReleaseMock.mock.calls[0]?.[0] as {
      createGhRelease?: boolean;
    };
    expect(call.createGhRelease).toBe(false);
  });
});

describe("gw release (root one-shot) wiring", () => {
  it("passes a confirmAbortDeletesBranch callback that prompts only when releaseBranchCreated is true", async () => {
    await run([]);

    expect(runReleaseInProcessMock).toHaveBeenCalledTimes(1);
    const opts = runReleaseInProcessMock.mock.calls[0]?.[0] as {
      confirmAbortDeletesBranch?: unknown;
    };
    expect(typeof opts.confirmAbortDeletesBranch).toBe("function");

    const cb = opts.confirmAbortDeletesBranch as (p: unknown) => Promise<boolean>;

    const gitflowPlan = {
      ...samplePlan,
      strategy: "gitflow" as const,
      releaseBranchCreated: true,
      targetBranch: "release/1.1.0",
    };

    // No release branch → no prompt, no deletion.
    confirmMock.mockReset();
    const withoutBranch = await cb({ ...samplePlan, releaseBranchCreated: false });
    expect(confirmMock).not.toHaveBeenCalled();
    expect(withoutBranch).toBe(false);

    // Release branch present → prompt fires with initialValue:false and the
    // branch name in the message; "yes" threads through to true.
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
    const withBranchYes = await cb(gitflowPlan);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    const promptArg = confirmMock.mock.calls[0]?.[0] as {
      initialValue?: boolean;
      message?: string;
    };
    expect(promptArg.initialValue).toBe(false);
    expect(promptArg.message).toContain("release/1.1.0");
    expect(withBranchYes).toBe(true);

    // "no" → false (plan still cleared by abort, branch preserved).
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(false);
    const withBranchNo = await cb(gitflowPlan);
    expect(withBranchNo).toBe(false);

    // Cancel (Ctrl+C) → treat as "no".
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(Symbol.for("clack:cancel"));
    const withBranchCancel = await cb(gitflowPlan);
    expect(withBranchCancel).toBe(false);
  });
});

describe("gw release abort wiring", () => {
  it("when there's no release branch, skips the prompt and calls abortRelease with deleteBranch:false", async () => {
    loadReleasePlanMock.mockResolvedValue({
      ...samplePlan,
      releaseBranchCreated: false,
    });

    await run(["abort"]);

    expect(confirmMock).not.toHaveBeenCalled();
    expect(abortReleaseMock).toHaveBeenCalledTimes(1);
    const call = abortReleaseMock.mock.calls[0]?.[0] as { deleteBranch?: boolean };
    expect(call.deleteBranch).toBe(false);
  });

  it("when a release branch exists, prompts with initialValue:false and only deletes on explicit yes", async () => {
    loadReleasePlanMock.mockResolvedValue({
      ...samplePlan,
      strategy: "gitflow",
      releaseBranchCreated: true,
      targetBranch: "release/1.1.0",
    });
    confirmMock.mockResolvedValue(true);

    await run(["abort"]);

    expect(confirmMock).toHaveBeenCalledTimes(1);
    const promptArg = confirmMock.mock.calls[0]?.[0] as {
      initialValue?: boolean;
      message?: string;
    };
    expect(promptArg.initialValue).toBe(false);
    expect(promptArg.message).toContain("release/1.1.0");

    expect(abortReleaseMock).toHaveBeenCalledTimes(1);
    const call = abortReleaseMock.mock.calls[0]?.[0] as { deleteBranch?: boolean };
    expect(call.deleteBranch).toBe(true);
  });

  it("default-no prompt response calls abortRelease with deleteBranch:false (plan still cleared)", async () => {
    loadReleasePlanMock.mockResolvedValue({
      ...samplePlan,
      strategy: "gitflow",
      releaseBranchCreated: true,
      targetBranch: "release/1.1.0",
    });
    confirmMock.mockResolvedValue(false);

    await run(["abort"]);

    expect(abortReleaseMock).toHaveBeenCalledTimes(1);
    const call = abortReleaseMock.mock.calls[0]?.[0] as { deleteBranch?: boolean };
    expect(call.deleteBranch).toBe(false);
  });
});
