#!/usr/bin/env bash
# Domain verification import (#2207 phase 4), docs/DATA_OWNERSHIP.md.
# usage: mise run domains:import -- <preview|production> [--apply|--verify]
# Dumps D1, dry-runs, and with --apply writes, applies and verifies.
# Dump and SQL hold tokens: they live in tmp/ only for this run.
set -euo pipefail
env=${1:?usage: domains:import -- <preview|production> [--apply|--verify]}
case $env in preview|production) ;; *) echo "bad env: $env" >&2; exit 2 ;; esac
apply=${2:-}
export CLOUDFLARE_ACCOUNT_ID=eefa2cb5c8528a07d7bf8b00a6606dcd
# Same dataset the env's Workers read (services/tenant-directory/wrangler.jsonc).
if [ "$env" = production ]; then ds=production; else ds=development; fi
export IMPORT_SANITY_DATASET=$ds
root=$(git rev-parse --show-toplevel)
cd "$root"
mkdir -p tmp
work=$(mktemp -d tmp/domain-import.XXXXXX)
trap 'rm -rf "$work"' EXIT
w() { (cd services/tenant-directory && npx wrangler "$@"); }
# Binding `DB`, not the name: by name, preview would fall back to the
# account-wide lookup and hit the production database.
dump() {
  w d1 execute DB --env "$env" --remote --json \
    --command "SELECT id, org_id FROM conferences; SELECT * FROM domains" \
    >"$work/d1.json"
}
imp() { fnox exec -- pnpm exec tsx scripts/import-domain-verification.ts --d1 "$work/d1.json" "$@"; }

dump
if [ "$apply" = --verify ]; then imp --verify; exit; fi
if [ "$apply" != --apply ]; then
  imp
  echo "dry run only; rerun with --apply"
  exit 0
fi
imp --write --out "$work"
n=$(grep -c "^INSERT\|^UPDATE" "$work/domain-verification.sql" || true)
if [ "$n" = 0 ]; then echo "nothing to apply"; exit 0; fi
echo "statements: $n"
read -r -p "Apply this plan to $env D1 ($ds dataset)? Type $env: " ok
[ "$ok" = "$env" ] || { echo aborted; exit 1; }
w d1 execute DB --env "$env" --remote --yes --file "$root/$work/domain-verification.sql"
dump
imp --verify
