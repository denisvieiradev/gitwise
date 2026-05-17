import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MockLLMProvider } from "../../../src/testing/mock-llm-provider.js";
import { commit, applyCommitPlan, parseCommitResponse } from "../../../src/commands/commit.js";

const exec = promisify(execFile);

async function initRepo(dir: string): Promise<void> {
  await exec("git", ["init"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# Test");
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "initial commit"], { cwd: dir });
}

describe("parseCommitResponse", () => {
  it("strategy 1: parses pure JSON single response", () => {
    const result = parseCommitResponse('{"type":"single","message":"feat: add button"}');
    expect(result.type).toBe("single");
    if (result.type === "single") expect(result.message).toBe("feat: add button");
  });

  it("strategy 1: parses pure JSON plan response", () => {
    const result = parseCommitResponse(
      '{"type":"plan","commits":[{"message":"feat: a","files":["a.ts"]},{"message":"fix: b","files":["b.ts"]}]}',
    );
    expect(result.type).toBe("plan");
  });

  it("strategy 2: extracts JSON from fenced markdown block", () => {
    const raw = 'Here is the analysis:\n```json\n{"type":"single","message":"chore: update"}\n```\nDone.';
    const result = parseCommitResponse(raw);
    expect(result.type).toBe("single");
  });

  it("strategy 3: salvages JSON from prose-wrapped output", () => {
    const raw = 'Based on the analysis: {"type":"single","message":"fix: typo"} - that is the result.';
    const result = parseCommitResponse(raw);
    expect(result.type).toBe("single");
    if (result.type === "single") expect(result.message).toBe("fix: typo");
  });

  it("fallback: treats unrecognized output as single message", () => {
    const result = parseCommitResponse("This is just a commit message");
    expect(result.type).toBe("single");
  });
});

describe("commit()", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-commit-"));
    await initRepo(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns kind: 'single' for a single-context staged diff", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: '{"type":"single","message":"feat: add feature"}' });

    await writeFile(join(tempDir, "feature.ts"), "const x = 1;");
    await exec("git", ["add", "feature.ts"], { cwd: tempDir });

    const plan = await commit({
      cwd: tempDir,
      provider: mock,
    });

    expect(plan.kind).toBe("single");
    expect(plan.commits).toHaveLength(1);
  });

  it("returns kind: 'split' for a multi-context staged diff", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({
      content: JSON.stringify({
        type: "plan",
        commits: [
          { message: "feat: add button", files: ["button.ts"] },
          { message: "fix: typo in readme", files: ["README.md"] },
        ],
      }),
    });

    await writeFile(join(tempDir, "button.ts"), "const btn = true;");
    await exec("git", ["add", "button.ts"], { cwd: tempDir });

    const plan = await commit({
      cwd: tempDir,
      provider: mock,
    });

    expect(plan.kind).toBe("split");
    expect(plan.commits.length).toBeGreaterThanOrEqual(2);
  });

  it("split: 'never' always returns kind: 'single'", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({
      content: JSON.stringify({
        type: "plan",
        commits: [
          { message: "feat: a", files: ["a.ts"] },
          { message: "fix: b", files: ["b.ts"] },
        ],
      }),
    });

    await writeFile(join(tempDir, "a.ts"), "const a = 1;");
    await exec("git", ["add", "a.ts"], { cwd: tempDir });

    const plan = await commit({
      cwd: tempDir,
      provider: mock,
      split: "never",
    });

    expect(plan.kind).toBe("single");
  });

  it("split: 'always' throws NO_SPLIT_POSSIBLE when LLM returns single", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: '{"type":"single","message":"feat: something"}' });

    await writeFile(join(tempDir, "only.ts"), "const x = 1;");
    await exec("git", ["add", "only.ts"], { cwd: tempDir });

    await expect(
      commit({ cwd: tempDir, provider: mock, split: "always" })
    ).rejects.toMatchObject({ code: "NO_SPLIT_POSSIBLE" });
  });

  it("throws SENSITIVE_FILE_STAGED when a .env file is staged", async () => {
    const mock = new MockLLMProvider();

    await writeFile(join(tempDir, ".env"), "SECRET=abc");
    await exec("git", ["add", ".env"], { cwd: tempDir });

    await expect(
      commit({ cwd: tempDir, provider: mock })
    ).rejects.toMatchObject({ code: "SENSITIVE_FILE_STAGED" });
    mock.assertCallCount(0); // LLM should NOT be called
  });

  it("threads prompt into the LLM call userMessage", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: '{"type":"single","message":"feat: add login"}' });

    await writeFile(join(tempDir, "login.ts"), "const login = true;");
    await exec("git", ["add", "login.ts"], { cwd: tempDir });

    await commit({ cwd: tempDir, provider: mock, prompt: "implement login feature" });

    const calls = mock.getCalls();
    expect(calls[0]?.userMessage).toContain("implement login feature");
  });

  it("returns CommitPlan with tokens populated from mock", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({ content: '{"type":"single","message":"chore: update"}', tokens: { input: 42, output: 15 } });

    await writeFile(join(tempDir, "update.ts"), "const v = 2;");
    await exec("git", ["add", "update.ts"], { cwd: tempDir });

    const plan = await commit({ cwd: tempDir, provider: mock });
    expect(plan.tokens.input).toBe(42);
    expect(plan.tokens.output).toBe(15);
  });
});

describe("applyCommitPlan()", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-apply-"));
    await initRepo(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("stages and commits each plan entry; commits appear in git log in plan order", async () => {
    await writeFile(join(tempDir, "a.ts"), "const a = 1;");
    await writeFile(join(tempDir, "b.ts"), "const b = 2;");
    await exec("git", ["add", "a.ts", "b.ts"], { cwd: tempDir });

    const plan = {
      kind: "split" as const,
      commits: [
        { message: "feat: add a", files: ["a.ts"] },
        { message: "feat: add b", files: ["b.ts"] },
      ],
      tokens: { input: 10, output: 5 },
    };

    await applyCommitPlan(plan, { cwd: tempDir });

    const log = await exec("git", ["log", "--oneline", "-3"], { cwd: tempDir });
    expect(log.stdout).toContain("feat: add b");
    expect(log.stdout).toContain("feat: add a");
  });

  it("integration: create repo, stage two files, commit() + applyCommitPlan() → two commits", async () => {
    const mock = new MockLLMProvider();
    mock.queueByIndex({
      content: JSON.stringify({
        type: "plan",
        commits: [
          { message: "feat: add alpha", files: ["alpha.ts"] },
          { message: "feat: add beta", files: ["beta.ts"] },
        ],
      }),
    });

    await writeFile(join(tempDir, "alpha.ts"), "const alpha = 1;");
    await writeFile(join(tempDir, "beta.ts"), "const beta = 2;");
    await exec("git", ["add", "alpha.ts", "beta.ts"], { cwd: tempDir });

    const plan = await commit({ cwd: tempDir, provider: mock });
    expect(plan.kind).toBe("split");

    await applyCommitPlan(plan, { cwd: tempDir });

    const log = await exec("git", ["log", "--oneline", "-3"], { cwd: tempDir });
    expect(log.stdout).toContain("feat: add alpha");
    expect(log.stdout).toContain("feat: add beta");
  });

  it("integration: staging .env produces SENSITIVE_FILE_STAGED without any LLM call", async () => {
    const mock = new MockLLMProvider();
    await writeFile(join(tempDir, ".env"), "API_KEY=secret");
    await exec("git", ["add", ".env"], { cwd: tempDir });

    await expect(
      commit({ cwd: tempDir, provider: mock })
    ).rejects.toMatchObject({ code: "SENSITIVE_FILE_STAGED" });
    expect(mock.getCallCount()).toBe(0);
  });
});
