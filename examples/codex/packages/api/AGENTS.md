# Package instructions for services/api

This nested `AGENTS.md` demonstrates the Codex instruction chain: when the
session working directory is `packages/api/`, the bridge walks from the
repository root down to the cwd and injects this file after the root-level
one, so it can refine broader instructions.

- The API package speaks JSON over HTTP; validate payloads with the
  `json-validator` skill before committing changes here.
- Prefer plain functions over classes in this package.
