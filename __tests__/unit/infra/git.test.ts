import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as git from "../../../src/infra/git.js";

const exec = promisify(execFile);

describe("GitClient", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "devflow-git-"));
    await exec("git", ["init"], { cwd: tempDir });
    await exec("git", ["config", "user.email", "test@test.com"], { cwd: tempDir });
    await exec("git", ["config", "user.name", "Test"], { cwd: tempDir });
    await writeFile(join(tempDir, "README.md"), "# Test");
    await exec("git", ["add", "."], { cwd: tempDir });
    await exec("git", ["commit", "-m", "initial commit"], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should get current branch", async () => {
    const branch = await git.getBranch(tempDir);
    expect(["main", "master"]).toContain(branch);
  });

  it("should create and checkout a branch", async () => {
    await git.createBranch(tempDir, "feature/test");
    const branch = await git.getBranch(tempDir);
    expect(branch).toBe("feature/test");
  });

  it("should get status of working directory", async () => {
    await writeFile(join(tempDir, "new-file.txt"), "content");
    const result = await git.status(tempDir);
    expect(result).toContain("new-file.txt");
  });

  it("should add and commit files", async () => {
    await writeFile(join(tempDir, "feature.ts"), "export const x = 1;");
    await git.add(tempDir, ["feature.ts"]);
    const diff = await git.getStagedDiff(tempDir);
    expect(diff).toContain("feature.ts");
    await git.commit(tempDir, "feat: add feature");
    const log = await git.getLog(tempDir, undefined, 1);
    expect(log).toContain("feat: add feature");
  });

  it("should get diff between branches", async () => {
    const baseBranch = await git.getBranch(tempDir);
    await git.createBranch(tempDir, "feature/diff-test");
    await writeFile(join(tempDir, "diff-file.ts"), "const y = 2;");
    await git.add(tempDir, ["diff-file.ts"]);
    await git.commit(tempDir, "feat: add diff file");
    const diff = await git.getDiff(tempDir, baseBranch);
    expect(diff).toContain("diff-file.ts");
  });

  it("should get log with max count", async () => {
    await writeFile(join(tempDir, "a.txt"), "a");
    await git.add(tempDir, ["a.txt"]);
    await git.commit(tempDir, "add a");
    await writeFile(join(tempDir, "b.txt"), "b");
    await git.add(tempDir, ["b.txt"]);
    await git.commit(tempDir, "add b");
    const log = await git.getLog(tempDir, undefined, 1);
    const lines = log.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("add b");
  });

  it("should create branch with startPoint", async () => {
    await writeFile(join(tempDir, "file.txt"), "content");
    await git.add(tempDir, ["file.txt"]);
    await git.commit(tempDir, "add file");
    const baseBranch = await git.getBranch(tempDir);
    await git.createBranch(tempDir, "feature/from-start", baseBranch);
    const branch = await git.getBranch(tempDir);
    expect(branch).toBe("feature/from-start");
  });

  it("should get unstaged diff without base", async () => {
    await writeFile(join(tempDir, "README.md"), "# Updated");
    const diff = await git.getDiff(tempDir);
    expect(diff).toContain("Updated");
  });

  it("should get log with range", async () => {
    const baseBranch = await git.getBranch(tempDir);
    await git.createBranch(tempDir, "feature/log-range");
    await writeFile(join(tempDir, "range.txt"), "range");
    await git.add(tempDir, ["range.txt"]);
    await git.commit(tempDir, "add range file");
    const log = await git.getLog(tempDir, `${baseBranch}..HEAD`);
    expect(log).toContain("add range file");
  });

  it("should checkout existing branch", async () => {
    await git.createBranch(tempDir, "feature/checkout-test");
    const baseBranch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD@{1}"], { cwd: tempDir }).catch(() => ({ stdout: "main" }))).stdout.trim() || "main";
    await git.checkout(tempDir, "feature/checkout-test");
    const branch = await git.getBranch(tempDir);
    expect(branch).toBe("feature/checkout-test");
  });

  it("should push to remote", async () => {
    // Create a bare remote repo
    const remoteDir = await mkdtemp(join(tmpdir(), "devflow-remote-"));
    await exec("git", ["init", "--bare"], { cwd: remoteDir });
    await exec("git", ["remote", "add", "origin", remoteDir], { cwd: tempDir });
    await git.push(tempDir, "origin", await git.getBranch(tempDir));
    // Verify by fetching
    const result = await exec("git", ["ls-remote", "origin"], { cwd: tempDir });
    expect(result.stdout).toContain("refs/heads/");
    await rm(remoteDir, { recursive: true, force: true });
  });

  it("should return empty array for getChangedFiles on clean repo", async () => {
    const files = await git.getChangedFiles(tempDir);
    expect(files).toEqual([]);
  });

  it("should return changed files from getChangedFiles", async () => {
    await writeFile(join(tempDir, "new.txt"), "new content");
    await writeFile(join(tempDir, "another.txt"), "another");
    const files = await git.getChangedFiles(tempDir);
    expect(files).toContain("new.txt");
    expect(files).toContain("another.txt");
  });

  it("should fetch from remote", async () => {
    const remoteDir = await mkdtemp(join(tmpdir(), "devflow-remote-"));
    await exec("git", ["init", "--bare"], { cwd: remoteDir });
    await exec("git", ["remote", "add", "origin", remoteDir], { cwd: tempDir });
    await git.push(tempDir, "origin", await git.getBranch(tempDir));
    await expect(git.fetch(tempDir, "origin")).resolves.not.toThrow();
    await rm(remoteDir, { recursive: true, force: true });
  });

  it("should detect unstaged modified files", async () => {
    await writeFile(join(tempDir, "README.md"), "# Updated content");
    const unstaged = await git.getUnstagedFiles(tempDir);
    expect(unstaged.length).toBe(1);
    expect(unstaged[0]!.file).toBe("README.md");
    expect(unstaged[0]!.workTreeStatus).toBe("M");
  });

  it("should detect untracked files as unstaged", async () => {
    await writeFile(join(tempDir, "newfile.txt"), "new content");
    const unstaged = await git.getUnstagedFiles(tempDir);
    expect(unstaged.length).toBe(1);
    expect(unstaged[0]!.file).toBe("newfile.txt");
    expect(unstaged[0]!.indexStatus).toBe("?");
  });

  it("should return empty unstaged for clean tree", async () => {
    const unstaged = await git.getUnstagedFiles(tempDir);
    expect(unstaged).toEqual([]);
  });

  it("should handle renamed files in parseStatus", async () => {
    await writeFile(join(tempDir, "original.txt"), "content");
    await exec("git", ["add", "original.txt"], { cwd: tempDir });
    await exec("git", ["commit", "-m", "add original"], { cwd: tempDir });
    await exec("git", ["mv", "original.txt", "renamed.txt"], { cwd: tempDir });
    const files = await git.parseStatus(tempDir);
    const renamed = files.find((f) => f.indexStatus === "R");
    expect(renamed).toBeDefined();
    expect(renamed!.file).toBe("renamed.txt");
  });

  it("should detect staged files separately from unstaged", async () => {
    await writeFile(join(tempDir, "staged.txt"), "staged");
    await exec("git", ["add", "staged.txt"], { cwd: tempDir });
    await writeFile(join(tempDir, "unstaged.txt"), "unstaged");
    const staged = await git.getStagedFiles(tempDir);
    const unstaged = await git.getUnstagedFiles(tempDir);
    expect(staged.some((f) => f.file === "staged.txt")).toBe(true);
    expect(unstaged.some((f) => f.file === "unstaged.txt")).toBe(true);
    expect(unstaged.some((f) => f.file === "staged.txt")).toBe(false);
  });
});
