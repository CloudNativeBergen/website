#!/usr/bin/env bash
# Run: bash scripts/newer-deploy.test.sh
set -euo pipefail
dir=$(dirname "$0")
check() { # name, expected, json
  got=$(bash "$dir/newer-deploy.sh" <<<"$3")
  [ "$got" = "$2" ] || { echo "FAIL $1: got '$got', want '$2'"; exit 1; }
}
check identical '' '{"status":"identical","files":[],"commits":[]}'
check behind '' '{"status":"behind","files":[{"filename":"api/x.ts"}],"commits":[]}'
check docs-only '' '{"status":"ahead","files":[{"filename":"docs/ROADMAP.md"},{"filename":"src/app/page.tsx"},{"filename":"apix/a"},{"filename":"docs/api/x.md"},{"filename":"src/app/services/x.ts"},{"filename":"pnpm-lock.yamlx"}],"commits":[{"sha":"b"}]}'
check service 'c' '{"status":"ahead","files":[{"filename":"docs/a.md"},{"filename":"services/identity/src/x.ts"}],"commits":[{"sha":"b"},{"sha":"c"}]}'
check lockfile 'c' '{"status":"ahead","files":[{"filename":"pnpm-lock.yaml"}],"commits":[{"sha":"c"}]}'
check workspace 'c' '{"status":"ahead","files":[{"filename":"pnpm-workspace.yaml"}],"commits":[{"sha":"c"}]}'
check root-package 'c' '{"status":"ahead","files":[{"filename":"package.json"}],"commits":[{"sha":"c"}]}'
check nested-package '' '{"status":"ahead","files":[{"filename":"cli/package.json"}],"commits":[{"sha":"c"}]}'
check src-lib 'c' '{"status":"ahead","files":[{"filename":"src/lib/speaker/image-groq.ts"}],"commits":[{"sha":"c"}]}'
check workflow 'c' '{"status":"diverged","files":[{"filename":".github/workflows/deploy-workers.yml"}],"commits":[{"sha":"c"}]}'
check other-workflow '' '{"status":"ahead","files":[{"filename":".github/workflows/pr-checks.yml"}],"commits":[{"sha":"c"}]}'
# The watched paths must be the workflow's push paths, in any order.
want=$(awk '/^  push:/{p=1;next} p&&/^    paths:/{q=1;next} q&&/^      - /{gsub(/^      - |'"'"'/,"");print;next} q{exit}' "$dir/../.github/workflows/deploy-workers.yml" | sort)
got=$(bash "$dir/newer-deploy.sh" --paths | sort)
[ -n "$want" ] && [ "$want" = "$got" ] || { echo "FAIL paths: workflow '$want' vs script '$got'"; exit 1; }
echo ok
