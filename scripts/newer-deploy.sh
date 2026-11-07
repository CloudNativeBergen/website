#!/usr/bin/env bash
# Reads a `gh api .../compare/<this sha>...main` JSON document on stdin and
# prints the newest commit on main after this one that touches a Worker path
# (so its own deploy run deploys everything). Prints nothing when this commit
# is still the newest such change. `--paths` prints the paths it watches, which
# must equal the `push.paths` of deploy-workers.yml (scripts/newer-deploy.test.sh).
set -euo pipefail
PATHS=('api/**' 'services/**' 'packages/**' 'pnpm-lock.yaml' '.github/workflows/deploy-workers.yml')
if [ "${1:-}" = --paths ]; then
  printf '%s\n' "${PATHS[@]}"
  exit 0
fi
# Globs to one anchored regex: `dir/**` is a prefix, anything else exact.
re=$(printf '%s\n' "${PATHS[@]}" | sed -e 's/[.]/\\./g' -e 's/\/\*\*$/\//' -e 's/^/^/' -e '/\/$/!s/$/$/' | paste -sd '|' -)
jq -r --arg re "$re" '
  select(.status == "ahead" or .status == "diverged")
  | if any(.files[]?; .filename | test($re)) then .commits[-1].sha else empty end'
