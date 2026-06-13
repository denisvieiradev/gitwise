#!/usr/bin/env node
import { BumpType } from '@denisvieiradev/gitwise-core';

type ReleasePhase = "prepare" | "finish" | "abort";
interface ParsedReleaseArgs {
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

/**
 * gitwise-skills: release runner
 *
 * Usage:
 *   node scripts/release.js [--bump <type>] [--apply] [--no-gh-release]
 *   node scripts/release.js prepare [--bump <type>]
 *   node scripts/release.js finish [--no-gh-release] [--no-workspace-propagation] [--no-delete-branch]
 *   node scripts/release.js abort [--delete-branch]
 *
 * The first positional argument selects the lifecycle phase. When absent, the
 * script keeps the legacy one-shot UX (plan then optional `--apply`). Each
 * phase forwards to the corresponding core function (`prepareRelease`,
 * `finishRelease`, `abortRelease`) and surfaces typed `error.code` values on
 * failure so the Claude Code skill can react.
 */

declare function runReleaseSkill(parsed: ParsedReleaseArgs, cwd?: string): Promise<void>;

export { runReleaseSkill };
