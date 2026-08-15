#!/bin/sh
# SessionEnd hook: side effect only (the bridge discards its output).
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
mkdir -p "$PROJECT_DIR/.claude/hook-logs"
printf '%s\n' "$(date -u +%H:%M:%SZ) SessionEnd hook fired" >> "$PROJECT_DIR/.claude/hook-logs/session-end.log"
