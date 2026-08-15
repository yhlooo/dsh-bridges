#!/usr/bin/env node
// SessionStart hook (Codex contract: JSON payload on stdin; commands run
// with the session cwd, so relative paths resolve inside the project).
// Plain stdout with exit code 0 is injected as context.
console.log(
  `Session started in ${process.cwd()} at ${new Date().toISOString()}. Context contributed by the codex SessionStart example hook.`,
)
