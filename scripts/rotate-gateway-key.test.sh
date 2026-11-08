#!/usr/bin/env bash
# Run: bash scripts/rotate-gateway-key.test.sh
# The rotate script refuses a foreign CLOUDFLARE_ACCOUNT_ID before it
# generates, stores or pushes anything.
set -euo pipefail
dir=$(dirname "$0")
bin=$(mktemp -d)
trap 'rm -rf "$bin"' EXIT
# Any call to these would mean the guard came too late.
for c in openssl fnox npx; do
  printf '#!/bin/sh\necho "called %s" >&2\nexit 99\n' "$c" >"$bin/$c"
  chmod +x "$bin/$c"
done
set +e
out=$(PATH="$bin:$PATH" CLOUDFLARE_ACCOUNT_ID=bf423d08017f82ace4019bc367338981 \
  bash "$dir/rotate-gateway-key.sh" preview 2>&1)
code=$?
set -e
[ "$code" = 1 ] || { echo "FAIL: exit $code, want 1: $out"; exit 1; }
case "$out" in
  *"another account"*) ;;
  *) echo "FAIL: no refusal message: $out"; exit 1 ;;
esac
case "$out" in
  *called*) echo "FAIL: a tool ran before the guard: $out"; exit 1 ;;
esac
echo ok
