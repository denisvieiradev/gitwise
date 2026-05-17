import * as git from "../infra/git.js";
import { loadTemplate } from "../template/loader.js";
import { interpolate } from "../template/interpolate.js";
import type { LLMProvider } from "../providers/types.js";
import { resolveModelTier } from "../providers/model-router.js";
import { debug } from "../infra/logger.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReviewFinding {
  file?: string;
  line?: string;
  description: string;
  suggestion?: string;
}

export interface ReviewResult {
  critical: ReviewFinding[];
  suggestions: ReviewFinding[];
  nitpicks: ReviewFinding[];
  markdown: string;
  tokens: { input: number; output: number };
}

export interface ReviewOptions {
  cwd: string;
  provider: LLMProvider;
  baseBranch?: string;
  prompt?: string;
  tier?: "fast" | "balanced" | "powerful";
  templatesPath?: string;
  repoRoot?: string;
}

const MAX_DIFF_CHARS = 80_000;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated — too large for context window]";
}

// ─── Response parsing ────────────────────────────────────────────────────────

interface ParsedReviewResponse {
  critical: ReviewFinding[];
  suggestions: ReviewFinding[];
  nitpicks: ReviewFinding[];
}

function extractSection(markdown: string, heading: string): string[] {
  const headingRegex = new RegExp(`##\\s*${heading}\\b([\\s\\S]*?)(?=##|$)`, "i");
  const match = markdown.match(headingRegex);
  if (!match || !match[1]) return [];
  return match[1]
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter((l) => l.length > 0);
}

function linesToFindings(lines: string[]): ReviewFinding[] {
  return lines.map((line) => ({
    description: line,
  }));
}

function parseReviewMarkdown(text: string): ParsedReviewResponse {
  return {
    critical: linesToFindings(extractSection(text, "Critical")),
    suggestions: linesToFindings(extractSection(text, "Suggestions")),
    nitpicks: linesToFindings(extractSection(text, "Nitpicks")),
  };
}

function buildMarkdown(parsed: ParsedReviewResponse): string {
  const sections: string[] = [];

  sections.push("## Critical");
  if (parsed.critical.length > 0) {
    sections.push(...parsed.critical.map((f) => `- ${f.description}`));
  } else {
    sections.push("_No critical issues found._");
  }

  sections.push("\n## Suggestions");
  if (parsed.suggestions.length > 0) {
    sections.push(...parsed.suggestions.map((f) => `- ${f.description}`));
  } else {
    sections.push("_No suggestions._");
  }

  sections.push("\n## Nitpicks");
  if (parsed.nitpicks.length > 0) {
    sections.push(...parsed.nitpicks.map((f) => `- ${f.description}`));
  } else {
    sections.push("_No nitpicks._");
  }

  return sections.join("\n");
}

// ─── Core review function ────────────────────────────────────────────────────

export async function review(opts: ReviewOptions): Promise<ReviewResult> {
  const { cwd, provider, prompt, tier: requestedTier } = opts;

  // Resolve base branch
  const baseBranch = opts.baseBranch ?? await resolveBaseBranch(cwd);

  // Get diff
  let diff: string;
  try {
    diff = await git.getDiff(cwd, baseBranch);
  } catch {
    // Fall back to unstaged diff
    diff = await git.getDiff(cwd);
  }

  if (!diff) {
    throw Object.assign(
      new Error(`No changes found between current branch and ${baseBranch}`),
      { code: "EMPTY_DIFF" },
    );
  }

  // Load review template
  const templateContent = await loadTemplate("review", {
    repoRoot: opts.repoRoot ?? cwd,
    templatesPath: opts.templatesPath,
  });

  // Build system prompt from template (review.md is used as the user message with diff injected)
  const truncated = truncateDiff(diff);
  const userMessage = interpolate(templateContent, { diff: truncated })
    + (prompt ? `\n\nAdditional context: ${prompt}` : "");

  // Use default system prompt for the review
  const systemPrompt = "You are a senior code reviewer. Analyze the provided diff carefully and return findings.";

  const defaultTier = resolveModelTier("review") as "fast" | "balanced" | "powerful";
  const activeTier = requestedTier ?? defaultTier;

  debug("Calling LLM for code review", { tier: activeTier, diffLength: truncated.length });

  const response = await provider.chat({ systemPrompt, userMessage, tier: activeTier });
  const tokens = { input: response.tokens.input, output: response.tokens.output };

  // Parse findings from response
  const parsed = parseReviewMarkdown(response.content);
  const markdown = buildMarkdown(parsed);

  return {
    critical: parsed.critical,
    suggestions: parsed.suggestions,
    nitpicks: parsed.nitpicks,
    markdown,
    tokens,
  };
}

async function resolveBaseBranch(cwd: string): Promise<string> {
  try {
    return await git.detectBaseBranch(cwd);
  } catch {
    return "main";
  }
}
