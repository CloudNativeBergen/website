#!/usr/bin/env bash
# Rotate the gateway envelope key pair for one environment (#1927).
#   scripts/rotate-gateway-key.sh <preview|production>
# Generates an Ed25519 pair, stores both halves in fnox, then sets
#   ENVELOPE_PRIVATE_KEY on the gateway (api/) and
#   GATEWAY_PUBLIC_KEY on conference, content, identity, program, sponsors, cfp and tenant-directory.
# Key material goes only through pipes and temp files in a 0700 dir; it is
# never printed or passed as an argument. Run from the repo root.
#
# Not zero-downtime: the gateway and subgraphs switch one Worker at a time, so
# envelopes fail verification in between. Run it in a quiet window.
set -euo pipefail

env_name="${1:-}"
case "$env_name" in
  preview | production) ;;
  *) echo "usage: $0 <preview|production>" >&2; exit 2 ;;
esac
# Every wrangler call below targets the RunKonf account, as secrets-sync.ts
# does: an exported CLOUDFLARE_ACCOUNT_ID for another account (a PoC one) once
# sent production writes to the wrong place, or the right place by surprise.
RUNKONF_ACCOUNT_ID=eefa2cb5c8528a07d7bf8b00a6606dcd
if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ "$CLOUDFLARE_ACCOUNT_ID" != "$RUNKONF_ACCOUNT_ID" ]; then
  echo "CLOUDFLARE_ACCOUNT_ID is set to another account; this script writes only to the RunKonf account $RUNKONF_ACCOUNT_ID. Unset it or set it to that id." >&2
  exit 1
fi
export CLOUDFLARE_ACCOUNT_ID="$RUNKONF_ACCOUNT_ID"

upper="$(printf '%s' "$env_name" | tr '[:lower:]' '[:upper:]')"
priv_name="KONF_${upper}_GATEWAY_PRIVATE_KEY"
pub_name="KONF_${upper}_GATEWAY_PUBLIC_KEY"

if [ "$env_name" = production ]; then
  echo "Rotating the PRODUCTION gateway key. Type 'production' to continue:" >&2
  read -r answer
  [ "$answer" = production ] || { echo "aborted" >&2; exit 1; }
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
chmod 700 "$tmp"

openssl genpkey -algorithm ed25519 -out "$tmp/priv.pem" 2>/dev/null
openssl pkey -in "$tmp/priv.pem" -pubout -out "$tmp/pub.pem" 2>/dev/null

# Source of truth first: if a Worker push fails halfway, the key is not lost.
fnox set "$priv_name" <"$tmp/priv.pem" >/dev/null
fnox set "$pub_name" <"$tmp/pub.pem" >/dev/null

put() { # dir secret file
  (cd "$1" && npx wrangler secret put "$2" --env "$env_name" <"$3" >/dev/null)
}

put api ENVELOPE_PRIVATE_KEY "$tmp/priv.pem"
for svc in conference content identity program sponsors cfp tenant-directory; do
  put "services/$svc" GATEWAY_PUBLIC_KEY "$tmp/pub.pem"
done

echo "Rotated $env_name: $priv_name and $pub_name stored in fnox; set on api and 6 subgraphs."
