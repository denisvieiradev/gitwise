# Task Memory: task_09.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
Add subprocess argument-safety and sensitive-file blocklist regression tests. Two new test files.

## Important Decisions
- `sensitive-file-blocklist.test.ts` tests via the public `commit()` API rather than exporting `isSensitiveFile` from production code. This avoids production code changes and tests real behavior.
- `it.each` used for table-driven pattern coverage (19 sensitive cases, 6 anti-overmatch cases).
- `subprocess-safety.test.ts` was already partially complete; extended it with a new describe block for `claude-code.ts` invocations.
- `ClaudeCodeProvider` tested with `claudeCliPath` provided to skip `resolveClaudeBinary()`/`execSync` in the constructor; mock provides `execSync` and `spawn` stubs for completeness.
- Anti-overmatch tests: `MockLLMProvider` default response (`mock-response-0`) is enough — no need to queue a specific response.

## Learnings
- `subprocess-safety.test.ts` pre-existed at `packages/core/__tests__/subprocess-safety.test.ts` (top-level, not in unit/ or integration/).
- The blocklist (`SENSITIVE_PATTERNS`) is at `commit.ts:44-60`; `isSensitiveFile()` is private. Tests work via `commit()`.
- `claude-code.ts` imports `execFile`, `execSync`, `spawn` from `node:child_process`. Mock must export all three stubs even if only `execFile` is exercised in the test path.
- `promisify(execFile)` wraps the mocked `execFile` transparently — the callback-based mock pattern works.

## Files / Surfaces
- `packages/core/__tests__/subprocess-safety.test.ts` — EXTENDED (new claude-code describe block, 2 tests added)
- `packages/core/__tests__/sensitive-file-blocklist.test.ts` — NEW (19 blocked + 6 anti-overmatch tests)

## Errors / Corrections
None.

## Ready for Next Run
Task complete. 35 new tests, 493/493 total suite passing, build clean.
