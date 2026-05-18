---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: packages/core/src/commands/release.ts
line: 45
severity: low
author: claude-code
provider_ref:
---

# Issue 016: bumpVersion silently coerces malformed semver inputs to zero

## Review Comment

`bumpVersion` in `packages/core/src/commands/release.ts:45-55` parses the current version by splitting on `.` and falling back to `0` for any missing or non-numeric segment (via `??` / `Number(x) || 0`). Inputs like `"v1.2"`, `"not-a-version"`, `"1.2.3-rc.1"`, or `"1.2.3+build.5"` are accepted silently and produce a bumped output that drops information or starts from zero. A typo in `package.json` `"version"` (e.g., a trailing space or accidental `v` prefix) results in a release tagged `v0.0.1` with no warning.

`scripts/release.mjs` has its own `SEMVER_RE` regex (line 12) for argv parsing — so the script catches invalid CLI input — but the `bumpVersion` in `core` does not validate `currentVersion` read from disk.

**Suggested fix**: Validate the input against a strict X.Y.Z regex (`/^(\d+)\.(\d+)\.(\d+)$/`) before bumping. On mismatch, throw `Object.assign(new Error(`Invalid current version: ${currentVersion}`), { code: "INVALID_VERSION" })` so callers can surface a clear error. If prerelease/build metadata support is desired in the future, document the policy (strip on bump? preserve? error?) and pick one consistently in the script and core.

## Triage

- Decision: `VALID`
- Notes:
  - Confirmed in `packages/core/src/commands/release.ts:45-55`: `current.replace(/^v/, "").split(".").map(Number)` followed by `parts[i] ?? 0` produces silent garbage for any non-strict X.Y.Z input. `"v1.2"` → `1.2.1`, `"not-a-version"` → `NaN.NaN.NaN` (since `?? 0` only catches `undefined`/`null`, not `NaN`), `"1.2.3-rc.1"` → `1.2.NaN`. There is no validation between `pkg.version` (read from disk in `release()`) and `bumpVersion()`, so a typo or pre-release tag silently corrupts the tagged release version.
  - `scripts/release.mjs` already enforces a `SEMVER_RE` for CLI argv (line 12) but the core library's `bumpVersion()` does not, so disk-sourced versions bypass any validation.
  - Root cause: lossy parsing + fallback-to-zero swallows malformed input instead of failing fast.

## Resolution

- Replaced the lossy parser in `bumpVersion` with a strict regex `^v?(\d+)\.(\d+)\.(\d+)$` (preserves the existing `v` prefix tolerance, since the public test contract — `bumpVersion("v1.2.3", "patch") → "1.2.4"` — depends on it).
- On mismatch, throws `Error("Invalid current version: <input>")` with `code: "INVALID_VERSION"`, matching the suggested fix in the review comment and the project's existing error-code convention (e.g., `NO_PACKAGE_JSON`, `NO_COMMITS` in the same file).
- Pre-release/build metadata is intentionally rejected; if support is desired later it requires a documented policy across `scripts/release.mjs` and core, as the reviewer noted.
- Added 11 new test cases covering malformed inputs (`v1.2`, `1.2`, `1`, `not-a-version`, `1.2.3-rc.1`, `1.2.3+build.5`, leading/trailing whitespace, `1.2.3.4`, empty, `vv1.2.3`), each asserting `INVALID_VERSION` error code. All 30 release-suite tests pass; full core suite is 166/166 green; `tsc --noEmit` clean.
