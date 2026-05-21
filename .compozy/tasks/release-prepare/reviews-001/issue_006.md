---
provider: manual
pr:
round: 1
round_created_at: 2026-05-20T01:00:23Z
status: resolved
file: packages/core/src/commands/release.ts
line: 85
severity: low
author: claude-code
provider_ref:
---

# Issue 006: `parseVersionSuggestion` fence-stripping regex matches `\`\`\`jso`

## Review Comment

In `parseVersionSuggestion` (`packages/core/src/commands/release.ts:85`):

```ts
const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
```

The intent is to strip ` ```json ` / ` ``` ` fences around an LLM-emitted
JSON blob. The regex `\`\`\`json?\n?` parses as ` ``` ` followed by `j`,
`s`, `o`, then an optional `n` — so it also matches `\`\`\`jso`. The
fallback `.replace(/\`\`\`/g, "")` cleans up the rest, so this almost
never corrupts the parse, but it's a regex tripwire waiting for the next
hand to step on it. Tighten it with a non-capturing group:

```ts
const cleaned = raw.replace(/```(?:json)?\n?/g, "").trim();
```

That drops the second `replace` call too — the single regex handles both
the fenced and bare backtick cases.

## Triage

- Decision: `VALID`
- Notes:
  - Confirmed the regex bug: `/```json?\n?/g` makes only the trailing `n`
    optional, so it also matches the malformed prefix ` ```jso `. The second
    `.replace(/```/g, "")` strips the rest, so the parsed JSON is still
    correct today, but the pattern is misleading and brittle if the second
    pass is ever removed.
  - Root cause: ambiguous quantifier placement on the `json` literal.
  - Fix approach: tighten the regex to `/```(?:json)?\n?/g` so the entire
    `json` token is optional and non-capturing, and drop the redundant
    second `.replace(/```/g, "")` call now that the single regex handles
    both fenced (` ```json `) and bare (` ``` `) backtick cases.
  - Tests: added two cases in `release.test.ts` covering ` ```json ` and
    bare ` ``` ` fenced LLM version suggestions, going through the public
    `release()` path so the regex stays exercised even though
    `parseVersionSuggestion` itself is module-private.
