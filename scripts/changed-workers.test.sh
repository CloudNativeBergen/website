#!/usr/bin/env bash
# Run: bash scripts/changed-workers.test.sh
set -euo pipefail
dir=$(dirname "$0")
check() { # name, expected (space-separated), changed files (newline-separated)
  got=$(printf '%s' "$3" | bash "$dir/changed-workers.sh" | paste -sd ' ' -)
  [ "$got" = "$2" ] || { echo "FAIL $1: got '$got', want '$2'"; exit 1; }
  echo "ok $1: ${2:-<nothing>}"
}
ALL='identity tenant-directory content conference program sponsors cfp ticketing api'
check one-service 'program api' $'services/program/src/index.ts\ndocs/a.md'
check two-services 'identity cfp api' $'services/cfp/x.ts\nservices/identity/migrations/0002.sql'
check gateway-only 'api' 'api/src/gateway.ts'
check packages "$ALL" $'packages/tenancy/src/x.ts\nservices/program/a.ts'
check lockfile "$ALL" 'pnpm-lock.yaml'
check workflow "$ALL" '.github/workflows/deploy-workers.yml'
check service-config "$ALL" 'services/platform-service.cue'
check docs-only '' $'docs/ROADMAP.md\nsrc/app/page.tsx\nservices.md\napix/a\n.github/workflows/pr-checks.yml'
check empty '' ''
got=$(bash "$dir/changed-workers.sh" --all </dev/null | paste -sd ' ' -)
[ "$got" = "$ALL" ] || { echo "FAIL --all: got '$got'"; exit 1; }
echo "ok dispatch --all: $ALL"
# Every service directory must be in the deploy list.
for d in "$dir"/../services/*/; do
  s=$(basename "$d")
  bash "$dir/changed-workers.sh" --all </dev/null | grep -qx "$s" || { echo "FAIL services/$s missing from SERVICES"; exit 1; }
done
echo ok
