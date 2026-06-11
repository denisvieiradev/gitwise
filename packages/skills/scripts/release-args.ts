// Argument parser for the `release` skill runner.
//
// Mirrors the CLI surface (`gw release [prepare|finish|abort] …`) so the skill
// script can dispatch on a positional phase argument without re-implementing
// Commander. Kept in its own module so unit tests can exercise it without
// importing the runner (whose top-level `main()` would otherwise execute on
// import).

import type { BumpType } from "@denisvieiradev/gitwise-core";

export type ReleasePhase = "prepare" | "finish" | "abort";

export interface ParsedReleaseArgs {
  /** Resolved phase, or `undefined` for the legacy one-shot invocation. */
  phase: ReleasePhase | undefined;
  /** `--bump <major|minor|patch>` — applies to legacy + `prepare`. */
  bump?: BumpType;
  /** `--apply` — legacy one-shot only; tags and pushes after planning. */
  apply?: boolean;
  /** `--no-gh-release` — skip creating a GitHub release on legacy + `finish`. */
  noGhRelease?: boolean;
  /** `--no-workspace-propagation` — skip the per-package version bump. */
  noWorkspacePropagation?: boolean;
  /** `--no-delete-branch` — `finish` only; keep release branch after merge. */
  deleteReleaseBranch?: boolean;
  /** `--delete-branch` — `abort` only; opt in to deleting the release branch. */
  deleteBranch?: boolean;
  /** `--no-sign` — skip GPG signing of the version tag (testing escape hatch). */
  noSign?: boolean;
}

export class UnknownPhaseError extends Error {
  readonly code = "UNKNOWN_PHASE";
  constructor(phase: string) {
    super(
      `Unknown release phase "${phase}". Use one of: prepare, finish, abort (or omit for the legacy one-shot).`,
    );
    this.name = "UnknownPhaseError";
  }
}

function takeFlag(args: string[], name: string): boolean {
  const idx = args.indexOf(name);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

function takeValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  args.splice(idx, 2);
  return value;
}

function normalizeBump(value: string | undefined): BumpType | undefined {
  return value === "major" || value === "minor" || value === "patch"
    ? value
    : undefined;
}

/**
 * Parse the release skill runner's argv slice (i.e. `process.argv.slice(2)`).
 *
 * Recognises an optional first positional argument identifying the lifecycle
 * phase. Throws {@link UnknownPhaseError} if a non-flag positional is supplied
 * that doesn't match a known phase — surfacing a clear failure instead of
 * silently treating bogus input as a legacy one-shot.
 */
export function parseReleaseArgs(argv: readonly string[]): ParsedReleaseArgs {
  const args = [...argv];

  let phase: ReleasePhase | undefined;
  const first = args[0];
  if (first !== undefined && !first.startsWith("--")) {
    if (first === "prepare" || first === "finish" || first === "abort") {
      phase = first;
      args.shift();
    } else {
      throw new UnknownPhaseError(first);
    }
  }

  const result: ParsedReleaseArgs = { phase };

  const bump = normalizeBump(takeValue(args, "--bump"));
  if (bump) result.bump = bump;

  if (takeFlag(args, "--apply")) result.apply = true;
  if (takeFlag(args, "--no-gh-release")) result.noGhRelease = true;
  if (takeFlag(args, "--no-workspace-propagation")) {
    result.noWorkspacePropagation = true;
  }
  if (takeFlag(args, "--no-delete-branch")) result.deleteReleaseBranch = false;
  if (takeFlag(args, "--delete-branch")) result.deleteBranch = true;
  if (takeFlag(args, "--no-sign")) result.noSign = true;

  return result;
}
