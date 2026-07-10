/**
 * Regression test — split-commit must actually commit MODIFIED tracked files.
 *
 * Real-world failure: `gw commit --push` on a repo whose staged changes are all
 * modifications to already-committed files produced ZERO commits (and therefore
 * pushed nothing) while still printing "Committed successfully!".
 *
 * Root cause: applyCommitPlan's split path captured the "staged tree" via
 * `git write-tree` AFTER `takeNamedStashStep` ran `git stash apply` without
 * `--index`. For modified tracked files that restores the change to the working
 * tree only, leaving the index equal to HEAD — so the captured tree was HEAD's
 * tree. Every per-group `git reset <tree> -- <path>` then staged HEAD's version
 * (a no-op), so every group was skipped as "no staged changes" and no commit
 * was made.
 *
 * The existing vanished-file test used brand-new files and did not exercise this
 * path, so the regression went undetected.
 *
 * Fix: capture the staged tree BEFORE stashing, while the index still holds the
 * fully-staged state.
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
  await writeFile(join(dir, "a.md"), "# A\noriginal a\n");
  await writeFile(join(dir, "b.md"), "# B\noriginal b\n");
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "initial commit"], { cwd: dir });
}

describe("applyCommitPlan split — modifications to already-committed files", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-split-modified-"));
    await initRepo(cwd);
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("creates one commit per group when every staged file is a modified tracked file", async () => {
    // Modify both already-committed files and stage the changes.
    await writeFile(join(cwd, "a.md"), "# A\noriginal a\nmodified a\n");
    await writeFile(join(cwd, "b.md"), "# B\noriginal b\nmodified b\n");
    await exec("git", ["add", "a.md", "b.md"], { cwd });

    const { stdout: baseHead } = await exec("git", ["rev-parse", "HEAD"], { cwd });

    const plan = {
      kind: "split" as const,
      commits: [
        { message: "docs(a): update a", files: ["a.md"] },
        { message: "docs(b): update b", files: ["b.md"] },
      ],
      tokens: { input: 0, output: 0 },
    };

    await expect(applyCommitPlan(plan, { cwd })).resolves.toBeUndefined();

    // Both groups must have produced real commits.
    const { stdout: log } = await exec("git", ["log", "--oneline"], { cwd });
    expect(log).toContain("docs(a): update a");
    expect(log).toContain("docs(b): update b");

    // HEAD advanced by exactly two commits, not zero.
    const { stdout: newHead } = await exec("git", ["rev-parse", "HEAD"], { cwd });
    expect(newHead.trim()).not.toBe(baseHead.trim());
    const { stdout: count } = await exec(
      "git",
      ["rev-list", "--count", `${baseHead.trim()}..HEAD`],
      { cwd },
    );
    expect(count.trim()).toBe("2");

    // The committed content reflects the modifications.
    const { stdout: aAtHead } = await exec("git", ["show", "HEAD:a.md"], { cwd });
    expect(aAtHead).toContain("modified a");
    const { stdout: bAtHead } = await exec("git", ["show", "HEAD:b.md"], { cwd });
    expect(bAtHead).toContain("modified b");

    // Nothing left dangling in the index or working tree.
    const { stdout: status } = await exec("git", ["status", "--porcelain"], { cwd });
    expect(status.trim()).toBe("");
  });
});
