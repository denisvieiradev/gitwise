---
title: Templates
description: Customize gitwise prompt templates
---

## Overview

gitwise generates content (commits, PR bodies, reviews, release notes) from bundled prompt templates. A repository can opt into local template overrides by setting `templatesPath` in its `<repo>/.gitwise.json`:

```json
{
  "templatesPath": ".gitwise/templates"
}
```

When `templatesPath` is set, gitwise looks for matching template files there before falling back to the bundled defaults.

## Variable Interpolation

Templates are Markdown with `{{variable_name}}` placeholders. Unmatched variables are kept as-is in the output. The LLM receives the rendered template as a structural guide rather than a strict format.
