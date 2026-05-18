---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: .gitignore
line: 4
severity: low
author: claude-code
provider_ref:
---

# Issue 015: .gitignore still contains legacy .devflow/ patterns

## Review Comment

`.gitignore:4`, `:5`, and `:14` ignore devflow-specific paths:

```
.devflow/config.json
.devflow/state.json
.devflow/.env
```

These were the devflow-cli user-state files; per PRD lines 137-138 and TechSpec line 229, gitwise does not read or write `.devflow/`. The patterns are dead weight. Worse, the current repo has a tracked `.devflow/` directory (visible in the initial `git status` output as `?? .devflow/`) that is meta-state for an active task — it should likely NOT be ignored entirely.

**Suggested fix**: Remove the three `.devflow/` lines. The general `.env` / `.env.*` entries already in the file (lines 12-13) cover any sensitive env files going forward. Audit whether anything else in `.gitignore` is devflow-specific (none jumped out, but worth a pass).

## Triage

- Decision: `VALID`
- Notes:
  - PRD lines 137-138 drop the entire devflow-cli pipeline surface (PRD/techspec/tasks/run-tasks/test/done/status). TechSpec line 229 confirms `gitwise reads no devflow state; existing .devflow/ dirs in user repos are left alone.`
  - The three patterns (`.devflow/config.json`, `.devflow/state.json`, `.devflow/.env`) only existed to hide devflow-cli's user-state files. gitwise never produces those paths, so the patterns are dead weight.
  - Confirmed via `git check-ignore -v` that lines 4, 5, and 14 were the only `.devflow/`-targeted rules; the generic `.env` / `.env.*` on lines 12-13 already cover any sensitive env file going forward.
  - Audited the remaining entries (`node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `.DS_Store`, `docs/.astro/`, `docs/package-lock.json`, IDE/OS/log patterns) — none are devflow-specific.

## Resolution

Removed the three `.devflow/`-specific patterns from `.gitignore` (previously lines 4, 5, and 14). No other entries needed changes. With those patterns gone, the repo's `.devflow/` directory (currently holding workflow meta-state such as `.devflow/releases/`) is no longer partially ignored by content-specific rules, so contributors can decide per-file what to track.
