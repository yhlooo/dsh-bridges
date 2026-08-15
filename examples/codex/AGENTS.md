# Example project instructions (Codex)

Workspace-level instructions for the codex example. When a DeepSeek Harness
session starts here, DeepSeek Harness loads this file itself — and, because
this directory is not its own git repository (the repo root resolves to the
outer checkout), the codex bridge also injects it as a mid-chain instruction,
so a duplicate block can appear. Copy this directory into its own git
repository to see the intended behavior: the bridge then skips the
root-level `AGENTS.md` and the file is injected once (see README).

- This project has no application code — it exists to demo the codex bridge
  of the dsh-bridges plugin.
- JSON payloads are validated with the `json-validator` skill before use.
- Keep hooks in `.codex/hooks/` side-effect-only; their logs land in
  `.codex/hook-logs/`.
