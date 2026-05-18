---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: packages/core/src/infra/env.ts
line: 63
severity: high
author: claude-code
provider_ref:
---

# Issue 007: API key file write is non-atomic and chmod runs after write

## Review Comment

`writeEnvVar` in `packages/core/src/infra/env.ts:36-65` writes the API key file in two steps:

```typescript
await writeFile(envPath, final.endsWith("\n") ? final : final + "\n", "utf-8");  // line 63
await chmod(envPath, 0o600);                                                       // line 64
```

The default `writeFile` creates `~/.gitwise/.env` with the user's umask (typically `0644` — world-readable). The `chmod(0o600)` only restricts permissions after the file already exists on disk with the secret in it. On a shared system, another local user can read the API key during the window between `writeFile` and `chmod`. This contradicts the TechSpec line 182 promise: "API keys are persisted out-of-band in `~/.gitwise/.env` with `0600` permissions."

It is also not atomic against concurrent writes — if `writeApiKey` is called twice in parallel (e.g., two `gw` processes started in tight succession), one write can clobber the other partway through.

**Suggested fix**: Use a write-temp-then-rename pattern.

```typescript
const tmpPath = `${envPath}.${process.pid}.tmp`;
const fd = await fs.open(tmpPath, "w", 0o600);   // open with 0600 from the start
try {
  await fd.writeFile(final);
} finally {
  await fd.close();
}
await fs.rename(tmpPath, envPath);   // atomic on POSIX
```

This eliminates the world-readable window and makes the write atomic against crashes mid-write. Note Windows: `fs.open` mode bits are ignored on Windows, but TechSpec line 344 already acknowledges that risk; the rename pattern still helps atomicity. Add a test asserting `stat(envPath).mode & 0o777 === 0o600` immediately after `writeApiKey` returns.

## Triage

- Decision: `VALID`
- Notes:
  - Confirmed at `packages/core/src/infra/env.ts:63-64` (pre-fix): `writeFile` honored the
    inherited umask (typically 0022), so `~/.gitwise/.env` was created as 0644 and the secret
    sat world-readable on disk for the entire interval between the `writeFile` resolve and the
    subsequent `chmod(0o600)`. On a shared host another local user could `cat` the key during
    that window. The function was also non-atomic against crashes or concurrent writers — a
    truncate+write that fails mid-way could leave a partial or empty file in place.
  - Root cause: permissions were applied as a post-step on the live destination instead of
    being baked into the file at creation, and the destination was written in place rather
    than via a rename-from-temp.
  - Fix applied: open a sibling temp file in `~/.gitwise/` via `fs.open(path, "w", 0o600)`
    so it is created with restrictive bits from the first byte (POSIX honors the mode arg on
    O_CREAT), write the payload through the file handle, close it, then `fs.rename` it over
    the destination. `rename` is atomic on POSIX, so readers either observe the prior file or
    the new file — never a half-written one. On failure the temp is unlinked so we do not
    leak `.tmp` siblings. Windows ignores the mode bits (already called out in the TechSpec),
    but the atomicity benefit still holds; the new permission assertions are skipped there.
  - Tests added (in `packages/core/__tests__/unit/infra/env.test.ts`):
    1. After `writeEnvVar` returns, `stat(envPath).mode & 0o777 === 0o600`.
    2. Same assertion under an explicit `process.umask(0o022)` to prove the result is
       umask-independent (the bug would have surfaced as 0o644 here).
    3. No `*.tmp` siblings remain in `~/.gitwise/` after a successful write.
