import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileExists, writeJSON } from "../infra/filesystem.js";
import { info } from "../infra/logger.js";
import type { ReleaseStrategyName } from "../strategies/release.js";
import type { BumpType } from "./release.js";

/**
 * On-disk handoff between `gw release prepare` and `gw release finish`.
 * Lifecycle and validation rules are defined in ADR-003 — written last in
 * prepare, deleted first in finish; never edit by hand.
 */
export interface PersistedReleasePlan {
  schema: 1;
  strategy: ReleaseStrategyName;
  currentVersion: string;
  newVersion: string;
  suggestedBump: BumpType;
  changelog: string;
  notes: string;
  commits: string;
  preparedAt: string;
  baseCommit: string;
  targetBranch: string;
  releaseBranchCreated: boolean;
  tokens: { input: number; output: number };
}

const PLAN_REL_PATH = ".gitwise/release-plan.json";

function planPath(cwd: string): string {
  return join(cwd, PLAN_REL_PATH);
}

export async function saveReleasePlan(cwd: string, plan: PersistedReleasePlan): Promise<void> {
  await writeJSON(planPath(cwd), plan);
}

export async function loadReleasePlan(cwd: string): Promise<PersistedReleasePlan | null> {
  const filePath = planPath(cwd);
  if (!(await fileExists(filePath))) return null;

  const raw = await readFile(filePath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw Object.assign(
      new Error(
        `Release plan at ${filePath} is not valid JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
      { code: "INVALID_PLAN_JSON" },
    );
  }

  const schema = (parsed as { schema?: unknown } | null)?.schema;
  if (schema !== 1) {
    throw Object.assign(
      new Error(
        `Release plan schema ${String(schema)} is not supported by this gitwise binary (expected 1).`,
      ),
      { code: "INVALID_PLAN_SCHEMA" },
    );
  }

  if (!isPersistedReleasePlan(parsed)) {
    throw Object.assign(
      new Error(
        `Release plan at ${filePath} is missing or has wrong-typed required fields for schema 1.`,
      ),
      { code: "INVALID_PLAN_SCHEMA" },
    );
  }

  return parsed;
}

function isPersistedReleasePlan(value: unknown): value is PersistedReleasePlan {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  if (p.schema !== 1) return false;
  if (p.strategy !== "gitflow" && p.strategy !== "github-flow") return false;
  if (p.suggestedBump !== "major" && p.suggestedBump !== "minor" && p.suggestedBump !== "patch") {
    return false;
  }
  if (typeof p.currentVersion !== "string") return false;
  if (typeof p.newVersion !== "string") return false;
  if (typeof p.changelog !== "string") return false;
  if (typeof p.notes !== "string") return false;
  if (typeof p.commits !== "string") return false;
  if (typeof p.preparedAt !== "string") return false;
  if (typeof p.baseCommit !== "string") return false;
  if (typeof p.targetBranch !== "string") return false;
  if (typeof p.releaseBranchCreated !== "boolean") return false;
  if (!p.tokens || typeof p.tokens !== "object") return false;
  const tokens = p.tokens as Record<string, unknown>;
  if (typeof tokens.input !== "number" || !Number.isFinite(tokens.input)) return false;
  if (typeof tokens.output !== "number" || !Number.isFinite(tokens.output)) return false;
  return true;
}

export async function deleteReleasePlan(cwd: string): Promise<void> {
  try {
    await unlink(planPath(cwd));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

/**
 * Pure string transform behind {@link ensureGitignored}: returns the
 * `.gitignore` content that would result from ensuring `entry` is covered.
 * If `entry` is already covered by an exact-match line or a wildcard for its
 * directory (`dir/` or `dir/*`), `content` is returned unchanged. Exported so
 * callers outside the filesystem layer (e.g. `finishRelease`'s working-tree
 * validator) can predict the exact bytes `ensureGitignored` writes without
 * touching disk — keeping the writer and the validator in single-source-of-
 * truth alignment.
 */
export function applyGitignoreEntry(content: string, entry: string): string {
  if (isCovered(content, entry)) return content;
  const needsLeadingNewline = content.length > 0 && !content.endsWith("\n");
  return `${content}${needsLeadingNewline ? "\n" : ""}${entry}\n`;
}

/**
 * Ensure `entry` is covered by the repo's `.gitignore`. Coverage is detected
 * by an exact-match line OR a wildcard for the entry's directory (`dir/` or
 * `dir/*`). When appending, prints a one-line notice and preserves the file's
 * existing trailing-newline behavior.
 */
export async function ensureGitignored(cwd: string, entry: string): Promise<void> {
  const gitignorePath = join(cwd, ".gitignore");
  const exists = await fileExists(gitignorePath);
  const original = exists ? await readFile(gitignorePath, "utf-8") : "";
  const next = applyGitignoreEntry(original, entry);
  if (next === original) return;
  await writeFile(gitignorePath, next, "utf-8");
  info(`Added ${entry} to .gitignore`);
}

function isCovered(content: string, entry: string): boolean {
  const candidates = new Set<string>([entry]);
  const dir = dirname(entry);
  if (dir && dir !== "." && dir !== "/") {
    candidates.add(`${dir}/`);
    candidates.add(`${dir}/*`);
  }
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (candidates.has(line)) return true;
  }
  return false;
}
