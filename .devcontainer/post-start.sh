#!/bin/sh
# Start the dsh web UI once, in the workspace folder (idempotent).
#
# Invoked as the devcontainer postStartCommand. Lifecycle hooks run with the
# workspace folder as cwd, which becomes dsh's default workspace root.

set -e

# Liveness check: skip when something already listens on 127.0.0.1:3080.
# A pid file is deliberately not used for this: pids are reused after a
# container restart, which made the previous guard skip startup wrongly.
if node -e "require('net').connect(3080, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))" 2>/dev/null; then
  echo "dsh web: already listening on http://127.0.0.1:3080"
  exit 0
fi

# Fully detach dsh from this lifecycle session so the tool that runs the hook
# cannot take it down when the hook completes. The pid file is for debugging
# only, not for the liveness check above.
setsid dsh web >>/tmp/dsh-web.log 2>&1 </dev/null &
echo $! >/tmp/dsh-web.pid
echo "dsh web: starting in background (log: /tmp/dsh-web.log)"
