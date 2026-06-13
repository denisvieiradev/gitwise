import * as git from "../infra/git.js";
import { loadTemplate } from "../template/loader.js";
import type { LLMProvider } from "../providers/types.js";
import { resolveModelTier } from "../providers/model-router.js";
import { debug, warn as logWarn } from "../infra/logger.js";
import { EXIT_CODES, GitwiseError } from "../errors.js";
import { Transaction, type Logger, type Step } from "../infra/transaction.js";
import { acquireRepoLock } from "../infra/lockfile.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CommitEntry {
  message: string;
  description?: string;
  files: string[];
}

export interface CommitPlan {
  kind: "single" | "split";
  commits: CommitEntry[];
  tokens: { input: number; output: number };
}

export type SplitMode = "auto" | "never" | "always";

export interface CommitOptions {
  cwd: string;
  provider: LLMProvider;
  prompt?: string;
  split?: SplitMode;
  push?: boolean;
  commitConvention?: string;
  templatesPath?: string;
  repoRoot?: string;
  feedbackHint?: string;
  generateAlternatives?: boolean;
}

export interface CommitAlternatives {
  kind: "alternatives";
  options: string[];
  tokens: { input: number; output: number };
}

export interface ApplyCommitPlanOptions {
  push?: boolean;
  remote?: string;
}

// ─── Sensitive file detection ────────────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  /^\.env$/,
  /^\.env\./,
  /\.pem$/,
  /\.key$/,
  /^id_rsa/,
  /^id_dsa/,
  /^id_ecdsa/,
  /^id_ed25519/,
  /credentials\.json$/,
  /secrets\.json$/,
  /auth\.json$/,
  /service-account\.json$/,
  /\.p12$/,
  /\.pfx$/,
  /\.pkcs12$/,
];

function isSensitiveFile(filePath: string): boolean {
  const basename = filePath.split("/").pop() ?? filePath;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(basename));
}

// ─── JSON parser strategies ──────────────────────────────────────────────────

interface LLMSingleResponse {
  type: "single";
  message: string;
}

interface LLMPlanResponse {
  type: "plan";
  commits: Array<{ message: string; description?: string; files: string[] }>;
}

type LLMCommitResponse = LLMSingleResponse | LLMPlanResponse;

function tryParseJson(text: string): LLMCommitResponse | null {
  try {
    const parsed = JSON.parse(text.trim()) as Record<string, unknown>;
    if (parsed.type === "plan" && Array.isArray(parsed.commits)) {
      return parsed as unknown as LLMPlanResponse;
    }
    if (parsed.type === "single" && typeof parsed.message === "string") {
      return parsed as unknown as LLMSingleResponse;
    }
  } catch { /* not valid JSON */ }
  return null;
}

// Scans `raw` for balanced-brace substrings using a stack so each `}` emits the
// substring opened by its matching `{`. String literals (with `\\` escapes) are
// honored so braces inside JSON string values don't skew matching. An unclosed
// outer `{` does not prevent inner balanced objects from being emitted, which
// matters when an LLM emits a malformed draft followed by a valid object.
// Candidates are returned in completion order (inner objects before their
// enclosing parents).
function extractBalancedJsonCandidates(raw: string): string[] {
  const candidates: string[] = [];
  const stack: number[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      stack.push(i);
    } else if (c === "}") {
      const start = stack.pop();
      if (start !== undefined) {
        candidates.push(raw.slice(start, i + 1));
      }
    }
  }
  return candidates;
}

export function parseCommitResponse(raw: string): LLMCommitResponse {
  // Strategy 1: pure JSON
  const direct = tryParseJson(raw);
  if (direct) return direct;

  // Strategy 2: fenced code block
  const fenceMatch = raw.match(/```json?\s*\n?([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    const fromFence = tryParseJson(fenceMatch[1]);
    if (fromFence) return fromFence;
  }

  // Strategy 3: balanced-brace candidate extraction. Prefer a "plan" candidate
  // when present so multi-context output is not silently downgraded to the
  // first "single" object the model emits alongside it.
  const candidates = extractBalancedJsonCandidates(raw);
  const parsedCandidates = candidates
    .map(tryParseJson)
    .filter((p): p is LLMCommitResponse => p !== null);
  const plan = parsedCandidates.find((p) => p.type === "plan");
  if (plan) return plan;
  if (parsedCandidates[0]) return parsedCandidates[0];

  // Fallback: treat the whole response as a single commit message
  return { type: "single", message: raw.trim() };
}

function parseAlternativesResponse(raw: string): string[] | null {
  const isValidAlternatives = (parsed: unknown): parsed is { type: string; options: string[] } =>
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as Record<string, unknown>)["type"] === "alternatives" &&
    Array.isArray((parsed as Record<string, unknown>)["options"]) &&
    ((parsed as Record<string, unknown>)["options"] as unknown[]).length > 0 &&
    ((parsed as Record<string, unknown>)["options"] as unknown[]).every((o) => typeof o === "string");

  // Strategy 1: direct JSON parse
  try {
    const p = JSON.parse(raw.trim());
    if (isValidAlternatives(p)) return p.options;
  } catch { /* fall through */ }

  // Strategy 2: extract from fenced code block
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    try {
      const p = JSON.parse(fence[1].trim());
      if (isValidAlternatives(p)) return p.options;
    } catch { /* fall through */ }
  }

  // Strategy 3: find JSON object on a single line
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const p = JSON.parse(trimmed);
      if (isValidAlternatives(p)) return p.options;
    } catch { /* skip */ }
  }

  return null;
}

const MAX_DIFF_CHARS = 80_000;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated — too large for context window]";
}

// ─── Core commit function ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a developer writing commit messages. Analyze the git diff and the list of staged files to determine if the changes span one or multiple contexts.

Rules for commit messages:
- Format: type(scope): description
- Types: feat, fix, refactor, test, chore, style, docs
- Description must be imperative, lowercase, max 72 chars
- Scope is optional but recommended
- Do NOT mention AI, Claude, generated, LLM, or copilot

Response format (JSON only, no extra text):

If all changes belong to a SINGLE context, return:
{"type": "single", "message": "type(scope): description"}

If changes span MULTIPLE distinct contexts (e.g., a bug fix AND a new feature, or docs AND refactoring), return:
{"type": "plan", "commits": [{"message": "type(scope): short title", "description": "brief explanation of what and why", "files": ["file1.ts"]}, {"message": "type(scope): short title", "description": "brief explanation of what and why", "files": ["file3.ts"]}]}

Rules for plan:
- "message" is the commit title (max 72 chars, imperative, lowercase)
- "description" is a brief one-line explanation of the change purpose
- "files" lists only the files belonging to that commit
- Only return a plan when there are clearly separate concerns. Do not split for minor differences.`;

export async function commit(opts: CommitOptions): Promise<CommitPlan | CommitAlternatives> {
  const { cwd, provider, prompt, split = "auto" } = opts;

  // Get staged files and diff
  const stagedFiles = await git.getStagedFilesList(cwd);
  const diff = await git.getStagedDiff(cwd);

  if (!diff) {
    throw new GitwiseError({
      code: "NOTHING_STAGED",
      message: "No staged changes to commit",
    });
  }

  // Sensitive file guard.
  // The user-facing Error message intentionally omits filenames: paths like
  // `prod-customer-db-credentials.json` are themselves sensitive and can leak
  // via shell history, CI logs, or pasted terminal output. The flagged files
  // are exposed only on the structured `files` property and emitted through
  // the debug logger so opt-in `GITWISE_DEBUG=1` surfaces them for triage.
  const sensitiveFiles = stagedFiles.filter(isSensitiveFile);
  if (sensitiveFiles.length > 0) {
    debug("Sensitive files blocked from commit", { files: sensitiveFiles });
    throw new GitwiseError({
      code: "SENSITIVE_FILE_BLOCKED",
      message: `SENSITIVE_FILE_BLOCKED: ${sensitiveFiles.length} file(s) matched sensitive patterns (env/pem/credentials). Set GITWISE_DEBUG=1 to see which files were flagged.`,
      details: { files: sensitiveFiles },
    });
  }

  // Load template (or use built-in system prompt)
  let systemPrompt = SYSTEM_PROMPT;
  try {
    const templateContent = await loadTemplate("commit", {
      repoRoot: opts.repoRoot ?? cwd,
      templatesPath: opts.templatesPath,
    });
    // Only use the template as system prompt if it's a full prompt, not just a format string
    if (templateContent && !templateContent.includes("{{type}}")) {
      systemPrompt = templateContent;
    }
  } catch {
    // Use built-in prompt if template not found
  }

  // Build user message
  const userMessage = [
    `Staged files:\n${stagedFiles.join("\n")}`,
    `\nDiff:\n${truncateDiff(diff)}`,
    prompt ? `\nUser intent: ${prompt}` : "",
    opts.feedbackHint ? `\nUser feedback on previous suggestion: ${opts.feedbackHint}` : "",
    opts.generateAlternatives ? `\nIMPORTANT: Generate exactly 3 different alternative commit messages. Return JSON only: {"type": "alternatives", "options": ["message1", "message2", "message3"]}` : "",
  ].join("");

  debug("Calling LLM for commit analysis", { tier: "fast", fileCount: stagedFiles.length });

  const systemPromptForAlternatives = `${systemPrompt}

When asked to generate alternatives, you must return ONLY this JSON format (no other text):
{"type": "alternatives", "options": ["message1", "message2", "message3"]}`;

  const effectiveSystemPrompt = opts.generateAlternatives ? systemPromptForAlternatives : systemPrompt;

  const tier = resolveModelTier("commit");
  const response = await provider.chat({ systemPrompt: effectiveSystemPrompt, userMessage, tier });

  const parsed = parseCommitResponse(response.content);
  const tokens = { input: response.tokens.input, output: response.tokens.output };

  if (opts.generateAlternatives) {
    const options = parseAlternativesResponse(response.content);
    if (options && options.length > 0) {
      return {
        kind: "alternatives",
        options,
        tokens,
      } satisfies CommitAlternatives;
    }
    // Fallback: wrap whatever was parsed as a single-option alternative
    const rawFallback = response.content.trim().slice(0, 100);
    const fallbackMsg = parsed.type === "single" ? parsed.message : parsed.commits[0]?.message ?? rawFallback;
    return {
      kind: "alternatives",
      options: [fallbackMsg],
      tokens,
    } satisfies CommitAlternatives;
  }

  // Handle split modes
  if (split === "never") {
    // Always return single
    const message = parsed.type === "single"
      ? parsed.message
      : parsed.commits.map((c) => c.message).join("\n\n");
    return {
      kind: "single",
      commits: [{ message, files: stagedFiles }],
      tokens,
    };
  }

  if (parsed.type === "plan" && parsed.commits.length > 1) {
    if (split === "always" || split === "auto") {
      return {
        kind: "split",
        commits: parsed.commits,
        tokens,
      };
    }
  }

  if (split === "always" && parsed.type !== "plan") {
    throw new GitwiseError({
      code: "NO_SPLIT_POSSIBLE",
      message: "split: 'always' requested but LLM returned a single-context plan",
      exitCode: EXIT_CODES.INVALID_INTENT,
    });
  }

  // Single commit
  const message = parsed.type === "single" ? parsed.message : parsed.commits[0]?.message ?? "chore: update";
  return {
    kind: "single",
    commits: [{ message, files: stagedFiles }],
    tokens,
  };
}

// ─── Step factories ──────────────────────────────────────────────────────────

export interface CommitStepResult {
  priorSha: string;
  newSha: string;
}

/**
 * Transaction step that saves a named git stash as a backup of the pre-split
 * working tree, then immediately re-applies the stash so the normal flow can
 * continue with the same staged state.  The predictable stash name
 * (`gitwise/split-<ISO8601>`) lets `docs/recovery.md` guide manual recovery
 * when the compensate fires.
 *
 * compensate: resets the index and working tree to HEAD (no-data-loss because
 * the stash is still present), then pops the named stash to restore the exact
 * pre-split state.
 */
export function takeNamedStashStep(cwd: string, stashName: string): Step<void> {
  return {
    name: `takeNamedStash(${stashName})`,
    async apply(): Promise<void> {
      await git.stashPushNamed(cwd, stashName);
      await git.stashApplyNamed(cwd, stashName);
    },
    async compensate(): Promise<void> {
      // Hard-reset + clean to reach a pristine HEAD state before popping.
      // reset --hard clears tracked/staged changes; clean -fd removes
      // untracked files that were restored by stashApplyNamed and would
      // otherwise conflict with the pop. The stash (taken with
      // --include-untracked) will restore those files during pop.
      // If pop fails, the stash is still in the list under its predictable
      // name so the user can recover manually.
      await git.resetHard(cwd, "HEAD");
      await git.cleanForced(cwd);
      await git.stashPopNamed(cwd, stashName);
    },
  };
}

/**
 * Transaction step that stages the given files and creates one commit.
 * apply  — records the prior HEAD SHA (for compensate) and the new HEAD SHA
 *           (as evidence of the created commit) in the result.
 * compensate — runs `git reset --soft <priorSha>` to undo only this commit
 *              while preserving the staged delta for potential retry.
 */
export function applyOneCommitStep(
  entry: CommitEntry,
  cwd: string,
): Step<CommitStepResult> {
  const msg = entry.description
    ? `${entry.message}\n\n${entry.description}`
    : entry.message;
  return {
    name: `applyCommit(${entry.message})`,
    async apply(): Promise<CommitStepResult> {
      const priorSha = await git.headSha(cwd);
      await git.applyCommit({ message: msg, files: entry.files, cwd });
      const newSha = await git.headSha(cwd);
      return { priorSha, newSha };
    },
    async compensate({ priorSha }: CommitStepResult): Promise<void> {
      await git.resetSoft(cwd, priorSha);
    },
  };
}

// ─── applyCommitPlan ─────────────────────────────────────────────────────────

export async function applyCommitPlan(
  plan: CommitPlan,
  opts: ApplyCommitPlanOptions & { cwd: string },
): Promise<void> {
  const { cwd, push: shouldPush = false, remote = "origin" } = opts;

  if (plan.kind === "split") {
    if (plan.commits.length === 0) {
      throw new GitwiseError({
        code: "INVALID_INTENT",
        message: "Commit split plan has zero commits; cannot apply",
      });
    }

    const stashName = `gitwise/split-${new Date().toISOString()}`;
    const releaseLock = await acquireRepoLock(cwd, { command: "commit-split" });

    try {
      const tx = new Transaction();
      const logger: Logger = { warn: logWarn };

      try {
        // Root step: save pre-split state as a named stash backup,
        // then immediately re-apply so the staged files are still visible.
        await tx.run(takeNamedStashStep(cwd, stashName));

        // Unstage all files so per-commit git-add can re-stage each group.
        await git.resetStaged(cwd);

        for (const entry of plan.commits) {
          await tx.run(applyOneCommitStep(entry, cwd));
        }

        // Happy path: drop the backup stash — it's no longer needed.
        await git.stashDropNamed(cwd, stashName);
      } catch (err) {
        const wrapped =
          err instanceof GitwiseError
            ? err
            : new GitwiseError({
                code: "GIT_FAILED",
                message: err instanceof Error ? err.message : String(err),
                cause: err,
                details: { stderr: err instanceof Error ? err.message : String(err) },
              });
        await tx.rollback(wrapped, logger);
        throw wrapped;
      }
    } finally {
      await releaseLock();
    }
  } else {
    // Single commit — entry.files mirrors `git diff --cached --name-only`, so
    // every path is already staged. Re-running `git add` is both redundant
    // and fatal on staged deletions: once the deletion is in the index, the
    // file exists in neither the worktree nor the index, so pathspec
    // matching fails with "pathspec did not match any files".
    const entry = plan.commits[0];
    if (!entry) return;
    const msg = entry.description
      ? `${entry.message}\n\n${entry.description}`
      : entry.message;
    await git.applyCommit({ message: msg, files: [], cwd });
  }

  if (shouldPush) {
    const branch = await git.getBranch(cwd);
    await git.push(cwd, remote, branch);
  }
}
