import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

// Mock @denisvieiradev/gitwise-core so we can drive specific GitwiseError
// throws from commit() and verify the resulting CLI surface (exit code, JSON
// envelope, stderr hint). `unstable_mockModule` is the ESM-aware shim and
// must be registered BEFORE the dynamic import of the module under test.

const commitMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const applyCommitPlanMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getApiKeyMock = jest.fn<(...args: unknown[]) => Promise<string | undefined>>();
const getMergedConfigMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const createProviderMock = jest.fn<(...args: unknown[]) => unknown>();
const parseStatusMock = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const gitAddMock = jest.fn<(...args: unknown[]) => Promise<void>>();
const selectMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const multiselectMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const setVerboseMock = jest.fn<(enabled: boolean) => void>();

jest.unstable_mockModule("@denisvieiradev/gitwise-core", async () => {
  // Import GitwiseError/EXIT_CODES/wrapError from the real source so
  // `instanceof GitwiseError` still works across the mock boundary. Avoid a
  // module-wide spread — pulling in the whole core surface (Anthropic SDK,
  // commands tree) at mock-eval time blows the jest worker heap.
  const errors = await import("../../core/src/errors.js");
  return {
    GitwiseError: errors.GitwiseError,
    EXIT_CODES: errors.EXIT_CODES,
    wrapError: errors.wrapError,
    commit: commitMock,
    applyCommitPlan: applyCommitPlanMock,
    parseCommitResponse: jest.fn(),
    getApiKey: getApiKeyMock,
    getMergedConfig: getMergedConfigMock,
    createProvider: createProviderMock,
    writeUserConfig: jest.fn(),
    git: {
      parseStatus: parseStatusMock,
      add: gitAddMock,
      push: jest.fn(),
    },
    review: jest.fn(),
    pr: jest.fn(),
    applyPr: jest.fn(),
    prepareRelease: jest.fn(),
    finishRelease: jest.fn(),
    abortRelease: jest.fn(),
    loadReleasePlan: jest.fn(),
    runReleaseInProcess: jest.fn(),
    detectWorkspaceRoot: jest.fn(async () => false),
    // first-run.ts uses these, but the test passes skipFirstRun: true so
    // they're imported (static) but never invoked.
    fileExists: jest.fn(async () => false),
    readUserConfig: jest.fn(),
    writeApiKey: jest.fn(),
    resolveClaudeBinary: jest.fn(() => undefined),
    setVerbose: setVerboseMock,
  };
});

// Silence clack so spinners/intros don't flush ANSI noise into our captured
// stdout. The CLI also force-silences stdout in json-mode, but unit tests for
// non-json paths benefit from this too.
jest.unstable_mockModule("@clack/prompts", () => ({
  intro: jest.fn(),
  outro: jest.fn(),
  cancel: jest.fn(),
  spinner: () => ({ start: jest.fn(), stop: jest.fn(), message: jest.fn() }),
  confirm: jest.fn(async () => true),
  select: selectMock,
  multiselect: multiselectMock,
  password: jest.fn(),
  isCancel: () => false,
  log: { info: jest.fn() },
}));

let runCli: typeof import("../src/run-cli.js").runCli;
let API_KEY_DEPRECATION_WARNING: string;
let GitwiseError: typeof import("@denisvieiradev/gitwise-core").GitwiseError;

beforeEach(async () => {
  jest.resetModules();
  commitMock.mockReset();
  applyCommitPlanMock.mockReset();
  getApiKeyMock.mockReset();
  getMergedConfigMock.mockReset();
  createProviderMock.mockReset();
  parseStatusMock.mockReset();
  gitAddMock.mockReset();
  selectMock.mockReset();
  multiselectMock.mockReset();
  setVerboseMock.mockReset();

  getMergedConfigMock.mockResolvedValue({
    provider: "api",
    models: {},
    claudeCliPath: "",
  });
  getApiKeyMock.mockResolvedValue("fake-key");
  createProviderMock.mockReturnValue({
    chat: async () => ({ content: "", tokens: { input: 0, output: 0 } }),
  });
  parseStatusMock.mockResolvedValue([]);

  const runCliMod = await import("../src/run-cli.js");
  runCli = runCliMod.runCli;
  API_KEY_DEPRECATION_WARNING = runCliMod.API_KEY_DEPRECATION_WARNING;
  const core = await import("@denisvieiradev/gitwise-core");
  GitwiseError = core.GitwiseError;
});

interface Capture {
  stdout: string[];
  stderr: string[];
  exitCode: number | undefined;
  options: () => Parameters<typeof runCli>[1];
}

function makeCapture(): Capture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;
  const exit = ((code: number): never => {
    exitCode = code;
    throw new Error(`__exit:${code}`);
  }) as (code: number) => never;
  return {
    stdout,
    stderr,
    get exitCode() {
      return exitCode;
    },
    options: () => ({
      stdoutWrite: (c: string) => {
        stdout.push(c);
      },
      stderrWrite: (c: string) => {
        stderr.push(c);
      },
      exit,
      skipFirstRun: true,
    }),
  };
}

async function runExpectingExit(
  argv: string[],
  cap: Capture,
): Promise<void> {
  try {
    await runCli(argv, cap.options());
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith("__exit:")) {
      throw err;
    }
  }
}

describe("runCli end-to-end — exit-code dispatch", () => {
  it("exits 10 when commit throws GitwiseError(NOTHING_STAGED)", async () => {
    commitMock.mockRejectedValue(
      new GitwiseError({ code: "NOTHING_STAGED", message: "No staged changes to commit" }),
    );

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit"], cap);

    expect(cap.exitCode).toBe(10);
    const stderrJoined = cap.stderr.join("");
    expect(stderrJoined).toContain("No staged changes");
    expect(stderrJoined).toContain("exit-codes");
  });

  it("exits 31 when the api provider is selected without ANTHROPIC_API_KEY", async () => {
    getApiKeyMock.mockResolvedValue(undefined);

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit"], cap);

    expect(cap.exitCode).toBe(31);
    const stderrJoined = cap.stderr.join("");
    expect(stderrJoined).toContain("ANTHROPIC_API_KEY");
    expect(stderrJoined).toContain("exit-codes");
  });

  it("exits 20 when the underlying core throws GitwiseError(GIT_FAILED)", async () => {
    commitMock.mockRejectedValue(
      new GitwiseError({ code: "GIT_FAILED", message: "git push refused: non-fast-forward" }),
    );

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit"], cap);

    expect(cap.exitCode).toBe(20);
    expect(cap.stderr.join("")).toContain("non-fast-forward");
  });

  it("exits 1 with code UNKNOWN for a plain non-GitwiseError throw", async () => {
    commitMock.mockRejectedValue(new Error("boom"));

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit"], cap);

    expect(cap.exitCode).toBe(1);
    expect(cap.stderr.join("")).toContain("boom");
  });
});

describe("runCli end-to-end — --debug wires verbose logging", () => {
  it("enables verbose/debug logging when --debug is passed", async () => {
    commitMock.mockRejectedValue(
      new GitwiseError({ code: "GIT_FAILED", message: "boom" }),
    );

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit", "--debug"], cap);

    // --debug is documented as "Show full stack traces on error", but the CLI
    // also has debug()-gated diagnostics (e.g. which sensitive files were
    // blocked) that are otherwise only reachable via the undocumented
    // GITWISE_DEBUG=1 env var. --debug must enable those too.
    expect(setVerboseMock).toHaveBeenCalledWith(true);
  });

  it("does not touch verbose logging when --debug is absent", async () => {
    commitMock.mockRejectedValue(
      new GitwiseError({ code: "GIT_FAILED", message: "boom" }),
    );

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit"], cap);

    expect(setVerboseMock).not.toHaveBeenCalled();
  });
});

describe("runCli end-to-end — --json mode", () => {
  it("emits a parseable JSON envelope on stdout AND exits 10 for NOTHING_STAGED", async () => {
    commitMock.mockRejectedValue(
      new GitwiseError({ code: "NOTHING_STAGED", message: "No staged changes to commit" }),
    );

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "--json", "commit"], cap);

    expect(cap.exitCode).toBe(10);
    // stderr in JSON mode should be empty for the error itself (deprecation
    // warning is the only thing that ever writes when no flag triggers it).
    expect(cap.stderr.join("")).toBe("");

    const joined = cap.stdout.join("").trim();
    const parsed = JSON.parse(joined) as {
      error: { code: string; message: string; exitCode: number };
    };
    expect(parsed.error.code).toBe("NOTHING_STAGED");
    expect(parsed.error.exitCode).toBe(10);
    expect(parsed.error.message).toBe("No staged changes to commit");
  });

  it("emits a JSON envelope for non-GitwiseError throws (wrapped as UNKNOWN)", async () => {
    commitMock.mockRejectedValue(new Error("boom"));

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "--json", "commit"], cap);

    expect(cap.exitCode).toBe(1);
    const parsed = JSON.parse(cap.stdout.join("").trim()) as {
      error: { code: string; exitCode: number };
    };
    expect(parsed.error.code).toBe("UNKNOWN");
    expect(parsed.error.exitCode).toBe(1);
  });
});

describe("runCli end-to-end — --version and --json", () => {
  it("`gw --version --json` emits {\"version\":\"x.y.z\"} on stdout and exits 0", async () => {
    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "--version", "--json"], cap);

    expect(cap.exitCode).toBe(0);
    const parsed = JSON.parse(cap.stdout.join("").trim()) as { version: string };
    expect(parsed.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("runCli end-to-end — --api-key deprecation warning", () => {
  it("prints a one-line deprecation warning to stderr when --api-key is supplied", async () => {
    // The commit command is never reached because --api-key triggers a
    // deprecation log before we mock-fail the commit; ensure commit throws
    // so the flow halts predictably.
    commitMock.mockRejectedValue(
      new GitwiseError({ code: "NOTHING_STAGED", message: "stop" }),
    );

    const cap = makeCapture();
    await runExpectingExit(
      ["node", "gw", "--api-key", "sk-fake", "commit"],
      cap,
    );

    const stderrJoined = cap.stderr.join("");
    expect(stderrJoined).toContain(API_KEY_DEPRECATION_WARNING);
    expect(stderrJoined.match(/--api-key is deprecated/g)?.length).toBe(1);
  });
});

describe("runCli end-to-end — partial-staging prompt", () => {
  // The prompt is TTY-gated; jest's stdin is not a TTY, so stub it per test.
  let originalIsTTY: PropertyDescriptor | undefined;

  const stubTTY = (): void => {
    originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });
  };

  afterEach(() => {
    if (originalIsTTY) {
      Object.defineProperty(process.stdin, "isTTY", originalIsTTY);
    } else {
      delete (process.stdin as unknown as Record<string, unknown>).isTTY;
    }
    originalIsTTY = undefined;
  });

  const singlePlan = {
    kind: "single",
    commits: [{ message: "feat: x", files: ["a.ts"] }],
    tokens: { input: 0, output: 0 },
  };

  const partialStatus = [
    { file: "a.ts", indexStatus: "M", workTreeStatus: " " }, // staged
    { file: "b.ts", indexStatus: " ", workTreeStatus: "M" }, // unstaged
    { file: "c.ts", indexStatus: "?", workTreeStatus: "?" }, // untracked
  ];

  it("offers to stage more files when staged AND unstaged changes coexist", async () => {
    stubTTY();
    parseStatusMock.mockResolvedValue(partialStatus);
    commitMock.mockResolvedValue(singlePlan);
    applyCommitPlanMock.mockResolvedValue(undefined);
    // 1st select: staging prompt → add all; 2nd select: refinement loop → apply
    selectMock.mockResolvedValueOnce("add-all").mockResolvedValueOnce("apply");

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit"], cap);

    // The staging question must have been asked…
    const firstPromptMessage = (selectMock.mock.calls[0]?.[0] as { message?: string })?.message ?? "";
    expect(firstPromptMessage.toLowerCase()).toContain("unstaged");
    // …and choosing add-all must stage the remaining files before analysis.
    expect(gitAddMock).toHaveBeenCalledWith(expect.any(String), ["-A"]);
    expect(applyCommitPlanMock).toHaveBeenCalled();
  });

  it("continues with staged-only when the user keeps the current index", async () => {
    stubTTY();
    parseStatusMock.mockResolvedValue(partialStatus);
    commitMock.mockResolvedValue(singlePlan);
    applyCommitPlanMock.mockResolvedValue(undefined);
    selectMock.mockResolvedValueOnce("keep").mockResolvedValueOnce("apply");

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit"], cap);

    expect(gitAddMock).not.toHaveBeenCalled();
    expect(applyCommitPlanMock).toHaveBeenCalled();
  });

  it("stages only the picked files when the user selects a subset", async () => {
    stubTTY();
    parseStatusMock.mockResolvedValue(partialStatus);
    commitMock.mockResolvedValue(singlePlan);
    applyCommitPlanMock.mockResolvedValue(undefined);
    selectMock.mockResolvedValueOnce("pick").mockResolvedValueOnce("apply");
    multiselectMock.mockResolvedValueOnce(["b.ts"]);

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit"], cap);

    expect(gitAddMock).toHaveBeenCalledWith(expect.any(String), ["b.ts"]);
    expect(applyCommitPlanMock).toHaveBeenCalled();
  });

  it("does not prompt when everything is already staged", async () => {
    stubTTY();
    parseStatusMock.mockResolvedValue([
      { file: "a.ts", indexStatus: "M", workTreeStatus: " " },
    ]);
    commitMock.mockResolvedValue(singlePlan);
    applyCommitPlanMock.mockResolvedValue(undefined);
    selectMock.mockResolvedValueOnce("apply"); // refinement loop only

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit"], cap);

    expect(selectMock).toHaveBeenCalledTimes(1);
    const onlyPromptMessage = (selectMock.mock.calls[0]?.[0] as { message?: string })?.message ?? "";
    expect(onlyPromptMessage.toLowerCase()).not.toContain("unstaged");
    expect(gitAddMock).not.toHaveBeenCalled();
  });

  it("does not prompt with --no-confirm even when unstaged changes exist", async () => {
    stubTTY();
    parseStatusMock.mockResolvedValue(partialStatus);
    commitMock.mockResolvedValue(singlePlan);
    applyCommitPlanMock.mockResolvedValue(undefined);

    const cap = makeCapture();
    await runExpectingExit(["node", "gw", "commit", "--no-confirm"], cap);

    expect(selectMock).not.toHaveBeenCalled();
    expect(gitAddMock).not.toHaveBeenCalled();
    expect(applyCommitPlanMock).toHaveBeenCalled();
  });
});
