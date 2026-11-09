#!/usr/bin/env bash
# Run: bash scripts/changed-workers.test.sh
set -euo pipefail
dir=$(dirname "$0")
check() { # name, expected (space-separated), changed files (newline-separated)
  got=$(printf '%s' "$3" | bash "$dir/changed-workers.sh" | paste -sd ' ' -)
  [ "$got" = "$2" ] || { echo "FAIL $1: got '$got', want '$2'"; exit 1; }
  echo "ok $1: ${2:-<nothing>}"
}
ALL='identity tenant-directory content conference program sponsors notifications cfp ticketing api'
check one-service 'program api' $'services/program/src/index.ts\ndocs/a.md'
check two-services 'identity cfp api' $'services/cfp/x.ts\nservices/identity/migrations/0002.sql'
check gateway-only 'api' 'api/src/gateway.ts'
# cfp binds notifications: the binding target deploys first.
check binding-order 'notifications cfp api' $'services/cfp/a.ts\nservices/notifications/b.ts'
check packages "$ALL" $'packages/tenancy/src/x.ts\nservices/program/a.ts'
check lockfile "$ALL" 'pnpm-lock.yaml'
check workspace "$ALL" 'pnpm-workspace.yaml'
check root-package "$ALL" 'package.json'
check workflow "$ALL" '.github/workflows/deploy-workers.yml'
check service-config "$ALL" 'services/platform-service.cue'
check docs-only '' $'docs/ROADMAP.md\nsrc/app/page.tsx\nsrc/components/Footer.tsx\nsrc/library.ts\nservices.md\napix/a\n.github/workflows/pr-checks.yml'
check src-lib "$ALL" 'src/lib/sponsor/public-groq.ts'
check secrets-sync "$ALL" 'scripts/secrets-sync.ts'
check selector "$ALL" 'scripts/changed-workers.sh'
# --no-renames: moving a file out of a service lists the old path too.
check rename-out 'cfp api' "$(cd "$dir/.." && t=$(mktemp -d) && git init -q "$t" && mkdir -p "$t/services/cfp" && echo x >"$t/services/cfp/a.ts" && git -C "$t" add -A && git -C "$t" -c user.name=t -c user.email=t@t commit -qm a && mkdir -p "$t/other" && git -C "$t" mv services/cfp/a.ts other/a.ts && git -C "$t" -c user.name=t -c user.email=t@t commit -qm b && git -C "$t" diff --name-only --no-renames HEAD~1 HEAD; rm -rf "$t")"
check empty '' ''
got=$(bash "$dir/changed-workers.sh" --all </dev/null | paste -sd ' ' -)
[ "$got" = "$ALL" ] || { echo "FAIL --all: got '$got'"; exit 1; }
echo "ok dispatch --all: $ALL"
# SERVICES must equal the service directories (`ls services/`, minus files).
want=$(cd "$dir/../services" && ls -d */ | tr -d / | sort)
got=$(bash "$dir/changed-workers.sh" --all </dev/null | grep -vx api | sort)
[ "$want" = "$got" ] || { echo "FAIL SERVICES vs services/: want '$want', got '$got'"; exit 1; }
grep -q 'git diff --name-only --no-renames' "$dir/../.github/workflows/deploy-workers.yml" || { echo 'FAIL workflow diff lacks --no-renames'; exit 1; }
# The shared-path filters must be in the workflow's paths.
for f in "src/lib/**" pnpm-workspace.yaml package.json scripts/changed-workers.sh scripts/secrets-sync.ts; do
  [ "$(grep -cF -- "- '$f'" "$dir/../.github/workflows/deploy-workers.yml")" = 2 ] || { echo "FAIL $f not in both paths filters"; exit 1; }
done
echo ok
