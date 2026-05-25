import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MockLLMProvider } from "../../src/testing/mock-llm-provider.js";
import { commit, prepareRelease } from "../../src/index.js";
import { GitwiseError } from "../../src/errors.js";

const exec = promisify(execFile);

async function initRepoOnMain(dir: string): Promise<void> {
  await exec("git", ["init", "-b", "main"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "err-mig-pkg", version: "1.0.0" }, null, 2),
  );
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "chore: initial"], { cwd: dir });
}

describe("error migration — end-to-end typed errors", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-err-mig-"));
    await initRepoOnMain(cwd);
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("commit() with no staged changes surfaces GitwiseError code NOTHING_STAGED to the caller", async () => {
    const mock = new MockLLMProvider();
    const err = await commit({ cwd, provider: mock }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GitwiseError);
    const ge = err as GitwiseError;
    expect(ge.code).toBe("NOTHING_STAGED");
    expect(ge.exitCode).toBe(10);
    expect(mock.getCallCount()).toBe(0);
  });

  it("prepareRelease() refuses an in-flight plan with GitwiseError code RELEASE_PLAN_EXISTS", async () => {
    const planMock = (): MockLLMProvider => {
      const mock = new MockLLMProvider();
      mock.queueByIndex({
        content: JSON.stringify({ suggestion: "patch", reasoning: "fix" }),
        tokens: { input: 10, output: 5 },
      });
      mock.queueByIndex({ content: "### Fixed\n- thing", tokens: { input: 10, output: 5 } });
      mock.queueByIndex({ content: "## Release notes", tokens: { input: 10, output: 5 } });
      return mock;
    };

    // First prepare succeeds → plan file present on disk.
    await prepareRelease({ cwd, provider: planMock(), strategy: "github-flow" });

    // Second prepare must refuse because a plan already exists.
    const err = await prepareRelease({
      cwd,
      provider: planMock(),
      strategy: "github-flow",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GitwiseError);
    const ge = err as GitwiseError;
    expect(ge.code).toBe("RELEASE_PLAN_EXISTS");
    expect(ge.exitCode).toBe(61);
  });
});
