#!/usr/bin/env bash
# Run: bash scripts/older-deploys.test.sh
set -euo pipefail
out=$(RUN_ID=100 bash "$(dirname "$0")/older-deploys.sh" <<'J' | tr '\n' ' '
{"workflow_runs":[
 {"id":100,"status":"queued"},{"id":101,"status":"waiting"},
 {"id":99,"status":"waiting"},{"id":98,"status":"queued"},
 {"id":97,"status":"in_progress"},{"id":96,"status":"completed"}]}
J
)
[ "$out" = "99 98 " ] || { echo "FAIL: got '$out'"; exit 1; }
echo ok
