---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: .github/workflows/release.yml
line: 10
severity: medium
author: claude-code
provider_ref:
---

# Issue 010: release.yml requests id-token: write but uses NPM_TOKEN (unused permission)

## Review Comment

`.github/workflows/release.yml:8-10` declares:

```yaml
permissions:
  contents: write
  id-token: write
```

`id-token: write` is only required for workflows that use OIDC trust (e.g., npm provenance with `npm publish --provenance`, or cloud-provider keyless auth). This workflow authenticates to npm with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` (line 41) — a long-lived PAT. There is no OIDC request anywhere in the job. The extra permission widens the workflow's attack surface against a malicious dependency installed during `npm ci` (it could steal the OIDC token to act on behalf of the repo).

**Suggested fix**: Either:
1. Remove line 10 (`id-token: write`) since OIDC isn't in use. This is the simplest fix.
2. Or, switch to npm provenance: add `--provenance` to the publish step and rely on OIDC instead of `NPM_TOKEN`. This is a security upgrade but requires moving npm publishing to a trusted publisher configuration on npmjs.com — a separate, larger change.

Pick option 1 for the MVP and track option 2 as a follow-up.

## Triage

- Decision: `VALID`
- Notes:
  - Root cause: `permissions.id-token: write` was declared in `.github/workflows/release.yml:10`, but the workflow performs no OIDC token exchange. npm authentication uses the long-lived `NPM_TOKEN` PAT (line 41, now line 40 after fix), and the GitHub release step uses the default `GITHUB_TOKEN`. Neither requires the OIDC `id-token` permission.
  - Risk: The unused permission allows any step in the job (including transitive dependencies installed via `npm ci`) to request an OIDC token via `ACTIONS_ID_TOKEN_REQUEST_URL` / `ACTIONS_ID_TOKEN_REQUEST_TOKEN` and impersonate this repository against any OIDC-trusted system, widening blast radius of a compromised dependency.
  - Fix: Removed `id-token: write` from the `permissions:` block per option 1 in the review (the simpler MVP fix). Switching to npm provenance (option 2) is left as a follow-up because it requires reconfiguring trusted publishing on npmjs.com.
  - Verification: `.github/workflows/release.yml` parses as valid YAML and retains only `contents: write`, which is still required for `gh release create` to publish a GitHub release.
