# Example project instructions (opencode)

This `AGENTS.md` sits at the workspace root, so DeepSeek Harness loads it
itself — the opencode bridge deliberately skips the cwd-level file to avoid
a duplicate block.

- This project has no application code — it exists to demo the opencode
  bridge of the dsh-bridges plugin.
- Keep documentation in `docs/`; the opencode `instructions` entries pull
  it into every session automatically.
- Skill directories must match their frontmatter `name` exactly, or the
  bridge drops them with a warning (same as opencode).
