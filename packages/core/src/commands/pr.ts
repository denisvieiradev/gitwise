import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as git from "../infra/git.js";
import { isGhAvailable, createPR, updatePR } from "../infra/github.js";
import { loadTemplate } from "../template/loader.js";
import { interpolate } from "../template/interpolate.js";
import type { LLMProvider } from "../providers/types.js";
import { resolveModelTier } from "../providers/model-router.js";
import { debug } from "../infra/logger.js";

const exec = promisify(execFile);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PrDraft {
  title: string;
  body: string;
  existingPrNumber?: number;
  tokens: { input: number; output: number };
}

export interface PrOptions {
  cwd: string;
  provider: LLMProvider;
  baseBranch?: string;
  prompt?: string;
  templatesPath?: string;
  repoRoot?: string;
}

export interface ApplyPrOptions {
  cwd: string;
  draft?: boolean;
  baseBranch?: string;
}

export interface ApplyPrResult {
  url: string;
}

// ─── PR response parsing ─────────────────────────────────────────────────────

function parsePrResponse(content: string): { title: string; body: string } {
  const titleMatch = content.match(/^TITLE:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1]!.trim() : "Update";
  const separatorIdx = content.indexOf("---");
  const body = separatorIdx >= 0 ? content.slice(separatorIdx + 3).trim() : content;
  return { title, body };
}

// ─── Detect existing PR ──────────────────────────────────────────────────────

async function detectExistingPr(cwd: string): Promise<number | undefined> {
  try {
    const result = await exec("gh", ["pr", "view", "--json", "number", "--jq", ".number"], { cwd });
    const numberStr = result.stdout.trim();
    if (numberStr) {
      const n = parseInt(numberStr, 10);
      if (!isNaN(n)) return n;
    }
  } catch {
    // No existing PR or gh not available
  }
  return undefined;
}

// ─── Core pr function ────────────────────────────────────────────────────────

const PR_SYSTEM_PROMPT = `You are a developer creating a pull request. Based on the commit log, generate a PR title and description.

Output format (nothing else):
TITLE: <concise title, max 70 chars>
---
## Summary
<1-3 bullet points>

## Changes
<changelog based on commits>

## Test Plan
<testing checklist>`;

export async function pr(opts: PrOptions): Promise<PrDraft> {
  const { cwd, provider, prompt } = opts;

  const baseBranch = opts.baseBranch ?? await resolveBaseBranch(cwd);
  const currentBranch = await git.getBranch(cwd);
  const commits = await git.getLog(cwd, `${baseBranch}..HEAD`);

  if (!commits) {
    throw Object.assign(
      new Error(`No commits found on this branch relative to ${baseBranch}`),
      { code: "NO_COMMITS" },
    );
  }

  // Load PR template or use built-in
  let systemPrompt = PR_SYSTEM_PROMPT;
  let userMessageFromTemplate = `Branch: ${currentBranch}\n\nCommits:\n${commits}`;

  try {
    const templateContent = await loadTemplate("pr", {
      repoRoot: opts.repoRoot ?? cwd,
      templatesPath: opts.templatesPath,
    });
    // If template contains placeholders, use it as user message template
    if (templateContent && templateContent.includes("{{")) {
      userMessageFromTemplate = interpolate(templateContent, {
        branch: currentBranch,
        commits,
        summary: "",
        changelog: "",
        test_plan: "",
      });
    }
  } catch {
    // Use built-in prompt
  }

  const userMessage = userMessageFromTemplate
    + (prompt ? `\n\nAdditional context: ${prompt}` : "");

  // Detect existing PR
  const existingPrNumber = await detectExistingPr(cwd);

  debug("Calling LLM for PR draft", { tier: "fast", branch: currentBranch, existingPrNumber });

  const tier = resolveModelTier("pr");
  const response = await provider.chat({ systemPrompt, userMessage, tier });
  const tokens = { input: response.tokens.input, output: response.tokens.output };

  const { title, body } = parsePrResponse(response.content);

  return {
    title,
    body,
    existingPrNumber,
    tokens,
  };
}

// ─── applyPr ────────────────────────────────────────────────────────────────

export async function applyPr(draft: PrDraft, opts: ApplyPrOptions): Promise<ApplyPrResult> {
  const { cwd, draft: isDraft = false, baseBranch } = opts;

  const ghAvailable = await isGhAvailable();
  if (!ghAvailable) {
    throw Object.assign(
      new Error("gh CLI is not installed — cannot create or update a PR"),
      { code: "GH_UNAVAILABLE", draft },
    );
  }

  if (draft.existingPrNumber !== undefined) {
    const updated = await updatePR({
      prNumber: draft.existingPrNumber,
      title: draft.title,
      body: draft.body,
      cwd,
    });
    return { url: updated.url };
  }

  const created = await createPR({
    title: draft.title,
    body: draft.body,
    base: baseBranch,
    cwd,
    draft: isDraft,
  });
  return { url: created.url };
}

async function resolveBaseBranch(cwd: string): Promise<string> {
  try {
    return await git.detectBaseBranch(cwd);
  } catch {
    return "main";
  }
}
