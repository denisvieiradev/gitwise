---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: packages/core/src/commands/commit.ts
line: 165
severity: medium
author: claude-code
provider_ref:
---

# Issue 014: Sensitive-file guard leaks the filename in user-facing error message

## Review Comment

The sensitive-file guard in `packages/core/src/commands/commit.ts` (around lines 151-165) correctly refuses to forward `.env`, `*.pem`, and credential JSONs to the LLM (matches TechSpec line 153). However, the thrown error message embeds the filename(s) verbatim, which the CLI then prints via `p.cancel(\`Sensitive file detected: ${msg}\`)` (`packages/cli/src/commands/commit.ts:56`).

Filenames themselves can be sensitive — `prod-customer-db-credentials.json`, `aws-iam-key-for-billing.pem`, or `client-acme-api-secret.env` leak information into shell history, terminal scrollback, CI logs (when `gw` is run there), and any "share my terminal output" workflow the user might do for debugging. The point of the guard is to keep secrets from leaving the machine, and the filename can be part of the secret.

**Suggested fix**: Two-tier message. By default, log the count and category but not the names:

```typescript
throw Object.assign(
  new Error(`SENSITIVE_FILE_STAGED: ${matches.length} file(s) matched sensitive patterns (env/pem/credentials).`),
  { code: "SENSITIVE_FILE_STAGED", files: matches }
);
```

The CLI prints the generic message; the structured `files` array is only logged under `GITWISE_DEBUG=1` (TechSpec line 300 already plumbs this through `infra/logger.ts`). Users who need to see which file was flagged can opt in via debug mode.

## Triage

- Decision: `VALID`
- Root cause: `commit()` in `packages/core/src/commands/commit.ts` interpolated `sensitiveFiles.join(", ")` directly into the thrown `Error.message`. The CLI prints that message verbatim via `p.cancel(\`Sensitive file detected: ${msg}\`)` (`packages/cli/src/commands/commit.ts:100`), so any sensitive name (e.g. `prod-customer-db-credentials.json`) is written to the terminal, shell history, and any captured logs.
- Fix approach:
  - User-facing `Error.message` now says only `SENSITIVE_FILE_STAGED: N file(s) matched sensitive patterns (env/pem/credentials). Set GITWISE_DEBUG=1 to see which files were flagged.`
  - The flagged paths remain available on the structured `files` property of the error (same shape as before), so programmatic callers still have them.
  - Added a `debug("Sensitive files blocked from commit", { files })` call before the throw — this is gated by `GITWISE_DEBUG=1` (`packages/core/src/infra/logger.ts`), giving users an opt-in way to view names when triaging locally.
  - The CLI in `packages/cli/src/commands/commit.ts` was left untouched: its `p.cancel(\`Sensitive file detected: ${msg}\`)` now interpolates the new sanitized message, which is exactly the suggested behavior. No CLI change was needed and the CLI file is outside the batch scope.
- Tests: extended `packages/core/__tests__/unit/commands/commit.test.ts` with a regression case that stages `prod-customer-db-credentials.json`, asserts the error message does **not** contain the filename, asserts the count phrase is present, and asserts the structured `files` array still surfaces the path.

## Verification

- `cd packages/core && npx jest __tests__/unit/commands/commit.test.ts` → 28 passed (`Tests: 28 passed`).
- `cd packages/core && npx tsc -p tsconfig.json --noEmit` → clean.
- `cd packages/cli && npx tsc -p tsconfig.json --noEmit` → clean (verifies the CLI's existing `msg.includes("SENSITIVE_FILE_STAGED")` branch still compiles against the new message, which begins with that literal prefix so the branch fires).
