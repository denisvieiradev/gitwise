---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: packages/skills/skills/commit.md
line: 17
severity: medium
author: claude-code
provider_ref:
---

# Issue 013: Skills invoke scripts via repo-relative paths that break outside the gitwise install dir

## Review Comment

Each skill markdown instructs Claude Code to run scripts via repo-relative paths:

- `packages/skills/skills/commit.md:17` — `node packages/skills/dist/scripts/commit.js "<intent>"`
- Same pattern in `review.md`, `pr.md`, `release.md`

When a user installs the gitwise plugin into Claude Code and triggers a skill from their *own* working directory (e.g., `~/code/their-project`), `node packages/skills/dist/scripts/commit.js` is resolved relative to the user's CWD. The user's repo has no `packages/skills/dist/scripts/` — the command fails with `Error: Cannot find module …`. The skill effectively only works when the user happens to be inside the gitwise source repository.

The Claude Code plugin docs surface a plugin-install-directory variable (commonly `${PLUGIN_DIR}` or similar) that should be used to anchor script paths. Alternatively, expose the entry as a binary via the published npm package and invoke `npx @denisvieiradev/gitwise-skills commit "<intent>"`.

**Suggested fix**: Pick one:
1. Use the plugin-directory substitution variable supported by Claude Code (verify the exact syntax against `https://docs.claude.com/en/docs/claude-code/plugins` since the `$schema` in `plugin.json` (`https://claude.ai/code/plugin-schema/v1`) is also worth verifying for correctness).
2. Publish the skill scripts under a `bin` field in `packages/skills/package.json` (e.g., `gitwise-skill-commit`) and have each skill invoke that binary, which `npm i -g @denisvieiradev/gitwise-skills` makes globally available.
3. Have the skill call the regular `gw` CLI binary (already installable globally) with a `--skills-output` flag that emits markdown instead of running clack — eliminates the separate skills scripts entirely.

Test by installing the plugin into Claude Code in a clean directory and triggering each skill.

## Triage

- Decision: `VALID`
- Root cause: `packages/skills/skills/commit.md` instructs Claude Code to execute
  `node packages/skills/dist/scripts/commit.js …` as a literal repo-relative path.
  When the gitwise plugin is installed into Claude Code, skills are triggered from
  the user's own working directory (`process.cwd()`), where the relative path
  `packages/skills/dist/scripts/commit.js` does not exist. The command therefore
  fails with `Error: Cannot find module …` outside the gitwise source repo.
- Fix approach: anchor the script path on the plugin install directory using
  Claude Code's `${CLAUDE_PLUGIN_ROOT}` substitution variable, which is the
  documented plugin-root variable exposed by Claude Code at skill runtime. The
  plugin manifest (`packages/skills/plugin.json`) ships at the package root and
  the build emits scripts to `dist/scripts/*.js` (see `tsup.config.ts`), so the
  resolved invocation becomes
  `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/commit.js" "<intent>"`. This makes
  the skill work from any user CWD while preserving the existing build output
  layout and `package.json` `files` field (which already includes `dist/`).
- Tests: extend `packages/skills/__tests__/skills.test.ts` for `commit.md` to
  assert the script path is anchored on `${CLAUDE_PLUGIN_ROOT}` and not a bare
  repo-relative `packages/...` path. The existing `scripts/commit.js` substring
  match continues to pass since the new path still ends in `dist/scripts/commit.js`.
- Scope note: `review.md`, `pr.md`, and `release.md` share the same defect (the
  reviewer flagged all four in a single issue). This batch's `<batch_scope>`
  code files restrict edits to `packages/skills/skills/commit.md`, so the other
  three skill files are intentionally left untouched and should be remediated in
  a follow-up batch covering those files.
- Verification: `npm run test --workspace=@denisvieiradev/gitwise-skills` →
  36/36 tests passing, including the two new assertions. `npm test` workspace-
  wide → 228/228 passing. `npm run typecheck --workspace=@denisvieiradev/
  gitwise-skills` → clean. `npm run build --workspace=@denisvieiradev/gitwise-
  skills` → success (emits `dist/scripts/commit.js`, the file the new path
  resolves to). `npm run lint` fails workspace-wide with
  `Error: The 'jiti' library is required for loading TypeScript configuration
  files` from `eslint.config.ts`; this reproduces against the unmodified tree
  (verified by `git stash` + re-run), so it is a pre-existing environment issue
  unrelated to this fix. Markdown files are not subject to ESLint regardless.
