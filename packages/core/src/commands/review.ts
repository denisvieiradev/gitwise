import * as git from "../infra/git.js";
import { loadTemplate } from "../template/loader.js";
import { interpolate } from "../template/interpolate.js";
import type { LLMProvider } from "../providers/types.js";
import { resolveModelTier } from "../providers/model-router.js";
import { debug } from "../infra/logger.js";
import { EXIT_CODES, GitwiseError } from "../errors.js";

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

// Mirrors packages/core/templates/review.md so `gw review` stays functional
// when a user-customized templates directory omits review.md or when the
// bundled template is missing from a packaged build.
const DEFAULT_REVIEW_TEMPLATE = `You are a senior code reviewer. Analyze the diff and produce a code review with findings in these categories:

## Critical
Issues that must be fixed before merging (bugs, security, data loss).

## Suggestions
Improvements worth considering (performance, readability, patterns).

## Nitpicks
Minor style or convention issues.

For each finding, include:
- File and line reference
- Description of the issue
- Suggested fix

End with a summary: total findings count per category and overall recommendation (approve, request changes).

{{diff}}
`;

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
  } catch (err: unknown) {
    if (isUnknownRevisionError(err)) {
      // Base branch is unknown locally (not fetched, typo, fresh clone). Fall back to
      // the working-tree diff so the caller still gets a review of pending edits.
      diff = await git.getDiff(cwd);
    } else {
      const reason = errorMessage(err);
      throw new GitwiseError({
        code: "DIFF_FAILED",
        message: `Failed to compute diff against ${baseBranch}: ${reason}`,
        exitCode: EXIT_CODES.GIT_FAILED,
        cause: err,
      });
    }
  }

  if (!diff) {
    throw new GitwiseError({
      code: "EMPTY_DIFF",
      message: `No changes found between current branch and ${baseBranch}`,
      exitCode: EXIT_CODES.NOTHING_STAGED,
    });
  }

  // Load review template, falling back to the embedded default when the
  // resolved templates directory does not provide review.md.
  let templateContent: string;
  try {
    templateContent = await loadTemplate("review", {
      repoRoot: opts.repoRoot ?? cwd,
      templatesPath: opts.templatesPath,
    });
  } catch {
    templateContent = DEFAULT_REVIEW_TEMPLATE;
  }

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

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

// Duck-typed instead of `instanceof Error` because jest's --experimental-vm-modules
// can run modules in separate VM realms, where the Error constructor differs.
function isUnknownRevisionError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const errObj = err as { message?: unknown; stderr?: unknown };
  const message = typeof errObj.message === "string" ? errObj.message : "";
  const stderr = typeof errObj.stderr === "string" ? errObj.stderr : "";
  const text = `${message}\n${stderr}`;
  return /unknown revision|bad revision|not a valid object name|ambiguous argument/i.test(text);
}
