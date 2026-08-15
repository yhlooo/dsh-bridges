---
name: commit-message
description: Draft a Conventional Commit message from the current diff.
metadata:
  example: codebuddy-code
---

# Commit Message

1. Inspect the change: `git status --short` and `git diff --cached --stat`
   (use `git diff --stat` when nothing is staged).
2. Pick the Conventional Commit type (`feat`, `fix`, `docs`, …).
3. Write `<type>[scope]: <imperative summary>` in lowercase, no trailing
   period, with a body/footer when it adds value.
4. Offer to run `git commit` with the message. Do not push.
