---
title: Exit Codes
description: Stable, machine-readable exit-code contract for scripting gitwise from shells, CI, and pre-commit hooks.
---

The exit codes below are a **public contract**. Every `gw` invocation terminates with one of these numbers, and each number maps to exactly one symbolic constant exported from `@denisvieiradev/gitwise-core` as `EXIT_CODES`. Renumbering a code or repurposing a constant is a **breaking change** that will be called out in release notes and constrained to a major version bump. Integrations — shell scripts, GitHub Actions, pre-commit hooks, task runners — should branch on the numeric `code` rather than on the human-readable error message, which is free to change between releases. A parity test in the core test suite fails CI whenever this table and the `EXIT_CODES` table drift apart, so the documented contract and the shipped behavior cannot diverge silently.

## Code table

| Code | Constant | Category | Meaning | When raised |
|------|----------|----------|---------|-------------|
| 0 | `OK` | Success | Command completed successfully. | Every successful command exits with `0`. |
| 1 | `UNKNOWN` | Catch-all | An unclassified or unexpected error. | A non-`GitwiseError` reached the top-level CLI handler (raw exception, third-party library failure) and was wrapped via `wrapError`. |
| 10 | `NOTHING_STAGED` | Input | No staged changes were available to operate on. | `gw commit` is invoked but `git diff --cached` is empty. |
| 11 | `INVALID_INTENT` | Input | A user-supplied `--intent` could not be parsed or violates length/format limits. | The `--intent` flag is given to `gw commit` with an unusable value. |
| 20 | `GIT_FAILED` | Subprocess | An underlying `git` command exited non-zero. | Any wrapper in `core/src/infra/git.ts` propagates a non-zero `git` exit (e.g. `push` rejected, `merge` conflict, `rebase` aborted). |
| 21 | `GH_FAILED` | Subprocess | An underlying `gh` command exited non-zero. | Any wrapper in `core/src/infra/github.ts` propagates a non-zero `gh` exit (e.g. `gh pr create` rejected, auth missing). |
| 22 | `REPO_STATE_INVALID` | Subprocess | The repository is in a state gitwise cannot operate on. | Detached HEAD, no upstream branch, or a conflicting branch is detected before a command can proceed. |
| 30 | `API_FAILED` | Provider | The Anthropic API or local Claude binary call failed. | The provider returned a non-recoverable error (e.g. 5xx after retries, malformed response, Claude CLI crash). |
| 31 | `API_KEY_MISSING` | Provider | The Anthropic API key is not configured. | The `api` provider is selected but `ANTHROPIC_API_KEY` is unset and `~/.gitwise/.env` does not supply one. |
| 32 | `API_RATE_LIMITED` | Provider | The provider rate-limited the request after the maximum number of retries. | All retry attempts exhausted on a 429 response. |
| 40 | `USER_ABORT` | User | The user declined a confirmation prompt. | An interactive `y/N` prompt was answered "no" (e.g. release confirmation, commit-split confirmation). |
| 50 | `CONFIG_INVALID` | Configuration | A configuration file is malformed or fails validation. | `~/.gitwise/config.json` or `<repo>/.gitwise.json` cannot be parsed or fails schema validation. |
| 60 | `RELEASE_PLAN_STALE` | Release | The release-plan file does not match the current `HEAD`. | `gw release apply`/`finish` is invoked but `.gitwise/release-plan.json` was generated against a different commit. |
| 61 | `RELEASE_BRANCH_CONFLICT` | Release | A pre-existing release branch blocks `prepare`. | `release/<version>` already exists locally or remotely when `gw release prepare` is invoked. |
| 70 | `SENSITIVE_FILE_BLOCKED` | Safety | A staged file matches the sensitive-file blocklist. | `gw commit` detects a staged file matching a sensitive pattern (e.g. `.env`, `id_rsa`, `*.pem`). |
| 80 | `REPO_LOCKED` | Concurrency | Another live gitwise process holds the advisory lockfile for this repository. | A second invocation cannot acquire `.gitwise/.lock` because another gitwise process is active. |
| 81 | `ROLLBACK_PARTIAL` | Concurrency | A multi-step flow failed and one or more compensating actions did not complete. | A `Transaction` rollback ran but at least one `compensate` step threw; the repository may need manual recovery. |

## Category ranges

Each two-digit decade reserves room for related codes so future failure modes slot in without renumbering existing ones:

- `1x` — input validation
- `2x` — subprocess (`git`, `gh`, repo state)
- `3x` — provider (LLM API, key, rate limit)
- `4x` — user interaction
- `5x` — configuration
- `6x` — release lifecycle
- `7x` — safety (sensitive files, blocked content)
- `8x` — concurrency and partial-state hazards

## Branching from a shell

Branch on `$?` immediately after the `gw` invocation. Quote the dispatch with `case` rather than a chain of `[ $? -eq N ]` to avoid clobbering `$?` between checks:

```sh
gw commit
case $? in
  0)   echo "committed" ;;
  10)  echo "nothing staged — skipping commit" ;;
  31)  echo "ANTHROPIC_API_KEY missing — see docs/getting-started" >&2; exit 1 ;;
  70)  echo "blocked: a sensitive file is staged" >&2; exit 1 ;;
  80)  echo "another gitwise run is active — try again" >&2; exit 1 ;;
  *)   echo "gitwise failed with exit $?" >&2; exit 1 ;;
esac
```

For richer integrations, prefer the global `--json` flag (introduced alongside this contract): it emits a structured `{ "error": { "code", "message", "exitCode", "details?" } }` envelope on stdout while still exiting with the documented code, so a single `gw … --json` call gives both a parseable payload and a scriptable status.
