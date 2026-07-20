# `@denisvieiradev/gitwise-skills`

Claude Code plugin for [gitwise](https://github.com/denisvieiradev/gitwise). Bundles four skills that call into [`@denisvieiradev/gitwise-core`](https://www.npmjs.com/package/@denisvieiradev/gitwise-core) via thin Node scripts and drive the dialog through Claude Code instead of an interactive terminal prompt.

## Install

Inside a Claude Code conversation:

```text
/plugin marketplace add denisvieiradev/gitwise
/plugin install gitwise@gitwise
```

Skills inherit Claude Code's auth — no API key prompt.

## Skills

Straight from each skill's `SKILL.md` frontmatter:

| Skill | Description |
|---|---|
| `gitwise:commit` | Use when the user asks to commit changes, generate a commit message, or stage and commit files. Analyzes the staged git diff with AI and produces a Conventional Commits message, detecting whether the diff is one logical change or multiple contexts and offering an interactive commit-split when it is multiple. |
| `gitwise:review` | Use when the user asks for a code review, wants feedback on changes, or asks to review a diff. Performs an AI code review of the diff between the current branch and the base branch, returning findings categorized as Critical, Suggestions, and Nitpicks. |
| `gitwise:pr` | Use when the user asks to open a pull request, draft a PR, or create a PR from the current branch. Generates a PR title and body from the diff between the current branch and the base branch, then creates or updates the GitHub PR via `gh`. |
| `gitwise:release` | Use when the user asks to create a release, bump the version, publish a new version, or step through release prepare / finish / abort. Suggests a semantic version bump, generates a changelog entry and release notes, tags the commit, and optionally creates a GitHub release. |

## Full documentation

Configuration schema, privacy/data-handling details, the release lifecycle, and the `gw` CLI surface are documented in the [project README](https://github.com/denisvieiradev/gitwise#readme).

## License

[MIT](https://github.com/denisvieiradev/gitwise/blob/main/LICENSE)
