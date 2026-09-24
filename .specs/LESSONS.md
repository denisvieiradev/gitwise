# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Test overwrite-safety for every install target by seeding an unrelated file in each target and asserting it survives reinstall
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `installer` · harmful: 0
- features: codex-kiro-copilot-support
- evidence: packages/cli/__tests__/skills-install.test.ts:79-94 (mutant M2b) (installer)
- last seen: 2026-09-23T16:26:02Z

### L-002 - Give every call site of a shared output helper its own test, since one helper test does not prove each site uses it
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `cli-output` · harmful: 0
- features: codex-kiro-copilot-support
- evidence: packages/cli/src/commands/commit.ts:236 (mutant M6b) (cli-output)
- last seen: 2026-09-23T16:26:03Z

### L-003 - When aggregating a flag across several calls, test each contributing call alone as the failing one
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `aggregation` · harmful: 0
- features: codex-kiro-copilot-support
- evidence: packages/core/src/commands/release.ts:220,259 (mutant M3b) (aggregation)
- last seen: 2026-09-23T16:26:03Z

### L-004 - Assert the exact key set of a migrated map, not only that the expected keys are present
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `config-migration` · harmful: 0
- features: codex-kiro-copilot-support
- evidence: packages/core/__tests__/unit/config/config.test.ts:326 (mutant M4d) (config-migration)
- last seen: 2026-09-23T16:26:03Z

### L-005 - Verify default external identifiers against the real tool's own catalog and pin the defaults with tests
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `config-defaults` · harmful: 0
- features: codex-kiro-copilot-support
- evidence: MDL-02 packages/core/src/config/types.ts default model IDs (config-defaults)
- last seen: 2026-09-23T16:26:03Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
