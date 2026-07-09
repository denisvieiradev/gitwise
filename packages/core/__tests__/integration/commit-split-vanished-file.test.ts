/**
 * Regression test — split-commit staging must not consult the working tree.
 *
 * Repro of the real "pathspec did not match any files" failure: a commit
 * group's file list contains a path that is neither staged nor present in the
 * working tree — e.g. a transient `whisper.log` a tool referenced but never
 * actually staged (or that vanished before the commit ran). The split path
 * stashes, unstages everything, then re-stages each group; doing that with
 * `git add <paths>` aborts the whole commit on the phantom path (exit 128).
 * The stash round-trip can restore staged-then-deleted files, but it cannot
 * conjure a path that was never staged — so `git add` fails.
 *
 * Fix: re-stage each group from the captured staged tree via the index
 * (`git reset <tree> -- <paths>`), which never reads the worktree. Real files
 * commit; a planned-but-unstaged path is a harmless no-op.
 *
 * See systematic-debugging session + the single-commit note in commit.ts.
 */
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applyCommitPlan } from "../../src/commands/commit.js";

const exec = promisify(execFile);

async function initRepo(dir: string): Promise<void> {
  await exec("git", ["init", "-b", "main"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# Test\n");
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "initial commit"], { cwd: dir });
}

describe("applyCommitPlan split — planned path not staged / absent from worktree", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-split-phantom-"));
    await initRepo(cwd);
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("commits a group's real files while ignoring a planned path that was never staged", async () => {
    // a.ts and b.ts are staged; whisper.log is referenced by the plan but was
    // never staged and does not exist in the worktree.
    await writeFile(join(cwd, "a.ts"), "const a = 1;\n");
    await writeFile(join(cwd, "b.ts"), "const b = 2;\n");
    await exec("git", ["add", "a.ts", "b.ts"], { cwd });

    const plan = {
      kind: "split" as const,
      commits: [
        { message: "feat: add a", files: ["a.ts"] },
        { message: "feat: add b", files: ["b.ts", "whisper.log"] },
      ],
      tokens: { input: 0, output: 0 },
    };

    await expect(applyCommitPlan(plan, { cwd })).resolves.toBeUndefined();

    const { stdout: log } = await exec("git", ["log", "--oneline"], { cwd });
    expect(log).toContain("feat: add a");
    expect(log).toContain("feat: add b");

    const { stdout: tree } = await exec(
      "git",
      ["ls-tree", "-r", "--name-only", "HEAD"],
      { cwd },
    );
    expect(tree).toContain("a.ts");
    expect(tree).toContain("b.ts");
    expect(tree).not.toContain("whisper.log");
  });

  it("skips a group whose files are all unstaged phantoms instead of failing to commit", async () => {
    await writeFile(join(cwd, "a.ts"), "const a = 1;\n");
    await exec("git", ["add", "a.ts"], { cwd });

    const plan = {
      kind: "split" as const,
      commits: [
        { message: "feat: add a", files: ["a.ts"] },
        { message: "chore: phantom", files: ["whisper.log"] },
      ],
      tokens: { input: 0, output: 0 },
    };

    await expect(applyCommitPlan(plan, { cwd })).resolves.toBeUndefined();

    const { stdout: log } = await exec("git", ["log", "--oneline"], { cwd });
    expect(log).toContain("feat: add a");
    // The phantom-only group produced no commit.
    expect(log).not.toContain("chore: phantom");
  });
});
