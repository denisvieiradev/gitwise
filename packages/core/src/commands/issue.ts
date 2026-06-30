import * as git from "../infra/git.js";
import { isGhAvailable, createIssue } from "../infra/github.js";
import { loadTemplate } from "../template/loader.js";
import { interpolate } from "../template/interpolate.js";
import type { LLMProvider } from "../providers/types.js";
import { resolveModelTier } from "../providers/model-router.js";
import { debug } from "../infra/logger.js";
import { EXIT_CODES, GitwiseError } from "../errors.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IssueDraft {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  tokens: { input: number; output: number };
}

export interface IssueOptions {
  cwd: string;
  provider: LLMProvider;
  /** Free-text description of the bug or feature the issue is about. */
  description: string;
  /** Additional focus instructions appended to the drafter prompt. */
  prompt?: string;
  labels?: string[];
  assignees?: string[];
  templatesPath?: string;
  repoRoot?: string;
}

export interface ApplyIssueOptions {
  cwd: string;
}

export interface ApplyIssueResult {
  url: string;
}

// ─── Issue response parsing ──────────────────────────────────────────────────

function parseIssueResponse(content: string): { title: string; body: string } {
  const titleMatch = content.match(/^TITLE:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1]!.trim() : "Issue";
  const separatorIdx = content.indexOf("---");
  const body = separatorIdx >= 0 ? content.slice(separatorIdx + 3).trim() : content.trim();
  return { title, body };
}

// ─── Core issue function ─────────────────────────────────────────────────────

const ISSUE_SYSTEM_PROMPT = `You are a developer filing a GitHub issue. Based on the user's description, write a clear, actionable issue.

Decide whether the description is a bug report or a feature request and structure the body accordingly.

Output format (nothing else):
TITLE: <concise, specific title, max 70 chars>
---
## Description
<what the issue is about, in 1-3 short paragraphs>

## Steps to Reproduce
<numbered steps — for a bug; omit this section for a feature request>

## Expected vs Actual
<for a bug: expected behavior vs what happens; omit for a feature request>

## Acceptance Criteria
<for a feature request: a checklist of what "done" means; omit for a bug>

## Context
<environment, related links, or scope notes — omit if none>`;

export async function issue(opts: IssueOptions): Promise<IssueDraft> {
  const { cwd, provider, description, prompt } = opts;

  if (!description || !description.trim()) {
    throw new GitwiseError({
      code: "INVALID_INTENT",
      message: "An issue description is required to draft an issue",
      exitCode: EXIT_CODES.INVALID_INTENT,
    });
  }

  let currentBranch = "";
  try {
    currentBranch = await git.getBranch(cwd);
  } catch {
    // Not on a branch or not a git repo — branch context is optional for an issue.
  }

  // Load issue template or use built-in.
  let systemPrompt = ISSUE_SYSTEM_PROMPT;
  let userMessageFromTemplate = `Description:\n${description}`;
  if (currentBranch) {
    userMessageFromTemplate += `\n\nCurrent branch: ${currentBranch}`;
  }

  try {
    const templateContent = await loadTemplate("issue", {
      repoRoot: opts.repoRoot ?? cwd,
      templatesPath: opts.templatesPath,
    });
    if (templateContent && templateContent.includes("{{")) {
      userMessageFromTemplate = interpolate(templateContent, {
        description,
        branch: currentBranch,
      });
    } else if (templateContent) {
      systemPrompt = templateContent;
    }
  } catch {
    // Use built-in prompt.
  }

  const userMessage = userMessageFromTemplate
    + (prompt ? `\n\nAdditional context: ${prompt}` : "");

  debug("Calling LLM for issue draft", { tier: "fast", branch: currentBranch });

  const tier = resolveModelTier("issue");
  const response = await provider.chat({ systemPrompt, userMessage, tier });
  const tokens = { input: response.tokens.input, output: response.tokens.output };

  const { title, body } = parseIssueResponse(response.content);

  return {
    title,
    body,
    labels: opts.labels,
    assignees: opts.assignees,
    tokens,
  };
}

// ─── applyIssue ──────────────────────────────────────────────────────────────

export async function applyIssue(
  draft: IssueDraft,
  opts: ApplyIssueOptions,
): Promise<ApplyIssueResult> {
  const { cwd } = opts;

  const ghAvailable = await isGhAvailable();
  if (!ghAvailable) {
    throw new GitwiseError({
      code: "GH_UNAVAILABLE",
      message: "gh CLI is not installed — cannot create a GitHub issue",
      exitCode: EXIT_CODES.GH_FAILED,
      details: { draft },
    });
  }

  const created = await createIssue({
    title: draft.title,
    body: draft.body,
    labels: draft.labels,
    assignees: draft.assignees,
    cwd,
  });
  return { url: created.url };
}
