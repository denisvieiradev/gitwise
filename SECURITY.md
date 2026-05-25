# Security Policy

This policy applies to the `@denisvieiradev/gitwise` CLI, the `@denisvieiradev/gitwise-core` library, and the `@denisvieiradev/gitwise-skills` Claude Code plugin.

## Supported Versions

`gitwise` is pre-1.0. Security fixes target the latest published `0.x` release. Older `0.x` versions are not patched.

| Version | Supported |
|---------|-----------|
| 0.x (latest)   | Yes       |
| 0.x (older)    | No        |

Once `gitwise` reaches 1.0, this table will be updated to reflect the supported major-version window.

## Reporting a Vulnerability

**Please do NOT open a public issue for security vulnerabilities.**

Instead, email **denisvieira05@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **48 hours** — acknowledgment of your report
- **7 days** — initial assessment and severity classification
- **30 days** — target for fix release (critical issues prioritized)

## Disclosure Policy

We follow coordinated disclosure. Once a fix is released, we will:

1. Publish a security advisory on GitHub
2. Credit the reporter (unless anonymity is requested)
3. Release a patched version on npm for `@denisvieiradev/gitwise`, `@denisvieiradev/gitwise-core`, and `@denisvieiradev/gitwise-skills` as applicable

## Code of Conduct

Security reports are separate from conduct issues. For non-security conduct concerns — harassment, CoC violations, or community disputes — please refer to [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for the reporting process.

## Supply Chain

Every `gitwise` release is signed with the maintainer's GPG key and published with npm provenance. This section documents how to verify release integrity.

### Maintainer GPG Key

**Key ID:** `E73555F2E6F5547F2BC105C3BD8BA14C42504AFD`

The full public key is available at [`KEYS.asc`](KEYS.asc) in this repository.

Import the key before verifying:

```sh
gpg --import KEYS.asc
```

### Verifying a Signed Release Tag

Every release tag is signed (`git tag -s`). To verify a tag:

```sh
gpg --verify v<version>.tag.asc
```

For example, to verify the `v1.0.0` tag:

```sh
git fetch --tags
git tag -v v1.0.0
```

A successful verification prints `Good signature from "Denis Vieira <denisvieira05@gmail.com>"` with the fingerprint above.

### npm Provenance

Published packages include a provenance attestation linking each tarball to the exact GitHub Actions run and commit SHA:

```sh
npm view @denisvieiradev/gitwise --json | jq .dist.attestations
```

For the full supply-chain verification guide, see [docs/supply-chain.md](docs/supply-chain.md) (published in task_17).

### Key Rotation

If the maintainer key is compromised or expires, the following procedure applies:

1. **Revoke** the old key using the revocation certificate stored offline, and upload the revoked key to a keyserver.
2. **Generate** a new RSA-4096 key and store it in two secured locations: password manager vault and encrypted offline backup.
3. **Announce** the rotation via a signed GitHub release note and a pinned issue, linking to the new `KEYS.asc`.
4. **Update** `KEYS.asc` in this repository with the new public key (old key removed), and update the fingerprint in this `SECURITY.md`.
5. **Transition window**: the old key should remain importable for 30 days after the announcement to allow downstream consumers to re-verify historical tags.
6. **Task_16** CI signing: update the `GPG_PRIVATE_KEY` secret in the repository settings with the new key.

Key storage locations: password manager vault (primary) and encrypted USB drive stored offline (backup). Both locations must be updated on every rotation.

## Security by Design

- **API keys** are stored in `~/.gitwise/.env` with `0600` permissions (single line: `ANTHROPIC_API_KEY=...`). They are never written into `~/.gitwise/config.json`, never committed to git, and never echoed to logs.
- **Sensitive-file filter** is on by default. `gw commit` refuses to stage files matching `.env`, `*.pem`, credential JSONs, and similar patterns; these files are never included in an LLM call.
- **Diffs are sent to Claude** (via the Anthropic API or your local Claude Code subprocess) for processing. This is the only data that leaves your machine. There is no other telemetry — see the README "Privacy" section for the full posture.
- **`gh` and `claude` binaries** are invoked as subprocesses with no `shell: true`; arguments are passed as array elements to avoid command-injection surfaces.
- **No remote update channel.** Updates ship via `npm`; users opt in by running `npm install -g @denisvieiradev/gitwise@latest`.
