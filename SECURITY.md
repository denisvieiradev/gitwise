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

## Security by Design

- **API keys** are stored in `~/.gitwise/.env` with `0600` permissions (single line: `ANTHROPIC_API_KEY=...`). They are never written into `~/.gitwise/config.json`, never committed to git, and never echoed to logs.
- **Sensitive-file filter** is on by default. `gw commit` refuses to stage files matching `.env`, `*.pem`, credential JSONs, and similar patterns; these files are never included in an LLM call.
- **Diffs are sent to Claude** (via the Anthropic API or your local Claude Code subprocess) for processing. This is the only data that leaves your machine. There is no other telemetry — see the README "Privacy" section for the full posture.
- **`gh` and `claude` binaries** are invoked as subprocesses with no `shell: true`; arguments are passed as array elements to avoid command-injection surfaces.
- **No remote update channel.** Updates ship via `npm`; users opt in by running `npm install -g @denisvieiradev/gitwise@latest`.
