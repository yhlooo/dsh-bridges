---
name: security-review
description: Review the working tree for common security problems before commit.
metadata:
  example: claude-code
---

# Security Review

Review the user's change (diff or pasted code) for common problems:

- secrets or credentials committed in plain text
- unsanitized input reaching shell commands, SQL, or HTML
- path traversal and unsafe file handling
- dependency or version pinning surprises

Report findings as a short list ordered by severity. Do not change code
unless the user asks.
