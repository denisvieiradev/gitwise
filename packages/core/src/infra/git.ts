import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { debug } from "./logger.js";

const exec = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024;

interface ExecResult {
  stdout: string;
  stderr: string;
}

async function run(args: string[], cwd: string): Promise<string> {
  debug("git command", { args, cwd });
  try {
    const result: ExecResult = await exec("git", args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER });
    return result.stdout.trim();
  } catch (err: unknown) {
    if (err instanceof Error && "killed" in err && (err as { killed: boolean }).killed) {
      throw new Error(`Git command timed out after ${GIT_TIMEOUT_MS / 1000}s: git ${args.join(" ")}`);
    }
    throw err;
  }
}

export async function getBranch(cwd: string): Promise<string> {
  return run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

export async function createBranch(
  cwd: string,
  branchName: string,
  startPoint?: string,
): Promise<void> {
  const args = ["checkout", "-b", branchName];
  if (startPoint) args.push(startPoint);
  await run(args, cwd);
}

export async function checkout(cwd: string, branchName: string): Promise<void> {
  await run(["checkout", branchName], cwd);
}

export async function getDiff(cwd: string, base?: string): Promise<string> {
  const args = base ? ["diff", `${base}...HEAD`] : ["diff"];
  return run(args, cwd);
}

export async function getStagedDiff(cwd: string): Promise<string> {
  return run(["diff", "--cached"], cwd);
}

export async function getLog(
  cwd: string,
  range?: string,
  maxCount?: number,
): Promise<string> {
  const args = ["log", "--oneline"];
  if (maxCount) args.push(`-${maxCount}`);
  if (range) args.push(range);
  return run(args, cwd);
}

export async function add(cwd: string, files: string[]): Promise<void> {
  await run(["add", ...files], cwd);
}

export async function commit(cwd: string, message: string): Promise<string> {
  return run(["commit", "-m", message], cwd);
}

export async function status(cwd: string): Promise<string> {
  // Bypass `run()`'s `stdout.trim()` because porcelain status lines start with
  // a leading space when the file is unstaged-modified (e.g. " M .gitignore").
  // Trimming the outer whitespace strips that space and downstream parsers
  // that rely on the fixed 3-char `XY ` prefix would misread the path.
  debug("git command", { args: ["status", "--porcelain"], cwd });
  try {
    const result: ExecResult = await exec(
      "git",
      ["status", "--porcelain"],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
    );
    return result.stdout.replace(/\n+$/, "");
  } catch (err: unknown) {
    if (err instanceof Error && "killed" in err && (err as { killed: boolean }).killed) {
      throw new Error(`Git command timed out after ${GIT_TIMEOUT_MS / 1000}s: git status --porcelain`);
    }
    throw err;
  }
}

export async function push(
  cwd: string,
  remote: string,
  branch: string,
): Promise<void> {
  await run(["push", remote, branch], cwd);
}

export async function fetch(cwd: string, remote: string): Promise<void> {
  await run(["fetch", remote], cwd);
}

export async function getChangedFiles(cwd: string): Promise<string[]> {
  const files = await parseStatus(cwd);
  return files.map((f) => f.file);
}

export interface ChangedFile {
  file: string;
  indexStatus: string;
  workTreeStatus: string;
}

export async function parseStatus(cwd: string): Promise<ChangedFile[]> {
  let result: { stdout: string };
  try {
    result = await exec("git", ["status", "--porcelain"], { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER });
  } catch (err) {
    throw new Error(
      `Failed to read git status: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Use raw stdout (no trim) — leading spaces in porcelain format are meaningful
  const output = result.stdout;
  if (!output || !output.trim()) return [];
  return output
    .split("\n")
    .filter((line) => line.length >= 3)
    .map((line) => {
      const indexStatus = line[0] as string;
      const workTreeStatus = line[1] as string;
      let file = line.slice(3).trim();
      // Handle renamed/copied files: "R  old -> new" or "C  old -> new"
      if (
        (indexStatus === "R" || indexStatus === "C") &&
        file.includes(" -> ")
      ) {
        file = file.split(" -> ").pop()!;
      }
      return { file, indexStatus, workTreeStatus };
    })
    .filter((entry) => entry.file.length > 0);
}

export async function getStagedFiles(cwd: string): Promise<ChangedFile[]> {
  const files = await parseStatus(cwd);
  return files.filter((f) => f.indexStatus !== " " && f.indexStatus !== "?");
}

export async function resetStaged(cwd: string): Promise<void> {
  await run(["reset", "HEAD"], cwd);
}

export async function getStagedFilesList(cwd: string): Promise<string[]> {
  const output = await run(["diff", "--cached", "--name-only"], cwd);
  if (!output) return [];
  return output.split("\n").filter((f) => f.length > 0);
}

export async function getUnstagedFiles(cwd: string): Promise<ChangedFile[]> {
  const files = await parseStatus(cwd);
  return files.filter(
    (f) =>
      (f.indexStatus === "?" && f.workTreeStatus === "?") ||
      f.workTreeStatus !== " ",
  );
}

export async function getLatestTag(cwd: string): Promise<string | null> {
  try {
    return await run(["describe", "--tags", "--abbrev=0"], cwd);
  } catch {
    return null;
  }
}

export async function createTag(
  cwd: string,
  tag: string,
  message: string,
): Promise<void> {
  await run(["tag", "-a", tag, "-m", message], cwd);
}

export async function tagExists(cwd: string, tag: string): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

export async function pushWithTags(
  cwd: string,
  remote: string,
  branch: string,
): Promise<void> {
  await run(["push", remote, branch, "--follow-tags"], cwd);
}

export async function mergeNoFf(cwd: string, source: string): Promise<void> {
  await run(["merge", "--no-ff", source], cwd);
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await exec(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
    );
    return true;
  } catch {
    return false;
  }
}

export async function headSha(cwd: string): Promise<string> {
  return run(["rev-parse", "HEAD"], cwd);
}

/**
 * Read a file's contents at `HEAD` via `git show HEAD:<path>`. Returns `null`
 * when the path does not exist in the HEAD tree (so callers can distinguish
 * "missing in HEAD" from "exists but empty"). Bypasses the helper `run()` to
 * preserve trailing newlines, which the working-tree validators compare
 * byte-for-byte.
 */
export async function showFileAtHead(
  cwd: string,
  path: string,
): Promise<string | null> {
  debug("git command", { args: ["show", `HEAD:${path}`], cwd });
  try {
    const result: ExecResult = await exec("git", ["show", `HEAD:${path}`], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
    });
    return result.stdout;
  } catch {
    return null;
  }
}

export async function deleteBranch(
  cwd: string,
  branch: string,
  force = false,
): Promise<void> {
  await run(["branch", force ? "-D" : "-d", branch], cwd);
}

/**
 * Is `branch` fully reachable from `target`? Resolves to true when every commit
 * on `branch` is already in `target` (i.e., the merge would be a no-op). Used
 * by abortRelease to refuse deleting a release branch that still has commits
 * not present in main/develop.
 */
export async function isBranchMerged(
  cwd: string,
  branch: string,
  target: string,
): Promise<boolean> {
  try {
    await exec(
      "git",
      ["merge-base", "--is-ancestor", branch, target],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the base branch of the repository (main or master).
 * Returns 'main' if both exist, falls back to 'master', throws if neither exists.
 */
export async function detectBaseBranch(cwd: string): Promise<string> {
  try {
    await exec("git", ["rev-parse", "--verify", "main"], { cwd, timeout: GIT_TIMEOUT_MS });
    return "main";
  } catch {
    // main doesn't exist, try master
  }
  try {
    await exec("git", ["rev-parse", "--verify", "master"], { cwd, timeout: GIT_TIMEOUT_MS });
    return "master";
  } catch {
    // master doesn't exist either
  }
  throw Object.assign(new Error("No base branch found: neither main nor master exists"), {
    code: "NO_BASE_BRANCH",
  });
}

export interface ApplyCommitParams {
  message: string;
  files: string[];
  cwd: string;
}

/**
 * Stage the given files and create a commit.
 * Throws a typed error on hook failure or other git errors.
 */
export async function applyCommit(params: ApplyCommitParams): Promise<void> {
  const { message, files, cwd } = params;
  try {
    if (files.length > 0) {
      await add(cwd, files);
    }
    await commit(cwd, message);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(
      new Error(`Git commit failed: ${msg}`),
      { code: "COMMIT_HOOK_FAILURE", cause: err },
    );
  }
}
