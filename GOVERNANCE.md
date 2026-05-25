# Governance

## Project Leadership

`gitwise` operates under a **Benevolent Dictator For Life (BDFL)** model. [Denis Vieira](https://github.com/denisvieiradev) is the project maintainer and holds final decision-making authority.

This model honestly reflects the current bus factor of one. It will be revisited if the project attracts co-maintainers who demonstrate sustained contribution over multiple releases.

## Decision Process

**Routine changes** (bug fixes, documentation, dependency updates, minor refactors) are merged at maintainer discretion after CI passes.

**Significant changes** (new commands, API surface changes, breaking changes, major architectural shifts, governance updates) follow a lightweight proposal process:

1. Open a GitHub issue describing the motivation, the proposed change, and the trade-offs considered.
2. Allow at least 7 days for community comment. Shorter windows are acceptable for security fixes.
3. The maintainer reviews the discussion and makes a final decision. Rough consensus is preferred; the maintainer resolves genuine disagreements and may veto any proposal with a written rationale.

**Breaking changes** are documented in `CHANGELOG.md`, limited to major version bumps, and announced in GitHub Releases with migration guidance.

## SLA

Response times for community interactions (best-effort; no guarantees pre-1.0):

| Activity | Target |
|---|---|
| PR triage (initial review or close-as-won't-fix) | 7 days |
| Bug acknowledgment | 14 days |
| Release cadence | No committed schedule pre-1.0 |

## Path to Co-maintainership

The project welcomes sustained contributors. The path to shared ownership:

1. **Commit rights** — open a PR, get it merged. Repeat. After **5 merged PRs over 3 months**, the maintainer may extend a direct invitation to join as a co-maintainer.
2. **Domain merge rights** — co-maintainers who demonstrate deep expertise in a subsystem (e.g. provider integrations, release infrastructure) may be granted merge authority in that domain after **12 months** of sustained contribution and a maintainer invitation.

Co-maintainership is by invitation only. Invitation decisions are at the sole discretion of the BDFL.

## Contributions

All contributions must follow the [Code of Conduct](CODE_OF_CONDUCT.md) and the development workflow described in [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests must be atomic, include tests, and pass CI before merge.

Review requests are automatically routed to the maintainer via `.github/CODEOWNERS`.

## Code of Conduct Enforcement

Conduct reports are handled by the project maintainer:

**Denis Vieira** — denisvieira05@gmail.com

All reports are treated confidentially. Response follows the enforcement ladder in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md):

- **48 hours** — acknowledgment
- **7 days** — initial assessment
- **30 days** — resolution (critical incidents expedited)

As a sole-maintainer project, there is no independent review committee at this time. Reports that directly involve the maintainer may be escalated to [GitHub Trust & Safety](https://github.com/contact/report-abuse). An independent co-maintainer reviewer will be designated if and when the project acquires co-maintainers.

## Succession

In the event the maintainer steps down or becomes unavailable:

1. An announcement will be made via a GitHub issue tagged `maintainer-transition`.
2. A public call for co-maintainers will be issued with a 60-day comment window, prioritising contributors with a track record in this repository.
3. A new BDFL or a small steering committee will be established based on demonstrated contributions and community trust.

If no successor emerges within 90 days of the announcement, the repository will be archived and the npm packages deprecated with a pointer to any active forks.

## Amendments

This governance document may be amended by the maintainer at any time. Significant amendments — changes to the decision process, enforcement contacts, or succession plan — will be announced as a pinned GitHub issue and recorded in `CHANGELOG.md`.
