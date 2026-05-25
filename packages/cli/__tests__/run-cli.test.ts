import { describe, it, expect, beforeEach, jest } from "@jest/globals";

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
      add: jest.fn(),
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
  select: jest.fn(),
  multiselect: jest.fn(),
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
