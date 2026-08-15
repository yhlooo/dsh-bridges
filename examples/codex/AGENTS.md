# Example project instructions (Codex)

Workspace-level instructions for the codex example. When a DeepSeek Harness
session starts here, this file is part of the instruction chain the codex
bridge injects (see README).

- This project has no application code — it exists to demo the codex bridge
  of the dsh-bridges plugin.
- JSON payloads are validated with the `json-validator` skill before use.
- Keep hooks in `.codex/hooks/` side-effect-only; their logs land in
  `.codex/hook-logs/`.
