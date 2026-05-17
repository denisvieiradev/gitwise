import * as git from "../infra/git.js";
import { loadTemplate } from "../template/loader.js";
import type { LLMProvider } from "../providers/types.js";
import { resolveModelTier } from "../providers/model-router.js";
import { debug } from "../infra/logger.js";

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

  // Strategy 3: brace extraction
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const fromBraces = tryParseJson(raw.slice(start, end + 1));
    if (fromBraces) return fromBraces;
  }

  // Fallback: treat the whole response as a single commit message
  return { type: "single", message: raw.trim() };
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

export async function commit(opts: CommitOptions): Promise<CommitPlan> {
  const { cwd, provider, prompt, split = "auto" } = opts;

  // Get staged files and diff
  const stagedFiles = await git.getStagedFilesList(cwd);
  const diff = await git.getStagedDiff(cwd);

  if (!diff) {
    throw Object.assign(new Error("No staged changes to commit"), { code: "NOTHING_STAGED" });
  }

  // Sensitive file guard
  const sensitiveFiles = stagedFiles.filter(isSensitiveFile);
  if (sensitiveFiles.length > 0) {
    throw Object.assign(
      new Error(`Sensitive files staged: ${sensitiveFiles.join(", ")}`),
      { code: "SENSITIVE_FILE_STAGED", files: sensitiveFiles },
    );
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
  ].join("");

  debug("Calling LLM for commit analysis", { tier: "fast", fileCount: stagedFiles.length });

  const tier = resolveModelTier("commit");
  const response = await provider.chat({ systemPrompt, userMessage, tier });

  const parsed = parseCommitResponse(response.content);
  const tokens = { input: response.tokens.input, output: response.tokens.output };

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
    throw Object.assign(
      new Error("split: 'always' requested but LLM returned a single-context plan"),
      { code: "NO_SPLIT_POSSIBLE" },
    );
  }

  // Single commit
  const message = parsed.type === "single" ? parsed.message : parsed.commits[0]?.message ?? "chore: update";
  return {
    kind: "single",
    commits: [{ message, files: stagedFiles }],
    tokens,
  };
}

// ─── applyCommitPlan ─────────────────────────────────────────────────────────

export async function applyCommitPlan(
  plan: CommitPlan,
  opts: ApplyCommitPlanOptions & { cwd: string },
): Promise<void> {
  const { cwd, push: shouldPush = false, remote = "origin" } = opts;

  if (plan.kind === "split") {
    // For split plans, reset staging area and commit each group
    await git.resetStaged(cwd);
    for (const entry of plan.commits) {
      const msg = entry.description
        ? `${entry.message}\n\n${entry.description}`
        : entry.message;
      await git.applyCommit({ message: msg, files: entry.files, cwd });
    }
  } else {
    // Single commit — files already staged or we stage the listed files
    const entry = plan.commits[0];
    if (!entry) return;
    const msg = entry.description
      ? `${entry.message}\n\n${entry.description}`
      : entry.message;
    await git.applyCommit({ message: msg, files: entry.files, cwd });
  }

  if (shouldPush) {
    const branch = await git.getBranch(cwd);
    await git.push(cwd, remote, branch);
  }
}
