---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: .github/ISSUE_TEMPLATE/bug_report.yml
line: 2
severity: medium
author: claude-code
provider_ref:
---

# Issue 009: Bug report template still references devflow-cli

## Review Comment

`.github/ISSUE_TEMPLATE/bug_report.yml:2` reads `description: Report a bug in devflow-cli`, and lines 23-24 prompt users to "Run `devflow init`" / "Run `devflow prd "..."`" in the reproduction-steps placeholder. None of these commands exist in gitwise (they are explicitly dropped per PRD non-goals lines 137-138 and TechSpec line 216). Anyone filing a bug after the rename will see stale framing and possibly try the dead commands.

**Suggested fix**:
- Line 2: change to `description: Report a bug in gitwise`
- Lines 22-25: replace the example with current commands, e.g.:
  ```
  1. Run `gw commit` on a repo with staged changes
  2. Choose "split" when prompted
  3. See error
  ```
- Also review any other `.github/ISSUE_TEMPLATE/*.yml` files (`feature_request.yml`, etc.) and the `.github/FUNDING.yml` for stale devflow references.

## Triage

- Decision: `VALID`
- Notes:
  - Verified `.github/ISSUE_TEMPLATE/bug_report.yml` still contained `devflow-cli` framing in three places: the `description` field (line 2), the reproduction `placeholder` (lines 22-25), and the `version` input label (line 45). All are user-facing strings on the bug-report form and reference commands (`devflow init`, `devflow prd`) that no longer exist in gitwise per PRD non-goals.
  - Root cause: rename from `devflow-cli` → `gitwise` did not propagate to this template.
  - Fix applied:
    - Line 2: `description: Report a bug in gitwise`.
    - Lines 22-25: replaced reproduction placeholder with a current `gw commit` / split flow example, matching the wording suggested in the review.
    - Line 45: relabeled the version input from `devflow-cli version` to `gitwise version`.
  - Out-of-scope check (informational only, no edits made — batch scope is bug_report.yml): `.github/ISSUE_TEMPLATE/feature_request.yml` and `.github/FUNDING.yml` do not contain any `devflow` references, so no other template touch-ups are needed in this batch.
