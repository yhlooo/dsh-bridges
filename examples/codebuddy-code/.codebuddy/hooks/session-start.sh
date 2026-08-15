#!/bin/sh
# SessionStart hook (CodeBuddy Code contract: JSON payload on stdin).
# Plain stdout with exit code 0 is injected as context before the first
# user prompt of the session.
echo "Session started in $(pwd) at $(date -u +%H:%M:%SZ). Context contributed by the codebuddy-code SessionStart example hook."
