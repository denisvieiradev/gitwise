---
title: Publishing a Release
description: Step-by-step guide for maintainers to create a new release and publish packages to npm using gitwise itself
---

gitwise is released using itself — `gw release` drives version bumping, changelog generation, tag creation, and push. A GitHub Actions workflow (`release.yml`) then takes over: it builds, tests, signs the tag with GPG, publishes all three packages to npm with provenance attestation, and creates the GitHub release.

## One-Time Setup

Complete these steps once before the first release.

### 1. GitHub repository secrets

The CI workflow requires one secret. Set it with the GitHub CLI:

```bash
# Export your GPG private key and set the secret
gpg --armor --export-secret-keys <YOUR_GPG_KEY_ID> \
  | gh secret set GPG_PRIVATE_KEY -R denisvieiradev/gitwise
```

The release-signing key is intentionally passphrase-less — it only ever runs
unattended in GitHub Actions, so there's no `GPG_PASSPHRASE` secret to set.

Verify the secret exists:

```bash
gh secret list -R denisvieiradev/gitwise
```

### 2. npm Trusted Publisher (OIDC)

The workflow publishes without a stored token using GitHub Actions OIDC. Configure a Trusted Publisher for each of the three packages **before** the first publish:

1. Log in to [npmjs.com](https://www.npmjs.com) as `denisvieiradev`.
2. For each package listed below, go to its settings page and add a Trusted Publisher:
   - [`@denisvieiradev/gitwise-core`](https://www.npmjs.com/package/@denisvieiradev/gitwise-core)
   - [`@denisvieiradev/gitwise`](https://www.npmjs.com/package/@denisvieiradev/gitwise)
   - [`@denisvieiradev/gitwise-skills`](https://www.npmjs.com/package/@denisvieiradev/gitwise-skills)

   For each package, set:
   | Field | Value |
   |---|---|
   | Publisher | GitHub Actions |
   | Repository | `denisvieiradev/gitwise` |
   | Workflow filename | `release.yml` |
   | Environment | *(leave blank)* |

3. Save. The OIDC token that GitHub Actions generates for `release.yml` runs will now be accepted as the publish credential.

---

## Bootstrap: First Release

The very first release is a special case — `gw` is not yet on npm, so you run it directly from the local build.

```bash
# 1. Build all packages
npm run build

# 2. Run the release command from the local CLI build
node packages/cli/dist/index.js release prepare
```

gitwise will analyze commits since the repository's initial commit, draft a changelog entry, and propose a version. Because the packages are already at `0.1.0` and there are no prior tags, confirm `0.1.0` when prompted.

Review the generated release notes file (`.gitwise/release-0.1.0.md`) and edit if needed:

```bash
# Optional: tweak the release notes before finishing
$EDITOR .gitwise/release-0.1.0.md
```

Apply the release plan:

```bash
node packages/cli/dist/index.js release finish
```

This will:
1. Bump versions across `packages/*/package.json`
2. Commit the changelog and version changes
3. Create and push the `v0.1.0` tag
4. Push `main` to origin

The tag push triggers the `release.yml` CI workflow automatically.

---

## Regular Release Workflow

For all releases after the first, use `gw` as a normal installed CLI tool.

### Step 1 — Plan the release

```bash
gw release prepare
# or with an explicit bump type:
gw release prepare --bump minor
```

gitwise analyzes commits since the last tag, infers the version bump type, generates a changelog entry and release notes, and writes a `.gitwise/release-<version>.md` plan file.

The CLI prints the proposed version, changelog diff, and release notes for review.

### Step 2 — Review and edit (optional)

```bash
# Inspect or edit the release notes before applying
$EDITOR .gitwise/release-<version>.md
```

The plan file is gitignored and short-lived — it exists only between `prepare` and `finish`.

### Step 3 — Apply the release

```bash
gw release finish
```

This applies the plan:

- Bumps `version` in all `packages/*/package.json`
- Commits the version bump and changelog update
- Creates a signed git tag (`v<version>`)
- Pushes the commit and tag to `origin`

Pushing the `v*` tag triggers `release.yml`.

### Step 4 — CI publishes to npm

The `release.yml` workflow runs automatically:

| Step | What happens |
|---|---|
| Build & test | `npm run build && npm test` — fails fast if broken |
| Sign tag | Re-signs the tag with the GPG key from secrets |
| Publish core | `npm publish -w packages/core --provenance --access public` |
| Publish cli | `npm publish -w packages/cli --provenance --access public` |
| Publish skills | `npm publish -w packages/skills --provenance --access public` |
| Generate SBOM | CycloneDX SBOM attached to the GitHub release |
| GitHub release | Created from the `## [<version>]` section in `CHANGELOG.md` |

Monitor progress at `https://github.com/denisvieiradev/gitwise/actions`.

---

## Aborting a Release

If you ran `gw release prepare` but want to discard the plan before finishing:

```bash
gw release abort
```

For GitFlow strategies this also offers to delete the `release/<version>` branch.

---

## Installing After Publish

Once the CI workflow completes, the packages are live on npm.

**Install the CLI globally:**

```bash
npm install -g @denisvieiradev/gitwise
gw --version
```

**Install the Claude Code plugin:**

```bash
claude mcp add @denisvieiradev/gitwise-skills
```

**Install core as a library:**

```bash
npm install @denisvieiradev/gitwise-core
```

---

## Troubleshooting

### `No CHANGELOG.md section found for version X`

The CI workflow reads the `## [<version>]` section from `CHANGELOG.md` for the GitHub release body. Ensure the section exists and matches the tag exactly before pushing.

### OIDC publish fails with 403

The Trusted Publisher mapping for the package is missing or incorrect. Re-check the repository name, workflow filename, and that the package name on npmjs.com matches exactly.

### GPG signing fails

The `GPG_PRIVATE_KEY` secret is missing or incorrect. Re-export and re-set it (see [One-Time Setup](#one-time-setup)).

### Emergency publish with NPM_TOKEN

If OIDC is misconfigured, trigger the workflow manually with `use_npm_token: true`:

```bash
gh workflow run release.yml \
  -f tag=v<version> \
  -f use_npm_token=true
```

This requires `NPM_TOKEN` to be set as a repository secret:

```bash
gh secret set NPM_TOKEN -R denisvieiradev/gitwise
```
