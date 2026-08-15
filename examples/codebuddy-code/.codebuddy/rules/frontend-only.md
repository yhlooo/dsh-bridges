---
alwaysApply: false
description: Frontend-only style rule (conditional rules are not bridged).
paths:
  - "src/**/*.tsx"
---

Use functional components and hooks only.

This rule is `alwaysApply: false` (conditional on `paths`), so the bridge
deliberately skips it — it is here to show that only always-applied rules
get injected.
