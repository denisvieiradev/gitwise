---
title: Templates
description: Customize devflow-cli templates
---

## How Templates Work

devflow-cli uses Markdown templates with `{{variable}}` interpolation. When generating content, the CLI:

1. Checks for a project override in `.devflow/templates/`
2. Falls back to bundled default templates

## Default Templates

| Template | Used by | Variables |
|----------|---------|-----------|
| `prd.md` | `devflow prd` | `feature_name`, `description` |
| `techspec.md` | `devflow techspec` | `feature_name` |
| `tasks.md` | `devflow tasks` | `feature_name`, `task_description` |
| `commit.md` | `devflow commit` | `type`, `scope`, `description` |
| `pr.md` | `devflow pr` | `summary`, `changelog`, `test_plan` |

## Customizing Templates

Create a `.devflow/templates/` directory and add your custom templates:

```bash
mkdir -p .devflow/templates
```

Copy a default template and modify it:

```markdown
# PRD: {{feature_name}}

## Context
<!-- Your team's specific PRD structure -->

## Problem Statement

## Proposed Solution

## Success Metrics
```

## Variable Interpolation

- Variables use `{{variable_name}}` syntax
- Unmatched variables are kept as-is in the output
- The LLM receives the template as a structural guide
