---
title: devflow status
description: Show status of all features
---

```bash
devflow status
```

Displays an overview of all tracked features with their current phase, task progress, and suggested next step.

## Example

```bash
$ devflow status
◆ devflow status
│ 001-auth-oauth
│   Phase: In Progress
│   Tasks: 3/5 completed
│   Next: devflow test 001
│
│ 002-payment-stripe
│   Phase: PRD Created
│   Next: devflow techspec 002
│
└ 2 feature(s) tracked.
```
