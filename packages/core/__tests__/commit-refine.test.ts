import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { commit } from "../src/commands/commit.js";
import { MockLLMProvider } from "../src/testing/mock-llm-provider.js";

const exec = promisify(execFile);

async function initRepo(dir: string): Promise<void> {
  await exec("git", ["init"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await exec("git", ["commit", "--allow-empty", "-m", "initial commit", "--no-gpg-sign"], { cwd: dir });
}

async function stageChange(dir: string): Promise<void> {
  await writeFile(join(dir, "foo.ts"), "const x = 1;\n");
  await exec("git", ["add", "foo.ts"], { cwd: dir });
}

describe("commit() with generateAlternatives", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-refine-"));
    await initRepo(tempDir);
    await stageChange(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns CommitAlternatives when LLM responds with alternatives JSON", async () => {
    const provider = new MockLLMProvider();
    provider.queueByIndex({
      content: JSON.stringify({
        type: "alternatives",
        options: ["feat(a): one", "feat(b): two", "fix(c): three"],
      }),
    });

    const result = await commit({ cwd: tempDir, provider, generateAlternatives: true });

    expect(result.kind).toBe("alternatives");
    if (result.kind === "alternatives") {
      expect(result.options).toHaveLength(3);
      expect(result.options[0]).toBe("feat(a): one");
    }
  });

  it("falls back to a single option when LLM ignores alternatives instruction", async () => {
    const provider = new MockLLMProvider();
    provider.queueByIndex({
      content: JSON.stringify({ type: "single", message: "fix: something" }),
    });

    const result = await commit({ cwd: tempDir, provider, generateAlternatives: true });

    expect(result.kind).toBe("alternatives");
    if (result.kind === "alternatives") {
      expect(result.options).toHaveLength(1);
      expect(result.options[0]).toBe("fix: something");
    }
  });
});

describe("commit() with feedbackHint", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-feedback-"));
    await initRepo(tempDir);
    await stageChange(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("includes feedbackHint in the user message sent to the provider", async () => {
    const provider = new MockLLMProvider();
    provider.queueByIndex({
      content: JSON.stringify({ type: "single", message: "fix: correct thing" }),
    });

    await commit({ cwd: tempDir, provider, feedbackHint: "make it more concise" });

    const calls = provider.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.userMessage).toContain("User feedback on previous suggestion: make it more concise");
  });
});
