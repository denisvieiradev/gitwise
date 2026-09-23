/**
 * Task 13 — CLI command wrappers tests
 *
 * These tests verify that each command wrapper:
 * 1. Exports a factory function that returns a Commander Command
 * 2. Registers the correct options
 * 3. Has the expected command name and description
 */

import { describe, it, expect, jest } from "@jest/globals";
import { makeCommitCommand, formatCommitErrorCancel } from "../src/commands/commit.js";
import { makeReviewCommand } from "../src/commands/review.js";
import { makePrCommand } from "../src/commands/pr.js";
import { makeReleaseCommand } from "../src/commands/release.js";

// ---------------------------------------------------------------------------
// makeCommitCommand
// ---------------------------------------------------------------------------

describe("makeCommitCommand", () => {
  const cmd = makeCommitCommand();

  it("has name 'commit'", () => {
    expect(cmd.name()).toBe("commit");
  });

  it("has a description", () => {
    expect(cmd.description()).toBeTruthy();
  });

  it("registers --split option", () => {
    const opt = cmd.options.find((o) => o.long === "--split");
    expect(opt).toBeDefined();
  });

  it("registers --push option", () => {
    const opt = cmd.options.find((o) => o.long === "--push");
    expect(opt).toBeDefined();
  });

  it("registers --apply option (alias kept for backward compat)", () => {
    const opt = cmd.options.find((o) => o.long === "--apply");
    expect(opt).toBeDefined();
  });

  it("registers --no-confirm option (spec-canonical confirm-skip flag)", () => {
    const opt = cmd.options.find((o) => o.long === "--no-confirm");
    expect(opt).toBeDefined();
  });

  it("registers --message <m> option to bypass the LLM", () => {
    const opt = cmd.options.find((o) => o.long === "--message");
    expect(opt).toBeDefined();
    expect(opt?.required).toBe(true);
  });

  it("registers --base <branch> option", () => {
    const opt = cmd.options.find((o) => o.long === "--base");
    expect(opt).toBeDefined();
    expect(opt?.required).toBe(true);
  });
});

describe("formatCommitErrorCancel", () => {
  it("returns the staging-help message for NOTHING_STAGED code", () => {
    const err = Object.assign(new Error("No staged changes to commit"), {
      code: "NOTHING_STAGED",
    });
    expect(formatCommitErrorCancel(err)).toBe(
      "No staged changes. Use `git add` to stage files first.",
    );
  });

  it("returns the sensitive-file message for SENSITIVE_FILE_BLOCKED code", () => {
    const err = Object.assign(
      new Error("SENSITIVE_FILE_BLOCKED: 1 file(s) matched sensitive patterns."),
      { code: "SENSITIVE_FILE_BLOCKED" },
    );
    expect(formatCommitErrorCancel(err)).toBe(
      "Sensitive file detected: SENSITIVE_FILE_BLOCKED: 1 file(s) matched sensitive patterns.",
    );
  });

  it("falls back to generic Error: <message> when code is unrecognized", () => {
    const err = new Error("boom");
    expect(formatCommitErrorCancel(err)).toBe("Error: boom");
  });

  it("does not match on substring of the message (regression for dead-branch bug)", () => {
    // Mimics the historical bug: error message happens to contain a code token
    // but the structured code is something else. The friendly branch must NOT fire.
    const err = Object.assign(new Error("contains NOTHING_STAGED in the text"), {
      code: "SOMETHING_ELSE",
    });
    expect(formatCommitErrorCancel(err)).toBe(
      "Error: contains NOTHING_STAGED in the text",
    );
  });

  it("handles non-Error throwables via String() fallback", () => {
    expect(formatCommitErrorCancel("plain string")).toBe("Error: plain string");
    expect(formatCommitErrorCancel(null)).toBe("Error: null");
  });
});

// ---------------------------------------------------------------------------
// makeReviewCommand
// ---------------------------------------------------------------------------

describe("makeReviewCommand", () => {
  const cmd = makeReviewCommand();

  it("has name 'review'", () => {
    expect(cmd.name()).toBe("review");
  });

  it("has a description", () => {
    expect(cmd.description()).toBeTruthy();
  });

  it("registers --base option", () => {
    const opt = cmd.options.find((o) => o.long === "--base");
    expect(opt).toBeDefined();
  });

  it("registers --prompt option", () => {
    const opt = cmd.options.find((o) => o.long === "--prompt");
    expect(opt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// makePrCommand
// ---------------------------------------------------------------------------

describe("makePrCommand", () => {
  const cmd = makePrCommand();

  it("has name 'pr'", () => {
    expect(cmd.name()).toBe("pr");
  });

  it("has a description", () => {
    expect(cmd.description()).toBeTruthy();
  });

  it("registers --base option", () => {
    const opt = cmd.options.find((o) => o.long === "--base");
    expect(opt).toBeDefined();
  });

  it("registers --apply option", () => {
    const opt = cmd.options.find((o) => o.long === "--apply");
    expect(opt).toBeDefined();
  });

  it("registers --draft option", () => {
    const opt = cmd.options.find((o) => o.long === "--draft");
    expect(opt).toBeDefined();
  });

  it("registers --prompt option", () => {
    const opt = cmd.options.find((o) => o.long === "--prompt");
    expect(opt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// makeReleaseCommand
// ---------------------------------------------------------------------------

describe("makeReleaseCommand", () => {
  const cmd = makeReleaseCommand();

  it("has name 'release'", () => {
    expect(cmd.name()).toBe("release");
  });

  it("has a description", () => {
    expect(cmd.description()).toBeTruthy();
  });

  it("registers --bump option on the root action", () => {
    const opt = cmd.options.find((o) => o.long === "--bump");
    expect(opt).toBeDefined();
  });

  it("registers --apply option on the root action", () => {
    const opt = cmd.options.find((o) => o.long === "--apply");
    expect(opt).toBeDefined();
  });

  it("registers --no-gh-release option on the root action", () => {
    const opt = cmd.options.find((o) => o.long === "--no-gh-release");
    expect(opt).toBeDefined();
  });

  it("registers --no-workspace-propagation option on the root action", () => {
    const opt = cmd.options.find((o) => o.long === "--no-workspace-propagation");
    expect(opt).toBeDefined();
  });

  describe("subcommands", () => {
    const subcommandNames = cmd.commands.map((c) => c.name());

    it("registers 'prepare' subcommand", () => {
      expect(subcommandNames).toContain("prepare");
    });

    it("registers 'finish' subcommand", () => {
      expect(subcommandNames).toContain("finish");
    });

    it("registers 'abort' subcommand", () => {
      expect(subcommandNames).toContain("abort");
    });

    it("'prepare' accepts an optional [version] argument", () => {
      const prepare = cmd.commands.find((c) => c.name() === "prepare");
      // commander stringifies optional args as "[version]"
      const usage = prepare?.usage() ?? "";
      expect(usage).toContain("[version]");
    });

    it("'prepare' registers --bump option", () => {
      const prepare = cmd.commands.find((c) => c.name() === "prepare");
      const opt = prepare?.options.find((o) => o.long === "--bump");
      expect(opt).toBeDefined();
    });

    it("'finish' registers --no-delete-branch flag (per ADR-001)", () => {
      const finish = cmd.commands.find((c) => c.name() === "finish");
      const opt = finish?.options.find((o) => o.long === "--no-delete-branch");
      expect(opt).toBeDefined();
    });

    it("'finish' registers --no-gh-release and --no-workspace-propagation", () => {
      const finish = cmd.commands.find((c) => c.name() === "finish");
      const optGh = finish?.options.find((o) => o.long === "--no-gh-release");
      const optWs = finish?.options.find(
        (o) => o.long === "--no-workspace-propagation",
      );
      expect(optGh).toBeDefined();
      expect(optWs).toBeDefined();
    });

    it("does NOT expose --strategy as a CLI flag (resolved from RepoConfig per ADR-002)", () => {
      // Strategy is a repo-level property; flags on prepare/finish would let
      // the two phases disagree. Guard against accidental reintroduction.
      const allOptions = [
        ...cmd.options,
        ...cmd.commands.flatMap((c) => c.options),
      ];
      const strategyOpt = allOptions.find((o) => o.long === "--strategy");
      expect(strategyOpt).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// PROV-07: "Tokens: n/a" print sites (T17)
//
// Each case re-mocks @denisvieiradev/gitwise-core and @clack/prompts fresh
// (jest.resetModules() + jest.unstable_mockModule(), then a dynamic import of
// the command module under test) so it doesn't disturb the static top-level
// imports the rest of this file's tests rely on — mirrors the pattern already
// used by pr.test.ts's applyPr() mocked-module cases.
// ---------------------------------------------------------------------------

const CLACK_MOCK = {
  intro: jest.fn(),
  outro: jest.fn(),
  cancel: jest.fn(),
  spinner: () => ({ start: jest.fn(), stop: jest.fn(), message: jest.fn() }),
  confirm: jest.fn(async () => true),
  select: jest.fn(async () => "apply"),
  multiselect: jest.fn(async () => []),
  text: jest.fn(async () => ""),
  isCancel: (v: unknown) => v === Symbol.for("clack:cancel"),
};

const BASE_CORE_MOCK = {
  getMergedConfig: jest.fn(async () => ({ provider: "api", models: {}, claudeCliPath: "" })),
  getApiKey: jest.fn(async () => "fake-key"),
  createProvider: jest.fn(() => ({ chat: async () => ({ content: "", tokens: { input: 0, output: 0 }, tokensAvailable: true }) })),
  buildProviderConfig: jest.fn(() => ({ kind: "api", models: { fast: "f", balanced: "b", powerful: "p" } })),
  // T27: formatTokens relocated from ./token-format.js (cli-local) to
  // @denisvieiradev/gitwise-core — every command file now imports it from
  // the mocked core module, so the mock must provide it too.
  formatTokens: (tokens: { input: number; output: number }, tokensAvailable: boolean): string =>
    tokensAvailable ? `${tokens.input} in / ${tokens.output} out` : "n/a",
  GitwiseError: class MockGitwiseError extends Error {
    code: string;
    constructor(args: { code: string; message: string }) {
      super(args.message);
      this.code = args.code;
    }
  },
  git: {
    parseStatus: jest.fn(async () => []),
    add: jest.fn(async () => undefined),
    push: jest.fn(async () => undefined),
  },
};

describe("token output shows n/a when the provider doesn't report usage (PROV-07)", () => {
  it("gw commit prints 'Tokens: n/a'", async () => {
    jest.resetModules();
    jest.unstable_mockModule("@clack/prompts", () => CLACK_MOCK);
    jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
      ...BASE_CORE_MOCK,
      commit: jest.fn(async () => ({
        kind: "single",
        commits: [{ message: "chore: stub", files: [] }],
        tokens: { input: 0, output: 0 },
        tokensAvailable: false,
      })),
      applyCommitPlan: jest.fn(async () => undefined),
    }));
    const { makeCommitCommand: makeCommitCommandMocked } = await import("../src/commands/commit.js");
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const cmd = makeCommitCommandMocked();
    await cmd.parseAsync(["node", "commit", "--no-confirm"]);

    expect(logSpy.mock.calls.some((call) => String(call[0]).includes("Tokens: n/a"))).toBe(true);

    logSpy.mockRestore();
    jest.dontMock("@denisvieiradev/gitwise-core");
    jest.dontMock("@clack/prompts");
    jest.resetModules();
  });

  it("gw review prints 'Tokens: n/a'", async () => {
    jest.resetModules();
    jest.unstable_mockModule("@clack/prompts", () => CLACK_MOCK);
    jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
      ...BASE_CORE_MOCK,
      review: jest.fn(async () => ({
        critical: [{ description: "an issue" }],
        suggestions: [],
        nitpicks: [],
        markdown: "",
        tokens: { input: 0, output: 0 },
        tokensAvailable: false,
      })),
    }));
    const { makeReviewCommand: makeReviewCommandMocked } = await import("../src/commands/review.js");
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const cmd = makeReviewCommandMocked();
    await cmd.parseAsync(["node", "review"]);

    expect(logSpy.mock.calls.some((call) => String(call[0]).includes("Tokens: n/a"))).toBe(true);

    logSpy.mockRestore();
    jest.dontMock("@denisvieiradev/gitwise-core");
    jest.dontMock("@clack/prompts");
    jest.resetModules();
  });

  it("gw pr prints 'Tokens: n/a'", async () => {
    jest.resetModules();
    jest.unstable_mockModule("@clack/prompts", () => CLACK_MOCK);
    jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
      ...BASE_CORE_MOCK,
      pr: jest.fn(async () => ({
        title: "feat: stub",
        body: "body",
        tokens: { input: 0, output: 0 },
        tokensAvailable: false,
      })),
      applyPr: jest.fn(async () => ({ url: "https://example.com/pr/1" })),
    }));
    const { makePrCommand: makePrCommandMocked } = await import("../src/commands/pr.js");
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const cmd = makePrCommandMocked();
    await cmd.parseAsync(["node", "pr", "--apply"]);

    expect(logSpy.mock.calls.some((call) => String(call[0]).includes("Tokens: n/a"))).toBe(true);

    logSpy.mockRestore();
    jest.dontMock("@denisvieiradev/gitwise-core");
    jest.dontMock("@clack/prompts");
    jest.resetModules();
  });

  it("gw release prepare prints 'Tokens: n/a'", async () => {
    jest.resetModules();
    jest.unstable_mockModule("@clack/prompts", () => CLACK_MOCK);
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
      finishRelease: jest.fn(async () => undefined),
      abortRelease: jest.fn(async () => undefined),
      runReleaseInProcess: jest.fn(async () => undefined),
      loadReleasePlan: jest.fn(async () => null),
      detectWorkspaceRoot: jest.fn(async () => false),
    }));
    const { makeReleaseCommand: makeReleaseCommandMocked } = await import("../src/commands/release.js");
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const cmd = makeReleaseCommandMocked();
    await cmd.parseAsync(["node", "release", "prepare"]);

    expect(logSpy.mock.calls.some((call) => String(call[0]).includes("Tokens: n/a"))).toBe(true);

    logSpy.mockRestore();
    jest.dontMock("@denisvieiradev/gitwise-core");
    jest.dontMock("@clack/prompts");
    jest.resetModules();
  });
});
