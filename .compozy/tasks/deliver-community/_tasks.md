# Deliver Community — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Establish GitwiseError class and EXIT_CODES table | completed | medium | — |
| 02 | Author docs/exit-codes.md with parity test | completed | low | task_01 |
| 03 | Migrate core throw sites to GitwiseError | completed | medium | task_01 |
| 04 | Implement CLI exit-code dispatch, --json envelope, deprecate --api-key | completed | medium | task_03 |
| 05 | Implement Transaction primitive and advisory lockfile | completed | high | task_01 |
| 06 | Migrate workspace version propagation to Transaction | completed | medium | task_05 |
| 07 | Migrate release prepare (gitflow) to Transaction | completed | high | task_05, task_06 |
| 08 | Migrate commit-split to Transaction with named stash compensate | completed | high | task_05 |
| 09 | Add subprocess argument-safety and sensitive-file blocklist regression tests | completed | low | — |
| 10 | Add CODEOWNERS, CODE_OF_CONDUCT.md, and GOVERNANCE.md | completed | low | — |
| 11 | Publish maintainer GPG public key and update SECURITY.md | completed | low | task_10 |
| 12 | Configure Dependabot and pin GitHub Actions to commit SHAs | completed | low | — |
| 13 | Add CodeQL SAST workflow | completed | low | — |
| 14 | Add OSV-Scanner workflow with expiry-enforced ignore file | completed | low | — |
| 15 | Add Dependabot auto-merge workflow | completed | low | task_12, task_13, task_14 |
| 16 | Harden release.yml with OIDC, npm provenance, SBOM, signed tags | completed | high | task_11, task_12 |
| 17 | Author docs/recovery.md, docs/supply-chain.md, and update CONTRIBUTING.md | completed | medium | task_07, task_08, task_16 |
| 18 | Overhaul README.md with badges and canonical-doc links | completed | medium | task_02, task_10, task_16, task_17 |
