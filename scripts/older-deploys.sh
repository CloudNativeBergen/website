#!/usr/bin/env bash
# Reads a `gh api .../workflows/<id>/runs` JSON document on stdin and prints
# the ids of runs that are older than $RUN_ID and still waiting for approval or
# queued. Never prints $RUN_ID or a run that is in_progress (mid-migration).
set -euo pipefail
: "${RUN_ID:?RUN_ID required}"
jq -r --argjson cur "$RUN_ID" '.workflow_runs[]
  | select(.id < $cur and (.status == "waiting" or .status == "queued" or .status == "pending"))
  | .id'
