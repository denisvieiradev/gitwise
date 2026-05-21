# Release Prepare — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Add release-strategy fields to RepoConfig | completed | low | — |
| 02 | Add merge/branch git infra helpers | completed | low | — |
| 03 | Implement ReleaseStrategy module | completed | low | task_01 |
| 04 | Implement release plan persistence module | completed | medium | task_03 |
| 05 | Implement prepareRelease core function | completed | high | task_02, task_03, task_04 |
| 06 | Implement finishRelease core function | completed | high | task_02, task_03, task_04 |
| 07 | Implement abortRelease core function | completed | low | task_02, task_04 |
| 08 | Refactor legacy one-shot release onto unified path | completed | medium | task_05, task_06 |
| 09 | Wire gw release prepare/finish/abort CLI subcommands and integration tests | completed | high | task_05, task_06, task_07, task_08 |
| 10 | Update release skill for new subcommands | completed | low | task_09 |
| 11 | Update README and CHANGELOG for new lifecycle | completed | low | task_09 |
