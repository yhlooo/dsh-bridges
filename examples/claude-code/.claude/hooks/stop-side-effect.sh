#!/bin/sh
# Stop hook: side effect only. Runs when the agent finishes a turn;
# output is discarded by the bridge.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
mkdir -p "$PROJECT_DIR/.claude/hook-logs"
printf '%s\n' "$(date -u +%H:%M:%SZ) Stop hook fired (stop_hook_active=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s||"{}").stop_hook_active||"")}catch{console.log("")}})' 2>/dev/null))" >> "$PROJECT_DIR/.claude/hook-logs/stops.log"
