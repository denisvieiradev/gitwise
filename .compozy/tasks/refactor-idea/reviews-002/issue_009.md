---
provider: manual
pr:
round: 2
round_created_at: 2026-05-18T12:56:37Z
status: resolved
file: packages/core/src/commands/review.ts
line: 135
severity: medium
author: claude-code
provider_ref:
---

# Issue 009: review command throws an unhelpful error when the review template is missing

## Review Comment

`packages/core/src/commands/review.ts:135-138` loads the review template without a fallback:

```ts
const templateContent = await loadTemplate("review", {
  repoRoot: opts.repoRoot ?? cwd,
  templatesPath: opts.templatesPath,
});
```

If `templatesPath` points to a user-customized directory that omits `review.md` (or if the bundled `packages/core/templates/review.md` ever fails to ship inside the published tarball), `loadTemplate` throws and the caller sees `Error: Template "review" not found` with no clear next step. The peer commands handle this gracefully:

- `commit.ts:220-231` — wraps `loadTemplate("commit", ...)` in `try/catch` and falls back to the embedded `SYSTEM_PROMPT`.
- `pr.ts:101-118` — same pattern, falls back to `PR_SYSTEM_PROMPT`.

Only `review.ts` lacks the safety net. Because the diff is interpolated *into* the template (`interpolate(templateContent, { diff: truncated })` at line 142), there isn't a single string fallback; the template is the user message itself.

Suggested fix: extract a small `DEFAULT_REVIEW_TEMPLATE` constant in `review.ts` containing the same body shipped in `packages/core/templates/review.md` (10 lines), and use it as the fallback:

```ts
let templateContent: string;
try {
  templateContent = await loadTemplate("review", { ... });
} catch {
  templateContent = DEFAULT_REVIEW_TEMPLATE;
}
```

This keeps `gw review` working when a user-customized templates directory is missing the file, matches the pattern of the other commands, and avoids depending solely on the published `templates/` directory making it through the tsup build.

## Triage

- Decision: `VALID`
- Root cause: `packages/core/src/commands/review.ts:135` called `loadTemplate("review", ...)` without a `try/catch`. The loader throws `TEMPLATE_NOT_FOUND` if no `review.md` is present at any of the three precedence levels (repo override, `templatesPath`, bundled). The peer commands (`commit.ts:220-231`, `pr.ts:101-118`) already guard the same call with a `try/catch` and an embedded fallback; only `review.ts` lacked the safety net.
- Fix: extracted `DEFAULT_REVIEW_TEMPLATE` in `review.ts` mirroring `packages/core/templates/review.md` (which still contains `{{diff}}` so interpolation continues to work), and wrapped the `loadTemplate("review", ...)` call in `try/catch`, assigning the default on failure. The default contains the `{{diff}}` placeholder so `interpolate(templateContent, { diff: truncated })` behaves identically.
- Tests: added `falls back to the embedded default template when templatesPath omits review.md` in `packages/core/__tests__/unit/commands/review.test.ts`, which points both `templatesPath` and `repoRoot` at an empty directory so all three loader precedence levels miss, then asserts the LLM still receives a user message with the `## Critical` heading from the embedded template and the interpolated diff. Existing tests cover the normal (bundled template) path.
- Verification: see batch run notes.
