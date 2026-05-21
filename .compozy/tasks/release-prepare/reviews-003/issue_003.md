---
provider: manual
pr:
round: 3
round_created_at: 2026-05-20T21:52:33Z
status: resolved
file: packages/core/src/commands/release.ts
line: 88
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: `parseVersionSuggestion` accepts any string as a bump type; `bumpVersion` returns `undefined`

## Review Comment

`parseVersionSuggestion` (lines 88–97) validates that the LLM response has a `suggestion` field of type `string` and a `reasoning` field of type `string`, then casts the whole object to `VersionSuggestion`:

```ts
if (typeof parsed.suggestion === "string" && typeof parsed.reasoning === "string") {
  return parsed as unknown as VersionSuggestion;
}
```

The type `VersionSuggestion.suggestion: BumpType` is `"major" | "minor" | "patch"`, but the runtime check accepts **any** string. If the LLM returns `{"suggestion": "huge", "reasoning": "..."}` (or `"feature"`, or anything else), the cast lets garbage flow through.

That garbage hits `bumpVersion` (lines 66–81), whose switch has no `default` case:

```ts
switch (type) {
  case "major": return `${major + 1}.0.0`;
  case "minor": return `${major}.${minor + 1}.0`;
  case "patch": return `${major}.${minor}.${patch + 1}`;
}
// falls through → returns undefined
```

So `newVersion` becomes `undefined`, and downstream code happily produces a release branch named `release/undefined`, a tag `vundefined`, and a CHANGELOG entry `## [undefined] - 2026-05-20`. The user discovers this only after prepare has mutated the repo (gitflow case) or finish has tagged-and-pushed (github-flow case).

This is unlikely with a well-behaved LLM but cheap to defend against, and the failure mode is silent + far from the root cause.

**Suggested fix**:

```ts
function parseVersionSuggestion(raw: string): VersionSuggestion | null {
  try {
    const cleaned = raw.replace(/```(?:json)?\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const { suggestion, reasoning } = parsed;
    if (
      (suggestion === "major" || suggestion === "minor" || suggestion === "patch") &&
      typeof reasoning === "string"
    ) {
      return { suggestion, reasoning };
    }
  } catch { /* fall through to heuristic */ }
  return null;
}
```

This makes the function return `null` on any malformed value, so `release()` falls back to `heuristicBump(commits)` on line 176 — the existing safety net. Also worth adding a `default: throw Object.assign(new Error("Unknown bump type"), { code: "INVALID_VERSION" });` to `bumpVersion` as a belt-and-suspenders measure for non-LLM callers that bypass `parseVersionSuggestion`.

## Triage

- Decision: `VALID`
- Root cause: `parseVersionSuggestion` validated only `typeof suggestion === "string"`, so any string (`"huge"`, `"feature"`, `""`) was cast to `BumpType` and passed to `bumpVersion`. `bumpVersion`'s switch had no `default`, fell through, and returned `undefined`. Downstream this produced `release/undefined` branches, `vundefined` tags, and `## [undefined] - <date>` CHANGELOG entries — silent failures discovered only after `prepare` mutated the repo or `finish` pushed.
- Fix: constrained `parseVersionSuggestion` to accept `suggestion` only when it equals `"major"`, `"minor"`, or `"patch"` (returning `null` otherwise, so `release()` falls back to `heuristicBump(commits)` — the existing safety net at release.ts:177). Added a belt-and-suspenders `default` case to `bumpVersion` that throws `INVALID_VERSION` with `Invalid bump type: <value>` for any non-TS caller that smuggles in an unknown value. Both changes are scope-internal to `packages/core/src/commands/release.ts`.
- Tests: added `bumpVersion` strict-bump-type validation covering `"huge"`, `"feature"`, `"PATCH"`, `""`, `"0"`, `"unknown"`; and two `release()` cases that drive the LLM to return `{suggestion: "huge"}` and `{suggestion: "minor"}` (missing `reasoning`), asserting the heuristic fallback yields `minor` → `1.1.0` from the seeded `feat:` commit.

## Resolution

- Code: `packages/core/src/commands/release.ts:67-99` — `bumpVersion` now throws `INVALID_VERSION` on unknown bump types; `parseVersionSuggestion` rejects suggestions outside the `major | minor | patch` union and stops casting through `as unknown as VersionSuggestion`.
- Tests: `packages/core/__tests__/unit/commands/release.test.ts` — added `strict bump type validation` describe block (6 cases) and two new `release()` LLM-fallback cases.
- Verification: `npm test -- packages/core/__tests__/unit/commands/release.test.ts` (see `cy-final-verify` step).
