---
provider: manual
pr:
round: 2
round_created_at: 2026-05-18T12:56:37Z
status: resolved
file: packages/core/src/commands/release.ts
line: 222
severity: medium
author: claude-code
provider_ref:
---

# Issue 007: CHANGELOG header is duplicated when no prior version entries exist

## Review Comment

`packages/core/src/commands/release.ts:222-234` chooses the CHANGELOG insertion path based on `existing.indexOf("## [")`:

```ts
if (await fileExists(changelogPath)) {
  const existing = await readFile(changelogPath, "utf-8");
  const headerEnd = existing.indexOf("## [");
  if (headerEnd > 0) {
    const newContent = existing.slice(0, headerEnd) + versionHeader + existing.slice(headerEnd);
    await writeFile(changelogPath, newContent, "utf-8");
  } else {
    await writeFile(changelogPath, CHANGELOG_HEADER + versionHeader + existing, "utf-8");
  }
}
```

When a repository already contains a CHANGELOG seeded with the `CHANGELOG_HEADER` block (the same `# Changelog\n\n...` template at lines 92–99) but no `## [version]` entries yet — which is exactly the state right after a `gitwise init`-style scaffold or after deleting old entries — `indexOf("## [")` returns `-1`. The `else` branch then prepends `CHANGELOG_HEADER + versionHeader + existing`, but `existing` already starts with the same `CHANGELOG_HEADER` text. Result: the file ends up with the standard header repeated twice before the first version section.

The duplication is silent: tests with a fresh empty file pass (file-does-not-exist branch), and tests with an existing version entry pass (`headerEnd > 0` branch). The buggy state is exactly the in-between case.

Suggested fix: tighten the detection. Either always strip any leading `CHANGELOG_HEADER` substring from `existing` before reassembling, or use a stricter regex (`/^# Changelog\b/`) and split into header / body sections deterministically:

```ts
const trimmed = existing.replace(CHANGELOG_HEADER, "");
await writeFile(changelogPath, CHANGELOG_HEADER + versionHeader + trimmed, "utf-8");
```

A unit test should pass in a file containing exactly `CHANGELOG_HEADER` (no version section) and assert that the rewritten content contains the literal `# Changelog\n` exactly once.

## Triage

- Decision: `VALID`
- Root cause: In `applyRelease`, the CHANGELOG insertion branched on `existing.indexOf("## [")`. When a repo's `CHANGELOG.md` was seeded with the canonical `CHANGELOG_HEADER` block but had no `## [version]` entries yet, `indexOf` returned `-1`, so the `else` branch wrote `CHANGELOG_HEADER + versionHeader + existing` — and `existing` already started with `CHANGELOG_HEADER`, leaving two stacked copies of the standard header in the file.
- Fix: In the no-`## [` branch, strip a leading `CHANGELOG_HEADER` prefix from `existing` before reassembling. Using `existing.startsWith(CHANGELOG_HEADER) ? existing.slice(CHANGELOG_HEADER.length) : existing` is deterministic (anchored at offset 0, no regex escaping concerns) and leaves all other content — including non-standard preambles that just happen to contain the substring elsewhere — intact.
- Tests: Added `applyRelease()` test `"does not duplicate the standard header when CHANGELOG.md exists with only the header (no version entries)"` in `packages/core/__tests__/unit/commands/release.test.ts`. It seeds a `CHANGELOG.md` with only the canonical header, runs `applyRelease`, and asserts the literal `# Changelog` line appears exactly once and that the new `## [1.1.0]` section is present.
- Files changed:
  - `packages/core/src/commands/release.ts` — strip leading header in the no-`## [` branch.
  - `packages/core/__tests__/unit/commands/release.test.ts` — regression test for the seeded-header in-between state.
