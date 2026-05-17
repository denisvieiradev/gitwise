---
title: devflow prd
description: Generate a PRD from a feature description
---

```bash
devflow prd <description>
```

Generates a structured Product Requirements Document using AI. Asks clarification questions before generating.

## Arguments

| Argument | Description |
|----------|-------------|
| `description` | Feature description in natural language |

## What it does

1. Creates a feature reference (e.g., `001-auth-oauth`)
2. Sends description to LLM for clarification questions
3. Presents questions interactively
4. Generates PRD using answers + template
5. Saves to `.devflow/features/[ref]/prd.md`
6. Updates state to `prd_created`

## Example

```bash
$ devflow prd "add OAuth authentication with Google and GitHub"
◆ devflow prd
│ Feature: 001-add-oauth-authentication-with-google
│ Questions:
│ 1. Sign-up or login only?
│ 2. Roles/permissions needed?
│ 3. Session via JWT or cookie?
│ Your answers: Login only, no roles, JWT
│ PRD saved: .devflow/features/001-add-oauth-authentication-with-google/prd.md
```
