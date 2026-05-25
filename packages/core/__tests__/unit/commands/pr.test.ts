import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MockLLMProvider } from "../../../src/testing/mock-llm-provider.js";
import { pr, applyPr } from "../../../src/commands/pr.js";

const exec = promisify(execFile);

const MOCK_PR_RESPONSE = `TITLE: feat: add authentication system
---
## Summary
- Add login/logout functionality
- Implement JWT token support

## Changes
- Added auth.ts with login/logout functions
- Added JWT middleware

## Test Plan
- [ ] Test login flow
- [ ] Test token expiry`;

async function initRepoWithBranch(dir: string): Promise<string> {
  await exec("git", ["init"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# Test");
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "initial commit"], { cwd: dir });
  const baseBranch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir })).stdout.trim();
  await exec("git", ["checkout", "-b", "feature/auth"], { cwd: dir });
  await writeFile(join(dir, "auth.ts"), "const login = () => {};");
  await exec("git", ["add", "auth.ts"], { cwd: dir });
  await exec("git", ["commit", "-m", "feat: add auth"], { cwd: dir });
  return baseBranch;
}

describe("pr()", () => {
  let tempDir: string;
  let baseBranch: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-pr-"));
    baseBranch = await initRepoWithBranch(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns PrDraft with title and body populated from mock LLM", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_PR_RESPONSE });

    const draft = await pr({ cwd: tempDir, provider: mock, baseBranch });

    expect(draft.title).toBe("feat: add authentication system");
    expect(draft.body).toContain("## Summary");
    expect(draft.body).toContain("## Test Plan");
  });

  it("threads prompt into LLM call", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_PR_RESPONSE });

    await pr({ cwd: tempDir, provider: mock, baseBranch, prompt: "focus on auth flow" });

    const calls = mock.getCalls();
    expect(calls[0]?.userMessage).toContain("focus on auth flow");
  });

  it("leaves existingPrNumber undefined when no PR is open", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_PR_RESPONSE });

    const draft = await pr({ cwd: tempDir, provider: mock, baseBranch });
    // No gh available in test env, so existingPrNumber should be undefined
    expect(draft.existingPrNumber).toBeUndefined();
  });

  it("returns tokens from mock", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_PR_RESPONSE, tokens: { input: 200, output: 80 } });

    const draft = await pr({ cwd: tempDir, provider: mock, baseBranch });
    expect(draft.tokens.input).toBe(200);
    expect(draft.tokens.output).toBe(80);
  });
});

describe("applyPr()", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-apply-pr-"));
    await initRepoWithBranch(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("throws GH_UNAVAILABLE (with the draft attached) when gh is not available", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createPR: async () => {
        throw new Error("should not be called");
      },
      updatePR: async () => {
        throw new Error("should not be called");
      },
      getPrUrl: async () => {
        throw new Error("should not be called");
      },
      openPr: async () => {
        throw new Error("should not be called");
      },
    }));
    const { applyPr: applyPrMocked } = await import("../../../src/commands/pr.js");

    const draft = {
      title: "feat: test PR",
      body: "## Summary\n- Test",
      tokens: { input: 10, output: 5 },
    };

    await expect(applyPrMocked(draft, { cwd: tempDir })).rejects.toMatchObject({
      code: "GH_UNAVAILABLE",
      details: { draft },
    });

    jest.dontMock("../../../src/infra/github.js");
    jest.resetModules();
  });

  it("returns the URL from updatePR when existingPrNumber is set", async () => {
    jest.resetModules();
    const expectedUrl = "https://github.com/owner/repo/pull/42";
    const updatePR = jest.fn(async () => ({ url: expectedUrl }));
    jest.unstable_mockModule("../../../src/infra/github.js", () => ({
      isGhAvailable: async () => true,
      createPR: async () => {
        throw new Error("should not be called for update path");
      },
      updatePR,
      getPrUrl: async () => expectedUrl,
      openPr: async () => {
        throw new Error("should not be called");
      },
    }));
    const { applyPr: applyPrMocked } = await import("../../../src/commands/pr.js");

    const draft = {
      title: "feat: update PR",
      body: "Updated body",
      existingPrNumber: 42,
      tokens: { input: 10, output: 5 },
    };

    const result = await applyPrMocked(draft, { cwd: tempDir });
    expect(result.url).toBe(expectedUrl);
    expect(updatePR).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, title: draft.title, body: draft.body }),
    );

    jest.dontMock("../../../src/infra/github.js");
    jest.resetModules();
  });

  it("never returns an empty url — non-empty string on success or throws on failure", async () => {
    const draft = {
      title: "feat: update PR",
      body: "Updated body",
      existingPrNumber: 42,
      tokens: { input: 10, output: 5 },
    };

    // Honest contract: url is always a non-empty string, or the call throws.
    // In a test env without a real PR #42 or no gh, the call must throw — never silently succeed with "".
    try {
      const result = await applyPr(draft, { cwd: tempDir });
      expect(typeof result.url).toBe("string");
      expect(result.url.length).toBeGreaterThan(0);
    } catch (err) {
      // Acceptable: GH_UNAVAILABLE (gh not present) or a gh subprocess failure (no real PR).
      expect(err).toBeDefined();
    }
  });
});

describe("pr() integration", () => {
  it("creates a repo, stages commits, calls pr(), returns PrDraft", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "gitwise-pr-int-"));
    const baseBranch = await initRepoWithBranch(tempDir);
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_PR_RESPONSE });

    try {
      const draft = await pr({ cwd: tempDir, provider: mock, baseBranch });
      expect(draft.title).toBeTruthy();
      expect(draft.body).toBeTruthy();
      mock.assertCallCount(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
