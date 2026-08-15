#!/bin/sh
# SessionStart hook (Claude Code contract: JSON payload on stdin).
# Plain stdout with exit code 0 is injected as context before the first
# user prompt of the session.
echo "Session started in $(pwd) at $(date -u +%H:%M:%SZ). Context contributed by the claude-code SessionStart example hook."
