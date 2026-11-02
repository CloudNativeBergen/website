#!/usr/bin/env bash
# Fails when generated service files drift from services/platform-service.cue:
# re-scaffolds every service, then requires a clean services/ tree.
set -euo pipefail

for f in services/*/service.cue; do
  tsx scripts/scaffold-service.ts "$(basename "$(dirname "$f")")"
done

status=$(git status --porcelain -- services)
if [ -n "$status" ]; then
  echo "Scaffold drift: re-run pnpm scaffold:service <name> and commit." >&2
  echo "$status" >&2
  git diff -- services >&2
  exit 1
fi
