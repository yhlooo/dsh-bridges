# Example project instructions (Claude Code)

This file lives at `.claude/CLAUDE.md`; the claude-code bridge injects it at
session start (the root-level `CLAUDE.md` is loaded by DeepSeek Harness
itself).

- This project has no application code — it exists to demo the claude-code
  bridge of the dsh-bridges plugin.
- Hook handlers live in `.claude/hooks/`; keep them side-effect-only and
  portable POSIX shell or plain Node.js.
- Generated hook logs land in `.claude/hook-logs/`; never commit them.
- When editing skills, keep the directory name kebab-case: DeepSeek Harness
  rejects other names.
