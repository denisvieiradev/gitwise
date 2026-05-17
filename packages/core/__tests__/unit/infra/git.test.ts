import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as git from "../../../src/infra/git.js";

const exec = promisify(execFile);

describe("git infra (core)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-core-git-"));
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

  describe("detectBaseBranch", () => {
    it("returns 'main' when main branch exists", async () => {
      const branch = await git.getBranch(tempDir);
      // Rename to main if not already
      if (branch !== "main") {
        await exec("git", ["branch", "-m", branch, "main"], { cwd: tempDir });
      }
      const base = await git.detectBaseBranch(tempDir);
      expect(base).toBe("main");
    });

    it("falls back to 'master' when only master exists", async () => {
      const branch = await git.getBranch(tempDir);
      if (branch !== "master") {
        await exec("git", ["branch", "-m", branch, "master"], { cwd: tempDir });
      }
      const base = await git.detectBaseBranch(tempDir);
      expect(base).toBe("master");
    });

    it("throws NO_BASE_BRANCH when neither main nor master exists", async () => {
      const branch = await git.getBranch(tempDir);
      // Rename to something else
      await exec("git", ["branch", "-m", branch, "trunk"], { cwd: tempDir });
      await expect(git.detectBaseBranch(tempDir)).rejects.toMatchObject({
        code: "NO_BASE_BRANCH",
      });
    });
  });

  describe("getStagedDiff", () => {
    it("returns staged diff for a staged file", async () => {
      await writeFile(join(tempDir, "feature.ts"), "export const x = 1;");
      await git.add(tempDir, ["feature.ts"]);
      const diff = await git.getStagedDiff(tempDir);
      expect(diff).toContain("feature.ts");
      expect(diff).toContain("+export const x = 1;");
    });

    it("returns empty string when nothing is staged", async () => {
      const diff = await git.getStagedDiff(tempDir);
      expect(diff).toBe("");
    });
  });

  describe("applyCommit", () => {
    it("stages files and creates a commit visible in git log", async () => {
      await writeFile(join(tempDir, "newfile.ts"), "const y = 2;");
      await git.applyCommit({ message: "feat: new file", files: ["newfile.ts"], cwd: tempDir });
      const log = await git.getLog(tempDir, undefined, 1);
      expect(log).toContain("feat: new file");
    });

    it("surfaces a typed COMMIT_HOOK_FAILURE error when nothing to commit", async () => {
      // With nothing staged, git commit will fail → should get COMMIT_HOOK_FAILURE code
      await expect(
        git.applyCommit({ message: "fail commit", files: [], cwd: tempDir })
      ).rejects.toMatchObject({ code: "COMMIT_HOOK_FAILURE" });
    });
  });

  describe("getBranch", () => {
    it("should get current branch", async () => {
      const branch = await git.getBranch(tempDir);
      expect(["main", "master"]).toContain(branch);
    });
  });

  describe("getStagedFiles / getUnstagedFiles", () => {
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

  describe("integration: applyCommit in temp repo", () => {
    it("produces a commit visible in git log", async () => {
      await writeFile(join(tempDir, "integration.ts"), "export const z = 3;");
      await git.applyCommit({ message: "chore: integration test", files: ["integration.ts"], cwd: tempDir });
      const log = await git.getLog(tempDir, undefined, 1);
      expect(log).toContain("chore: integration test");
    });
  });
});
