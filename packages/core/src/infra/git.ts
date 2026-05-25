import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { debug } from "./logger.js";
import { EXIT_CODES, GitwiseError } from "../errors.js";

const exec = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024;

interface ExecResult {
  stdout: string;
  stderr: string;
}

function execStderr(err: unknown): string | undefined {
  const stderr = (err as { stderr?: unknown } | null)?.stderr;
  if (typeof stderr === "string" && stderr.length > 0) return stderr;
  return undefined;
}

async function run(args: string[], cwd: string): Promise<string> {
  debug("git command", { args, cwd });
  try {
    const result: ExecResult = await exec("git", args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER });
    return result.stdout.trim();
  } catch (err: unknown) {
    if (err instanceof Error && "killed" in err && (err as { killed: boolean }).killed) {
      throw new GitwiseError({
        code: "GIT_FAILED",
        message: `Git command timed out after ${GIT_TIMEOUT_MS / 1000}s: git ${args.join(" ")}`,
        cause: err,
        details: { command: `git ${args.join(" ")}`, timedOut: true },
      });
    }
    const stderr = execStderr(err);
    throw new GitwiseError({
      code: "GIT_FAILED",
      message: err instanceof Error ? err.message : String(err),
      cause: err,
      details: {
        command: `git ${args.join(" ")}`,
        ...(stderr !== undefined ? { stderr } : {}),
      },
    });
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

export async function checkoutForce(
  cwd: string,
  branchName: string,
): Promise<void> {
  await run(["checkout", "-f", branchName], cwd);
}

export async function resetHard(cwd: string, ref: string): Promise<void> {
  await run(["reset", "--hard", ref], cwd);
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
      throw new GitwiseError({
        code: "GIT_FAILED",
        message: `Git command timed out after ${GIT_TIMEOUT_MS / 1000}s: git status --porcelain`,
        cause: err,
        details: { command: "git status --porcelain", timedOut: true },
      });
    }
    const stderr = execStderr(err);
    throw new GitwiseError({
      code: "GIT_FAILED",
      message: err instanceof Error ? err.message : String(err),
      cause: err,
      details: {
        command: "git status --porcelain",
        ...(stderr !== undefined ? { stderr } : {}),
      },
    });
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
    const stderr = execStderr(err);
    throw new GitwiseError({
      code: "GIT_FAILED",
      message: `Failed to read git status: ${err instanceof Error ? err.message : String(err)}`,
      cause: err,
      details: {
        command: "git status --porcelain",
        ...(stderr !== undefined ? { stderr } : {}),
      },
    });
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
  options?: { signed?: boolean },
): Promise<void> {
  const flag = options?.signed === true ? "-s" : "-a";
  await run(["tag", flag, tag, "-m", message], cwd);
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

export async function resetSoft(cwd: string, ref: string): Promise<void> {
  await run(["reset", "--soft", ref], cwd);
}

export async function stashPushNamed(cwd: string, message: string): Promise<void> {
  await run(["stash", "push", "--include-untracked", "-m", message], cwd);
}

export async function stashList(cwd: string): Promise<string> {
  return run(["stash", "list"], cwd);
}

async function findStashRef(cwd: string, stashName: string): Promise<string> {
  const list = await stashList(cwd);
  const line = list.split("\n").find((l) => l.includes(stashName));
  if (!line) {
    throw new GitwiseError({
      code: "GIT_FAILED",
      message: `Named stash not found in stash list: ${stashName}`,
      details: { stashName },
    });
  }
  const match = /^(stash@\{\d+\})/.exec(line);
  if (!match?.[1]) {
    throw new GitwiseError({
      code: "GIT_FAILED",
      message: `Cannot parse stash ref from stash list line: ${line}`,
      details: { stashName, line },
    });
  }
  return match[1];
}

export async function stashApplyNamed(cwd: string, stashName: string): Promise<void> {
  const ref = await findStashRef(cwd, stashName);
  // Do not use --index: stashes created with --include-untracked are incompatible
  // with --index restoration for newly-staged (never committed) files.
  await run(["stash", "apply", ref], cwd);
}

export async function stashPopNamed(cwd: string, stashName: string): Promise<void> {
  const ref = await findStashRef(cwd, stashName);
  await run(["stash", "pop", ref], cwd);
}

export async function stashDropNamed(cwd: string, stashName: string): Promise<void> {
  const ref = await findStashRef(cwd, stashName);
  await run(["stash", "drop", ref], cwd);
}

/**
 * Force-remove all untracked files and directories from the working tree.
 * Used before stash pop in compensate paths to avoid "would be overwritten"
 * conflicts from files that were left untracked after reset --hard.
 */
export async function cleanForced(cwd: string): Promise<void> {
  await run(["clean", "-fd"], cwd);
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
  throw new GitwiseError({
    code: "NO_BASE_BRANCH",
    message: "No base branch found: neither main nor master exists",
    exitCode: EXIT_CODES.REPO_STATE_INVALID,
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
    const stderr = execStderr(err);
    throw new GitwiseError({
      code: "COMMIT_HOOK_FAILURE",
      message: `Git commit failed: ${msg}`,
      exitCode: EXIT_CODES.GIT_FAILED,
      cause: err,
      details: stderr !== undefined ? { stderr } : undefined,
    });
  }
}
