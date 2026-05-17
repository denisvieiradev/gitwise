# gitwise Refactor — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Initialize monorepo skeleton with npm workspaces and shared configs | completed | medium | — |
| 02 | Remove deprecated devflow pipeline surfaces and dead state modules | completed | low | — |
| 03 | Create packages/core skeleton with build and test wiring | completed | low | task_01 |
| 04 | Port infra modules (git, github, filesystem, env, logger) into core | completed | medium | task_02, task_03 |
| 05 | Port LLM providers and add MockLLMProvider under core/testing | completed | medium | task_03 |
| 06 | Port template engine and bundled templates with 3-level precedence | pending | medium | task_02, task_04 |
| 07 | Port and refit user/repo config loaders with env-file key handling | pending | medium | task_02, task_04 |
| 08 | Implement core.commit and applyCommitPlan as non-interactive functions | pending | high | task_04, task_05, task_06, task_07 |
| 09 | Implement core.review without techspec coupling | pending | medium | task_04, task_05, task_06, task_07 |
| 10 | Implement core.pr and applyPr with PR-update semantics | pending | medium | task_04, task_05, task_06, task_07 |
| 11 | Implement core.release and applyRelease with workspace version propagation | pending | high | task_04, task_05, task_06, task_07 |
| 12 | Build packages/cli skeleton with commander, first-run flow, and gw config | pending | medium | task_07 |
| 13 | Implement CLI command wrappers for commit, review, pr, and release | pending | high | task_08, task_09, task_10, task_11, task_12 |
| 14 | Build packages/skills plugin with manifest, skill markdown, and scripts | pending | medium | task_08, task_09, task_10, task_11 |
| 15 | Add Phase 0 release tooling (scripts/release.mjs + tag-push CI publish) | completed | medium | task_01, task_12 |
| 16 | Rewrite README and docs for gitwise and draft devflow-cli deprecation banner | completed | low | task_13, task_14 |
