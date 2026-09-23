/**
 * G6: each skill script's "invoked directly" check must be safe to evaluate on
 * import. When `process.argv[1]` is absent (REPL, `node -e`) or does not
 * resolve to a real file, importing the script must neither throw nor run
 * it. When `argv[1]` is the script itself, the script still runs.
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { fileURLToPath } from "node:url";

const SCRIPTS = ["commit", "review", "pr", "release"] as const;

const originalArgv = process.argv;

function mockCore(getMergedConfig: () => Promise<unknown>): void {
  // Every named export the four scripts import statically must exist
  // (ESM linking checks them eagerly).
  jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
    getMergedConfig: jest.fn(getMergedConfig),
    getApiKey: jest.fn(async () => "fake-key"),
    createProvider: jest.fn(),
    buildProviderConfig: jest.fn(),
    formatTokens: jest.fn(),
    commit: jest.fn(),
    applyCommitPlan: jest.fn(),
    git: { push: jest.fn() },
    review: jest.fn(),
    pr: jest.fn(),
    applyPr: jest.fn(),
    release: jest.fn(),
    applyRelease: jest.fn(),
    prepareRelease: jest.fn(),
    finishRelease: jest.fn(),
    abortRelease: jest.fn(),
    detectWorkspaceRoot: jest.fn(async () => false),
  }));
}

afterEach(() => {
  process.argv = originalArgv;
  jest.restoreAllMocks();
  jest.dontMock("@denisvieiradev/gitwise-core");
  jest.resetModules();
});

describe.each(SCRIPTS)("scripts/%s.ts invoked-directly check (G6)", (name) => {
  it("imports without throwing or running when argv[1] is absent", async () => {
    jest.resetModules();
    const getMergedConfig = jest.fn(async () => ({}));
    mockCore(getMergedConfig);
    process.argv = [originalArgv[0] as string];

    await expect(import(`../scripts/${name}.js`)).resolves.toBeDefined();
    expect(getMergedConfig).not.toHaveBeenCalled();
  });

  it("imports without throwing or running when argv[1] does not resolve to a file", async () => {
    jest.resetModules();
    const getMergedConfig = jest.fn(async () => ({}));
    mockCore(getMergedConfig);
    process.argv = [originalArgv[0] as string, "/nonexistent/gitwise-g6/no-such-script.js"];

    await expect(import(`../scripts/${name}.js`)).resolves.toBeDefined();
    expect(getMergedConfig).not.toHaveBeenCalled();
  });

  it("still runs when argv[1] is the script itself", async () => {
    jest.resetModules();
    let loaded!: () => void;
    const started = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    // Reject so the script takes its error exit instead of doing real work.
    mockCore(async () => {
      loaded();
      throw new Error("stop after start");
    });
    jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exited = new Promise<unknown>((resolve) => {
      jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
        resolve(code);
        return undefined as never;
      }) as typeof process.exit);
    });
    const scriptPath = fileURLToPath(new URL(`../scripts/${name}.ts`, import.meta.url));
    process.argv = [originalArgv[0] as string, scriptPath];

    await import(`../scripts/${name}.js`);
    await started;
    expect(await exited).toBe(1);
  });
});
