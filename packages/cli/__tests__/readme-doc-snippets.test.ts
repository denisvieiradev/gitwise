import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Walk up from the package directory to find the repo-root README.md.
// Avoids `import.meta.url` (ts-jest has known issues with it in this repo)
// and `__dirname` (undefined under ESM).
function findRepoReadme(): string {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "README.md");
    if (existsSync(candidate) && existsSync(join(dir, "packages"))) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate repo-root README.md from cwd " + process.cwd());
}

const README_PATH = findRepoReadme();

// Smoke test that guards against drift between README example commands and
// the actual CLI surface. We extract every fenced `gw release …` line from
// README.md and assert it parses cleanly through Commander with the real
// release command's option definitions but stubbed action handlers.

const samplePlan = {
  schema: 1 as const,
  strategy: "github-flow" as const,
  currentVersion: "1.0.0",
  newVersion: "1.1.0",
  suggestedBump: "minor" as const,
  changelog: "",
  notes: "",
  commits: "",
  preparedAt: "2026-05-19T00:00:00Z",
  baseCommit: "abc",
  targetBranch: "main",
  releaseBranchCreated: false,
  tokens: { input: 0, output: 0 },
};

jest.unstable_mockModule("@denisvieiradev/gitwise-core", () => ({
  prepareRelease: jest.fn(async () => samplePlan),
  finishRelease: jest.fn(async () => undefined),
  abortRelease: jest.fn(async () => undefined),
  runReleaseInProcess: jest.fn(async () => samplePlan),
  loadReleasePlan: jest.fn(async () => null),
  detectWorkspaceRoot: jest.fn(async () => false),
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

jest.unstable_mockModule("@clack/prompts", () => ({
  intro: jest.fn(),
  outro: jest.fn(),
  cancel: jest.fn(),
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  confirm: jest.fn(async () => false),
  isCancel: () => false,
}));

let makeReleaseCommand: typeof import("../src/commands/release.js").makeReleaseCommand;

beforeEach(async () => {
  const mod = await import("../src/commands/release.js");
  makeReleaseCommand = mod.makeReleaseCommand;
});

function extractReleaseSnippets(readme: string): string[] {
  const fenceRegex = /```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```/g;
  const lines: string[] = [];
  for (let match; (match = fenceRegex.exec(readme)) !== null; ) {
    const block = match[1] ?? "";
    for (const raw of block.split("\n")) {
      // Strip trailing comment so it does not get fed to the parser.
      const stripped = raw.replace(/\s+#.*$/, "").trim();
      if (stripped.startsWith("gw release")) lines.push(stripped);
    }
  }
  return lines;
}

async function parseSnippet(snippet: string): Promise<void> {
  // "gw release prepare 1.2.0" → ["prepare", "1.2.0"]
  const tokens = snippet.split(/\s+/).slice(2);
  const cmd = makeReleaseCommand();
  // Detach Commander from process.exit / stderr writes so an unknown flag
  // throws instead of killing the test runner. `exitOverride` must be set
  // on the parent AND each subcommand — Commander does not propagate it.
  const silence = {
    writeOut: () => {
      /* swallow */
    },
    writeErr: () => {
      /* swallow */
    },
  };
  cmd.exitOverride();
  cmd.configureOutput(silence);
  // The CLI's release subcommands run real handlers. Stub each subcommand's
  // action so parsing succeeds without touching git / LLM. The root command
  // already has an action wired; replace it too.
  cmd.action(async () => {
    /* no-op */
  });
  for (const sub of cmd.commands) {
    sub.exitOverride();
    sub.configureOutput(silence);
    sub.action(async () => {
      /* no-op */
    });
  }
  await cmd.parseAsync(["node", "gw", ...tokens]);
}

describe("README release snippets", () => {
  it("extracts at least one `gw release` example from README.md", async () => {
    const readme = await readFile(README_PATH, "utf-8");
    const snippets = extractReleaseSnippets(readme);
    expect(snippets.length).toBeGreaterThan(0);
  });

  it("every `gw release` example parses cleanly through the CLI", async () => {
    const readme = await readFile(README_PATH, "utf-8");
    const snippets = extractReleaseSnippets(readme);
    for (const snippet of snippets) {
      await expect(parseSnippet(snippet)).resolves.toBeUndefined();
    }
  });

  it("fails when a README example uses an undocumented flag", async () => {
    // Sanity check: feed a synthetic snippet with a bogus flag and assert
    // that parseSnippet throws. Without this guard the test would silently
    // accept any flag the README invents.
    await expect(parseSnippet("gw release prepare --not-a-real-flag")).rejects.toThrow();
  });
});
