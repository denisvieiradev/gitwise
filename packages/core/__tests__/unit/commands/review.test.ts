import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MockLLMProvider } from "../../../src/testing/mock-llm-provider.js";
import { review } from "../../../src/commands/review.js";

const exec = promisify(execFile);

const MOCK_REVIEW_RESPONSE = `
## Critical
- Missing null check in login() function at auth.ts:42

## Suggestions
- Consider extracting the validation logic into a separate helper

## Nitpicks
- Variable name 'x' could be more descriptive
`;

async function initRepo(dir: string): Promise<void> {
  await exec("git", ["init"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# Test");
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "initial commit"], { cwd: dir });
}

describe("review()", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-review-"));
    await initRepo(tempDir);
    // Create a feature branch with a commit for diff
    const currentBranch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: tempDir })).stdout.trim();
    await exec("git", ["checkout", "-b", "feature/test"], { cwd: tempDir });
    await writeFile(join(tempDir, "auth.ts"), "function login() { return true; }");
    await exec("git", ["add", "auth.ts"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "feat: add login"], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns ReviewResult with critical, suggestions, nitpicks arrays", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_REVIEW_RESPONSE });

    const result = await review({ cwd: tempDir, provider: mock });

    expect(result.critical).toBeDefined();
    expect(result.suggestions).toBeDefined();
    expect(result.nitpicks).toBeDefined();
    expect(Array.isArray(result.critical)).toBe(true);
  });

  it("returns markdown with headings Critical, Suggestions, Nitpicks in order", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_REVIEW_RESPONSE });

    const result = await review({ cwd: tempDir, provider: mock });

    const critIdx = result.markdown.indexOf("## Critical");
    const suggIdx = result.markdown.indexOf("## Suggestions");
    const nitpickIdx = result.markdown.indexOf("## Nitpicks");

    expect(critIdx).toBeGreaterThanOrEqual(0);
    expect(suggIdx).toBeGreaterThan(critIdx);
    expect(nitpickIdx).toBeGreaterThan(suggIdx);
  });

  it("uses 'powerful' tier by default", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_REVIEW_RESPONSE });

    await review({ cwd: tempDir, provider: mock });

    const calls = mock.getCalls();
    expect(calls[0]?.tier).toBe("powerful");
  });

  it("uses 'balanced' tier when requested", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_REVIEW_RESPONSE });

    await review({ cwd: tempDir, provider: mock, tier: "balanced" });

    const calls = mock.getCalls();
    expect(calls[0]?.tier).toBe("balanced");
  });

  it("threads prompt into LLM user message", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_REVIEW_RESPONSE });

    await review({ cwd: tempDir, provider: mock, prompt: "focus on security" });

    const calls = mock.getCalls();
    expect(calls[0]?.userMessage).toContain("focus on security");
  });

  it("throws EMPTY_DIFF when there are no changes", async () => {
    // Init a fresh repo with no feature branch
    const cleanDir = await mkdtemp(join(tmpdir(), "gitwise-review-clean-"));
    await initRepo(cleanDir);
    const mock = new MockLLMProvider();

    try {
      await expect(
        review({ cwd: cleanDir, provider: mock, baseBranch: "main" })
      ).rejects.toMatchObject({ code: "EMPTY_DIFF" });
    } finally {
      await rm(cleanDir, { recursive: true, force: true });
    }
  });

  it("returns tokens from mock", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_REVIEW_RESPONSE, tokens: { input: 100, output: 50 } });

    const result = await review({ cwd: tempDir, provider: mock });
    expect(result.tokens.input).toBe(100);
    expect(result.tokens.output).toBe(50);
  });

  it("does NOT read any techspec.md file from the cwd", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_REVIEW_RESPONSE });

    // Even if techspec.md exists, it should not affect the result
    await writeFile(join(tempDir, "techspec.md"), "This should be ignored");

    const result = await review({ cwd: tempDir, provider: mock });
    const calls = mock.getCalls();
    expect(calls[0]?.userMessage).not.toContain("This should be ignored");
    expect(result).toBeDefined();
  });

  it("falls back to working-tree diff when base branch is unknown locally", async () => {
    // Stage an unstaged edit so the working-tree diff is non-empty
    await writeFile(join(tempDir, "auth.ts"), "function login() { return false; }");

    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_REVIEW_RESPONSE });

    const result = await review({
      cwd: tempDir,
      provider: mock,
      baseBranch: "does-not-exist-anywhere",
    });

    expect(result.critical.length).toBeGreaterThan(0);
    mock.assertCallCount(1);
  });

  it("throws DIFF_FAILED (not silent fallback) when git diff fails for a non-revision reason", async () => {
    // A directory that is not a git repo — `git diff` fails with "not a git repository",
    // which is NOT a "branch not found" error and must surface as DIFF_FAILED.
    const nonRepoDir = await mkdtemp(join(tmpdir(), "gitwise-review-nonrepo-"));
    const mock = new MockLLMProvider();

    try {
      await expect(
        review({ cwd: nonRepoDir, provider: mock, baseBranch: "main" }),
      ).rejects.toMatchObject({ code: "DIFF_FAILED" });
    } finally {
      await rm(nonRepoDir, { recursive: true, force: true });
    }
  });

  it("falls back to the embedded default template when templatesPath omits review.md", async () => {
    // Point templatesPath at a directory that exists but does not contain review.md
    const emptyTemplates = await mkdtemp(join(tmpdir(), "gitwise-review-empty-templates-"));
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_REVIEW_RESPONSE });

    try {
      const result = await review({
        cwd: tempDir,
        provider: mock,
        templatesPath: emptyTemplates,
        // Point repoRoot at the templates dir too, so the repo-level lookup also misses.
        repoRoot: emptyTemplates,
      });

      expect(result.critical.length).toBeGreaterThan(0);
      const calls = mock.getCalls();
      // The embedded default template's "Critical" heading should appear in the user message.
      expect(calls[0]?.userMessage).toContain("## Critical");
      // The diff must still be interpolated into the fallback template.
      expect(calls[0]?.userMessage).toContain("auth.ts");
      mock.assertCallCount(1);
    } finally {
      await rm(emptyTemplates, { recursive: true, force: true });
    }
  });

  it("integration: mkdtemp repo with feature branch returns findings from canned mock", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: MOCK_REVIEW_RESPONSE });

    const result = await review({ cwd: tempDir, provider: mock });

    // Verify structure
    expect(result.critical.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.nitpicks.length).toBeGreaterThan(0);
    expect(result.markdown).toContain("## Critical");
    mock.assertCallCount(1);
  });
});
