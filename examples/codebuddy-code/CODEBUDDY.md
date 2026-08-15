# Project memory (CodeBuddy Code example)

This file lives at the project root as `CODEBUDDY.md`; the codebuddy-code
bridge injects it at session start.

- This project has no application code — it exists to demo the
  codebuddy-code bridge of the dsh-bridges plugin.
- Commit messages follow Conventional Commits (see the
  `.codebuddy/rules/` rule and the `/commit-message` skill).
- Hook handlers live in `.codebuddy/hooks/`; keep them side-effect-only.
