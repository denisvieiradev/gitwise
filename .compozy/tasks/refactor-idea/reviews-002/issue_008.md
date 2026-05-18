---
provider: manual
pr:
round: 2
round_created_at: 2026-05-18T12:56:37Z
status: resolved
file: .github/workflows/release.yml
line: 48
severity: medium
author: claude-code
provider_ref:
---

# Issue 008: Release CI publishes the wrong notes when CHANGELOG.md was not updated for the tag

## Review Comment

The `Extract release notes from CHANGELOG.md` step (`.github/workflows/release.yml:48-58`) uses awk to capture the body of the first `## ` heading and writes it to a file consumed by `gh release create --notes-file`. The script does not validate that the captured heading corresponds to the tag being pushed:

```awk
/^## / {
  if (in_section) exit
  in_section = 1
  next
}
in_section { print }
```

If a user (or `gw release`) pushes tag `v1.2.0` while `CHANGELOG.md`'s top section is still `## [1.1.0] - 2026-04-01` — for example because they forgot to run the changelog step, or because the changelog mutation in `applyRelease` failed silently and got reverted — the GitHub release notes will be the previous version's notes, presented under the new tag. This is hard to notice after the fact and can ship incorrect changelog claims to users.

Suggested fix: extend the awk block to require that the matched heading contain the tag version. The tag is available as `${GITHUB_REF_NAME}` (e.g., `v1.2.0`). For instance:

```bash
version="${GITHUB_REF_NAME#v}"
awk -v v="$version" '
  $0 ~ "^## \\[" v "\\]" { in_section = 1; next }
  /^## / && in_section { exit }
  in_section { print }
' CHANGELOG.md > "$notes_file"

if [ ! -s "$notes_file" ]; then
  echo "::error::No CHANGELOG section found for $version — aborting release" >&2
  exit 1
fi
```

This both extracts the correct section and fails the workflow loudly if the section is missing, rather than shipping the previous version's notes silently.

## Triage

- Decision: `VALID`
- Root cause: The original awk block in `.github/workflows/release.yml:48-55` blindly captured the first `## ` section of `CHANGELOG.md` without checking that the heading corresponds to the tag being released (`GITHUB_REF_NAME`). When the changelog top entry does not match the pushed tag — e.g. user forgot to update `CHANGELOG.md` before tagging, or `applyRelease`'s changelog mutation silently reverted — the workflow happily publishes the previous version's notes under the new tag.
- Fix: Parameterize the awk script with `version="${GITHUB_REF_NAME#v}"` and only enter the capture region when the line matches `^## \[<version>\]`. Exit at the next `## ` heading. After extraction, fail the step with a `::error::` annotation if the notes file is empty, so the release aborts loudly instead of shipping wrong content.
- Verification: Manually ran the new awk against the real `CHANGELOG.md` for (a) the top entry `0.1.0` — captured all bullets through "Removed"; (b) a middle entry `1.6.4` — captured only its single bullet and stopped at the next `## ` heading; (c) a non-existent version `9.9.9` — produced an empty file, which the guard converts into a workflow failure.
- Scope: Only `.github/workflows/release.yml` (in-scope file). No code paths in the TS/JS packages execute this awk, so no unit-test changes were required. Workflow lint is implicit via the JSON-Schema validation GitHub Actions performs at run time.
