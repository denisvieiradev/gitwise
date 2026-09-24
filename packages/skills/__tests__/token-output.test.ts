/**
 * T27 — PROV-07/AD-002: every native-surface skill script (commit, review,
 * pr, release) must print "n/a" instead of raw "0 in / 0 out" markdown when
 * the active provider doesn't report token usage, using the shared
 * `formatTokens` now relocated to `@denisvieiradev/gitwise-core`.
 *
 * Mirrors the exact re-mock-per-case pattern already used by
 * `packages/cli/__tests__/commands.test.ts`'s "token output shows n/a" suite
 * for T17: jest.resetModules() + jest.unstable_mockModule() +dynamic import,
 * so each case gets a fresh module graph without disturbing the others.
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";

// Never touched: core is mocked. Kept out of /tmp so static analysis does not treat it as a temp-file path.
const UNUSED_CWD = "/nonexistent/gitwise-unused-cwd";

const BASE_CORE_MOCK = {
  getMergedConfig: jest.fn(async () => ({ provider: "api", models: {}, claudeCliPath: "" })),
  getApiKey: jest.fn(async () => "fake-key"),
  createProvider: jest.fn(() => ({
    chat: async () => ({ content: "", tokens: { input: 0, output: 0 }, tokensAvailable: true }),
  })),
  buildProviderConfig: jest.fn(() => ({
    kind: "api",
    models: { fast: "f", balanced: "b", powerful: "p" },
  })),
  formatTokens: (tokens: { input: number; output: number }, tokensAvailable: boolean): string =>
    tokensAvailable ? `${tokens.input} in / ${tokens.output} out` : "n/a",
  // release.ts's static import list — every case below imports the module,
  // so every named export it references must exist on the mock (ESM module
  // linking checks this eagerly, even for exports a given case never calls).
  release: jest.fn(),
  applyRelease: jest.fn(async () => undefined),
  prepareRelease: jest.fn(),
  finishRelease: jest.fn(async () => undefined),
  abortRelease: jest.fn(async () => undefined),
  detectWorkspaceRoot: jest.fn(async () => false),
};

function captureStdout(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const spy = jest
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      calls.push(String(chunk));
      return true;
    });
  return { calls, restore: () => spy.mockRestore() };
}

afterEach(() => {
  jest.dontMock("@denisvieiradev/gitwise-core");
  jest.resetModules();
});

describe("skills scripts print '**Tokens used:** n/a' when the provider doesn't report usage (PROV-07/AD-002)", () => {
  it("commit skill", async () => {
    jest.resetModules();
    jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
      ...BASE_CORE_MOCK,
      commit: jest.fn(async () => ({
        kind: "single",
        commits: [{ message: "chore: stub", files: [] }],
        tokens: { input: 0, output: 0 },
        tokensAvailable: false,
      })),
      applyCommitPlan: jest.fn(async () => undefined),
      git: { push: jest.fn(async () => undefined) },
    }));
    const { runCommitSkill } = await import("../scripts/commit.js");
    const out = captureStdout();

    await runCommitSkill([], UNUSED_CWD);

    out.restore();
    expect(out.calls.some((line) => line.includes("**Tokens used:** n/a"))).toBe(true);
    expect(out.calls.some((line) => line.includes("0 in / 0 out"))).toBe(false);
  });

  it("review skill", async () => {
    jest.resetModules();
    jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
      ...BASE_CORE_MOCK,
      review: jest.fn(async () => ({
        critical: [],
        suggestions: [],
        nitpicks: [],
        markdown: "",
        tokens: { input: 0, output: 0 },
        tokensAvailable: false,
      })),
    }));
    const { runReviewSkill } = await import("../scripts/review.js");
    const out = captureStdout();

    await runReviewSkill([], UNUSED_CWD);

    out.restore();
    expect(out.calls.some((line) => line.includes("**Tokens used:** n/a"))).toBe(true);
    expect(out.calls.some((line) => line.includes("0 in / 0 out"))).toBe(false);
  });

  it("pr skill", async () => {
    jest.resetModules();
    jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
      ...BASE_CORE_MOCK,
      pr: jest.fn(async () => ({
        title: "feat: stub",
        body: "body",
        tokens: { input: 0, output: 0 },
        tokensAvailable: false,
      })),
      applyPr: jest.fn(async () => ({ url: undefined })),
    }));
    const { runPrSkill } = await import("../scripts/pr.js");
    const out = captureStdout();

    await runPrSkill([], UNUSED_CWD);

    out.restore();
    expect(out.calls.some((line) => line.includes("**Tokens used:** n/a"))).toBe(true);
    expect(out.calls.some((line) => line.includes("0 in / 0 out"))).toBe(false);
  });

  it("release skill (prepare phase)", async () => {
    jest.resetModules();
    jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
      ...BASE_CORE_MOCK,
      prepareRelease: jest.fn(async () => ({
        schema: 1,
        strategy: "github-flow",
        currentVersion: "1.0.0",
        newVersion: "1.1.0",
        suggestedBump: "minor",
        changelog: "changelog",
        notes: "notes",
        commits: "feat: x",
        preparedAt: "2026-05-19T00:00:00Z",
        baseCommit: "abc",
        targetBranch: "main",
        releaseBranchCreated: false,
        tokens: { input: 0, output: 0 },
        tokensAvailable: false,
      })),
    }));
    const { runReleaseSkill } = await import("../scripts/release.js");
    const out = captureStdout();

    await runReleaseSkill({ phase: "prepare" }, UNUSED_CWD);

    out.restore();
    expect(out.calls.some((line) => line.includes("**Tokens used:** n/a"))).toBe(true);
    expect(out.calls.some((line) => line.includes("0 in / 0 out"))).toBe(false);
  });

  it("release skill (legacy one-shot)", async () => {
    jest.resetModules();
    jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
      ...BASE_CORE_MOCK,
      release: jest.fn(async () => ({
        newVersion: "1.1.0",
        suggestedBump: "minor",
        changelog: "changelog",
        notes: "notes",
        tokens: { input: 0, output: 0 },
        tokensAvailable: false,
      })),
    }));
    const { runReleaseSkill } = await import("../scripts/release.js");
    const out = captureStdout();

    await runReleaseSkill({ phase: undefined }, UNUSED_CWD);

    out.restore();
    expect(out.calls.some((line) => line.includes("**Tokens used:** n/a"))).toBe(true);
    expect(out.calls.some((line) => line.includes("0 in / 0 out"))).toBe(false);
  });
});
