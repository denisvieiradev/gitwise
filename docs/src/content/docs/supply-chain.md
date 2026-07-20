---
title: Supply Chain Verification
description: How to verify npm provenance, signed release tags, and the CycloneDX SBOM for any gitwise release.
---

Every `gitwise` release publishes three independently verifiable supply-chain artifacts:

1. **npm provenance** — links each published tarball to the exact GitHub Actions run and commit SHA that produced it, attested via [Sigstore](https://sigstore.dev).
2. **Signed git tag** — GPG-signed with the maintainer's key, cryptographically linking the version tag to a specific commit.
3. **CycloneDX SBOM** — a machine-readable bill of materials listing every dependency, uploaded to the GitHub Release and attested via GitHub artifact attestations.

The procedures below use only publicly available tools. No special access is required.

## Verifying Provenance

npm provenance attestations are published to the npm registry as part of each release. You can inspect them with the npm CLI:

```sh
# Show attestation metadata for a specific version
npm view @denisvieiradev/gitwise@<version> --json | jq '.dist.attestations'

# Short form — returns the attestation URL and type for the latest version
npm view @denisvieiradev/gitwise .dist.attestations
```

A valid attestation contains a `predicateType` of `https://slsa.dev/provenance/v1` referencing the `denisvieiradev/gitwise` repository and the `release.yml` workflow at the exact commit SHA that produced the tarball.

To verify all package signatures at once:

```sh
npm audit signatures @denisvieiradev/gitwise@<version>
```

This command exits non-zero if any signature is invalid or missing. Running it after install confirms the packages you received were built by the official `release.yml` pipeline and not tampered with in transit.

**What provenance certifies**: the tarball you installed was produced by a specific, auditable GitHub Actions workflow run from a specific public commit. No actor outside that workflow — including the maintainer's local machine — could publish the same tarball with different contents.

## Verifying Signed Tags

Release tags are GPG-signed with the maintainer's key. The public key is published in [`KEYS.asc`](https://github.com/denisvieiradev/gitwise/blob/main/KEYS.asc) at the repo root.

**Import the maintainer key**:

```sh
curl -sSL https://raw.githubusercontent.com/denisvieiradev/gitwise/main/KEYS.asc | gpg --import
```

Or, if you have the repository cloned:

```sh
gpg --import KEYS.asc
```

**Verify a release tag**:

```sh
git tag -v v<version>
```

Expected output includes:

```
gpg: Good signature from "Denis Vieira <denisvieira05@gmail.com>"
```

and the fingerprint `7CEE0D8BC480C78C2CC9E7F2184620A7785B8F17`.

You can also verify using raw gpg against the tag object:

```sh
gpg --verify <(git cat-file tag v<version> | grep -A 100 "^-----BEGIN PGP SIGNATURE") \
             <(git cat-file tag v<version> | sed '/^-----BEGIN PGP SIGNATURE/,$d')
```

**Key fingerprint**:

```
7CEE 0D8B C480 C78C 2CC9  E7F2 1846 20A7 785B 8F17
```

**What signed tags certify**: the version tag `v<X.Y.Z>` was created by the holder of the private key matching the published public key. An attacker cannot forge a valid signed tag without the private key, so tag signatures provide a second verification path independent of npm and Sigstore.

## Verifying the SBOM

A CycloneDX 1.5 SBOM is generated during each release and attached to the GitHub Release page.

**Where to find it**: visit the [Releases page](https://github.com/denisvieiradev/gitwise/releases), open the release for the version you want, and download `sbom-<version>.cdx.json` from the Assets section.

**Inspect the SBOM contents**:

```sh
# List all components (direct and transitive dependencies)
jq '.components[].name' sbom-<version>.cdx.json

# Count total components
jq '.components | length' sbom-<version>.cdx.json

# Find a specific package
jq '.components[] | select(.name == "commander")' sbom-<version>.cdx.json
```

**Verify the SBOM attestation** (confirms the file was produced by the official workflow):

```sh
gh attestation verify sbom-<version>.cdx.json \
  --repo denisvieiradev/gitwise
```

**What the SBOM certifies**: the complete dependency graph — every package, version, and license — included in the build. Use the SBOM to audit transitive dependencies for known CVEs, confirm license compatibility, or import into your organization's software inventory.
