# Example project instructions (Codex)

Workspace-level instructions for the codex example. When a DeepSeek Harness
session starts here, DeepSeek Harness loads this file itself; the codex bridge
skips the root-level `AGENTS.md` to avoid a duplicate block (see README).

- This project has no application code — it exists to demo the codex bridge
  of the dsh-bridges plugin.
- JSON payloads are validated with the `json-validator` skill before use.
- Keep hooks in `.codex/hooks/` side-effect-only; their logs land in
  `.codex/hook-logs/`.
