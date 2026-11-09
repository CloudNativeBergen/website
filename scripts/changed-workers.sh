#!/usr/bin/env bash
# Reads changed file paths on stdin (one per line) and prints the Workers to
# deploy, in deploy order, one per line (#2191). `--all` ignores stdin and
# prints every Worker. Shared inputs (packages, lockfile, workspace config,
# this workflow and its scripts) deploy everything. The gateway (`api`) is
# printed last whenever anything deploys: it bundles the supergraph composed
# from every subgraph SDL, so it must follow any subgraph change.
set -euo pipefail
# Order matters: tenant-directory binds identity, and the gateway binds all.
SERVICES=(identity tenant-directory content conference program sponsors cfp ticketing)
SHARED='^(packages/|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|package\.json$|services/[^/]+$|\.github/workflows/deploy-workers\.yml$|scripts/(changed-workers|secrets-sync)\.)'
all() { printf '%s\n' "${SERVICES[@]}" api; }
[ "${1:-}" = --all ] && { all; exit 0; }
files=$(cat)
if grep -Eq "$SHARED" <<<"$files"; then all; exit 0; fi
any=
for s in "${SERVICES[@]}"; do
  if grep -q "^services/$s/" <<<"$files"; then echo "$s"; any=1; fi
done
if [ -n "$any" ] || grep -q '^api/' <<<"$files"; then echo api; fi
