/**
 * The DNS challenge itself — record names, expected values, token minting and
 * the host classification the rest of the feature keys off. Pure and entirely
 * dependency-free (Web Crypto only), so the policy tests can drive it without
 * any network or Sanity — and so it stays EDGE-safe (see the token note below).
 *
 * ## Why DNS TXT and not CNAME or an ACME/HTTP-style flow
 *
 * - **TXT under a `_`-prefixed label** is what every comparable product uses
 *   (Google Workspace, AWS ACM, Vercel, Let's Encrypt DNS-01). Crucially for
 *   #683 it is *idempotently re-checkable*: the record stays published, so we
 *   can re-resolve it on a schedule forever without the tenant lifting a finger.
 *   Continuous re-verification is the whole point here, so a one-shot proof is
 *   not enough.
 * - **CNAME** would also be re-checkable, but a CNAME cannot coexist with other
 *   records at the same name (RFC 1034 §3.6.2). Tenants routinely already have
 *   records at the apex and at `www`, and a delegated `_konf-challenge` CNAME
 *   buys nothing a TXT does not.
 * - **HTTP-01 / serving a file** is *circular* for this threat model. It proves
 *   control of whatever server the hostname currently points at — which, in the
 *   dangling-DNS scenario we are defending against, is the attacker. A record
 *   the tenant must keep in their own zone proves control of the ZONE, which is
 *   the property that actually lapses when a conference domain is not renewed.
 */

import { normalizeDomain } from '@/lib/conference/domains'

/** DNS label the challenge TXT record is published under. */
export const CHALLENGE_LABEL = '_konf-challenge'

/** Prefix carried by the TXT value, so unrelated TXT records at the same name are ignored. */
export const TXT_VALUE_PREFIX = 'konf-domain-verification='

/**
 * Suffixes / forms that can never carry a public DNS proof: loopback and
 * special-use names (RFC 6761/8375) and anything with an explicit port, which
 * only ever appears in local dev `domains[]` entries such as `localhost:3000`.
 */
const DEV_ONLY_SUFFIXES = [
  '.localhost',
  '.local',
  '.test',
  '.internal',
  '.invalid',
  '.example',
]

const DEV_ONLY_EXACT = ['localhost', '127.0.0.1', '[::1]', '::1']

/** True when the entry is a single-label wildcard claim (`*.example.com`). */
export function isWildcardEntry(entry: string): boolean {
  return normalizeDomain(entry).startsWith('*.')
}

/**
 * True when the entry can never be proven through public DNS — a loopback or
 * special-use name, an IP literal, or any entry carrying a `:port`. These are
 * local-development `domains[]` entries. They are EXEMPT from routing
 * enforcement (so `localhost:3000` keeps working) but are NEVER eligible for the
 * redirect allowlist, which must only ever contain proven public hosts.
 */
export function isDevOnlyHost(entry: string): boolean {
  const host = normalizeDomain(entry).replace(/^\*\./, '')
  const withoutPort = host.replace(/:\d+$/, '')
  if (host !== withoutPort) return true
  if (DEV_ONLY_EXACT.includes(withoutPort)) return true
  if (DEV_ONLY_SUFFIXES.some((s) => withoutPort.endsWith(s))) return true
  // Bare IPv4 literal — no zone to publish a TXT record in.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(withoutPort)) return true
  // A single label (no dot) is not a delegable public name.
  return !withoutPort.includes('.')
}

/**
 * The zone the proof must be published in for a `domains[]` entry.
 *
 * A wildcard claim (`*.example.com`) is proven on its BASE domain — control of
 * `example.com`'s zone is exactly what authorises serving every label under it.
 * Returns `null` for entries that cannot be proven ({@link isDevOnlyHost}).
 */
export function verificationBaseHost(entry: string): string | null {
  if (isDevOnlyHost(entry)) return null
  return normalizeDomain(entry).replace(/^\*\./, '')
}

/**
 * The fully-qualified name the tenant publishes the TXT record at, e.g.
 * `_konf-challenge.example.com`. `null` when the entry is not provable.
 */
export function challengeRecordName(entry: string): string | null {
  const base = verificationBaseHost(entry)
  return base ? `${CHALLENGE_LABEL}.${base}` : null
}

/** The exact TXT value we look for at {@link challengeRecordName}. */
export function expectedTxtValue(token: string): string {
  return `${TXT_VALUE_PREFIX}${token}`
}

/**
 * A fresh per-hostname token. 32 bytes of CSPRNG output, base64url so it is a
 * single unquoted TXT string that survives copy/paste into any DNS UI.
 *
 * Uses WEB CRYPTO (`globalThis.crypto`), not `node:crypto`. This module is
 * reachable from `getConferenceForDomain` via the routing gate, and that graph
 * is compiled for the EDGE runtime by the opengraph-image routes — a
 * `node:crypto` import there fails the build outright ("Native module not
 * found"). `getRandomValues` + `btoa` are available in both runtimes.
 */
export function generateVerificationToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Deterministic Sanity `_id` for a hostname's verification record. Sanity ids
 * allow only `[a-zA-Z0-9._-]`, so the two characters a `domains[]` entry may
 * legitimately carry that are not in that set (`*` in a wildcard, `:` before a
 * dev port) are folded to `_`. Neither replacement can collide with a real
 * entry, because `_` is not valid in a hostname label.
 */
export function domainVerificationId(hostname: string): string {
  return `domainVerification.${normalizeDomain(hostname).replace(/[*:]/g, '_')}`
}
