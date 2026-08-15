#!/bin/sh
# Stop hook: side effect only. Runs when the agent finishes a turn;
# output is discarded by the bridge.
PROJECT_DIR="${CODEBUDDY_PROJECT_DIR:-$(pwd)}"
mkdir -p "$PROJECT_DIR/.codebuddy/hook-logs"
printf '%s\n' "$(date -u +%H:%M:%SZ) Stop hook fired" >> "$PROJECT_DIR/.codebuddy/hook-logs/stops.log"
