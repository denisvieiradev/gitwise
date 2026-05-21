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

  it("strategy 3: extracts plan JSON wrapped in surrounding prose", () => {
    const raw =
      'Here is the plan for your changes:\n{"type":"plan","commits":[{"message":"feat: a","files":["a.ts"]},{"message":"fix: b","files":["b.ts"]}]}\nLet me know if you want adjustments.';
    const result = parseCommitResponse(raw);
    expect(result.type).toBe("plan");
    if (result.type === "plan") {
      expect(result.commits).toHaveLength(2);
      expect(result.commits[0]?.message).toBe("feat: a");
    }
  });

  it("strategy 3: prefers plan when both plan and single objects are emitted with prose between them", () => {
    const raw = [
      "First, here is a single fallback in case you want it:",
      '{"type":"single","message":"chore: rollup"}',
      "But the real recommendation is to split:",
      '{"type":"plan","commits":[{"message":"feat: a","files":["a.ts"]},{"message":"fix: b","files":["b.ts"]}]}',
    ].join("\n");
    const result = parseCommitResponse(raw);
    expect(result.type).toBe("plan");
    if (result.type === "plan") {
      expect(result.commits.map((c) => c.message)).toEqual(["feat: a", "fix: b"]);
    }
  });

  it("strategy 3: picks the first valid JSON when two separate single objects are emitted with prose between them", () => {
    const raw = [
      "First, the feature change:",
      '{"type":"single","message":"feat: add login"}',
      "Then the unrelated fix:",
      '{"type":"single","message":"fix: typo"}',
    ].join("\n");
    const result = parseCommitResponse(raw);
    expect(result.type).toBe("single");
    if (result.type === "single") {
      expect(result.message).toBe("feat: add login");
    }
  });

  it("strategy 3: ignores braces embedded inside JSON string values when scanning", () => {
    const raw =
      'Preface text { with a stray brace.\n{"type":"single","message":"fix: handle } and { in input"}\nTrailer.';
    const result = parseCommitResponse(raw);
    expect(result.type).toBe("single");
    if (result.type === "single") {
      expect(result.message).toBe("fix: handle } and { in input");
    }
  });

  it("strategy 3: skips malformed JSON-like prefixes and recovers a later valid object", () => {
    const raw = [
      "Draft (ignore this, broken):",
      '{"type":"plan", "commits": [',
      "Actually, use this instead:",
      '{"type":"single","message":"chore: bump deps"}',
    ].join("\n");
    const result = parseCommitResponse(raw);
    expect(result.type).toBe("single");
    if (result.type === "single") {
      expect(result.message).toBe("chore: bump deps");
    }
  });

  it("strategy 2: still extracts JSON from a fenced ```json block", () => {
    const raw = [
      "Reasoning blurb...",
      "```json",
      '{"type":"plan","commits":[{"message":"feat: x","files":["x.ts"]},{"message":"feat: y","files":["y.ts"]}]}',
      "```",
      "End.",
    ].join("\n");
    const result = parseCommitResponse(raw);
    expect(result.type).toBe("plan");
    if (result.type === "plan") {
      expect(result.commits).toHaveLength(2);
    }
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

  it("SENSITIVE_FILE_STAGED error message omits filenames but exposes them on .files", async () => {
    const mock = new MockLLMProvider();

    const leakyName = "prod-customer-db-credentials.json";
    await writeFile(join(tempDir, leakyName), "{}");
    await exec("git", ["add", leakyName], { cwd: tempDir });

    const err = await commit({ cwd: tempDir, provider: mock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const e = err as Error & { code?: string; files?: string[] };
    expect(e.code).toBe("SENSITIVE_FILE_STAGED");
    expect(e.message).not.toContain(leakyName);
    expect(e.message).toContain("1 file(s)");
    expect(e.files).toEqual([leakyName]);
    mock.assertCallCount(0);
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

  it("single-commit plan with a staged deletion commits without re-adding the deleted path", async () => {
    await writeFile(join(tempDir, "doomed.md"), "to be removed");
    await exec("git", ["add", "doomed.md"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "add doomed"], { cwd: tempDir });
    await exec("git", ["rm", "doomed.md"], { cwd: tempDir });

    const plan = {
      kind: "single" as const,
      commits: [{ message: "chore: drop doomed", files: ["doomed.md"] }],
      tokens: { input: 0, output: 0 },
    };

    await expect(applyCommitPlan(plan, { cwd: tempDir })).resolves.toBeUndefined();

    const log = await exec("git", ["log", "--oneline", "-2"], { cwd: tempDir });
    expect(log.stdout).toContain("chore: drop doomed");
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
