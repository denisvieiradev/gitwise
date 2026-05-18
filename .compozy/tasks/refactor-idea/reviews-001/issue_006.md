---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: packages/core/src/commands/commit.ts
line: 103
severity: high
author: claude-code
provider_ref:
---

# Issue 006: Multi-context JSON parser silently drops to single-commit on common LLM patterns

## Review Comment

`parseCommitResponse` in `packages/core/src/commands/commit.ts:91-114` runs three strategies (pure JSON → fenced code block → brace extraction → fallback). The brace-extraction strategy uses `raw.indexOf("{")` and `raw.lastIndexOf("}")` (lines 103-108) and parses everything between them.

This breaks for a realistic LLM output shape — when the model emits prose around or between JSON objects, the substring captures invalid JSON and silently falls through to the `return { type: "single", message: raw.trim() }` fallback (line 113). Example:

```
Here is the plan for your changes:
{"type":"plan","commits":[...]}
Let me know if you want adjustments.
```

`indexOf("{")` lands on the first brace; `lastIndexOf("}")` lands on the closing brace; the slice is valid JSON and works. But:

```
First, the feature change:
{"type":"single","message":"feat: ..."}
Then the unrelated fix:
{"type":"single","message":"fix: ..."}
```

…produces `{"type":"single","message":"feat: ..."}\nThen the unrelated fix:\n{"type":"single","message":"fix: ..."}` — invalid JSON, parser falls back to a single commit message containing the entire raw blob. The multi-context splitter (the headline feature per PRD line 17) silently produces garbage.

**Suggested fix**: Replace brace-extraction with a more robust strategy: scan for balanced-brace JSON objects (track depth with a small state machine), try each candidate against `tryParseJson`, and pick the first one whose `type` is `"plan"` or `"single"`. Add unit tests for: (a) JSON wrapped in prose, (b) two JSON objects separated by prose, (c) JSON inside a fenced ` ```json` block (already covered by strategy 2 but verify), (d) malformed JSON with valid prefix.

## Triage

- Decision: `VALID`
- Root cause: The strategy-3 brace extraction in `parseCommitResponse` used `raw.indexOf("{")` and `raw.lastIndexOf("}")`, taking the widest possible span. When the model emits prose between two JSON objects, that span includes the inter-object prose and is therefore not valid JSON. `tryParseJson` returns `null` and the parser silently falls through to the catch-all `{ type: "single", message: raw.trim() }`, which produces a commit "message" containing the entire raw response — clearly wrong for a feature whose headline is multi-context splitting.
- Fix approach (implemented):
  - Added `extractBalancedJsonCandidates(raw)`: a small state machine that walks the string, tracks string literals (with `\\` escapes) so braces inside JSON string values don't skew depth, and emits each top-level balanced `{...}` substring as a candidate.
  - Replaced the strategy-3 widest-span slice with: parse every candidate via `tryParseJson`, prefer a `type: "plan"` result when present (the feature's whole point is not to silently demote a plan when the model also emits a tentative single), otherwise return the first valid candidate. Falls through to the existing single-message fallback only when no candidate parses.
- Tests added in `__tests__/unit/commands/commit.test.ts`:
  - Plan JSON wrapped in surrounding prose (the issue's first example).
  - Both plan and single objects with prose between them — must return the plan (not silently downgrade).
  - Two `single` objects separated by prose — picks the first valid one rather than falling back to raw-blob single.
  - Braces inside JSON string values — scanner must not be confused by `{` / `}` inside string content.
  - Malformed JSON prefix followed by a valid object — recovers the valid candidate instead of being trapped by the unbalanced prefix.
  - Fenced `json` block — verifies strategy 2 still wins for that shape (regression guard).

## Notes

- Behaviour change is strictly additive for valid input: pure JSON (strategy 1) and fenced `json` blocks (strategy 2) take precedence and produce identical results to before. Only the strategy-3 path changed.
- Existing strategy-3 test (`'Based on the analysis: {"type":"single","message":"fix: typo"} - that is the result.'`) continues to pass: the new scanner finds exactly that one balanced object.
- No production-code changes outside `packages/core/src/commands/commit.ts`.
