import { normalizeDomain } from './domains'
import {
  isLocalhostDomain,
  protocolForDomain,
} from '@/lib/environment/localhost'
import { platformBaseUrl } from '@/lib/branding/platform'

/**
 * Canonical base-URL derivation for TENANT-scoped outbound / stored content
 * (emails, notification click targets, QR codes, credential URLs, …).
 *
 * This is a MULTI-TENANT platform: the correct origin for a conference's own
 * links is that conference's OWN primary domain — never a single global env var
 * (which would be wrong for every tenant but one) and never a `localhost`
 * fallback (which leaks into production email when an env var is absent in the
 * send context). The rule mirrors `resolveConferenceFrom` in
 * `src/lib/email/from.ts`: prefer the conference's own field, and degrade only
 * to a LOUD, brand-neutral platform default.
 *
 * Behaviour:
 *   - Uses the first non-empty `conference.domains[]` entry, normalized
 *     ({@link normalizeDomain}) and given the right scheme
 *     ({@link protocolForDomain} → `http` only for an actual `localhost`/dev
 *     domain, `https` for every real host).
 *   - When the conference has NO domain (a genuine misconfiguration — routing
 *     requires one), logs via `console.error` and falls back to the
 *     {@link platformBaseUrl}, which itself never yields `localhost` in
 *     production.
 *
 * Returns an origin with NO trailing slash; callers append their own path.
 *
 * Kept pure and client-safe (no server-only imports) so component and server
 * code can share it.
 */
export function conferenceBaseUrl(
  conference:
    | { title?: string | null; domains?: readonly string[] | null }
    | null
    | undefined,
): string {
  const origin = findOutboundOrigin(conference)
  if (origin) return origin

  console.error(
    `[baseUrl] conference "${conference?.title ?? 'unknown'}" has no usable domains[]; ` +
      'falling back to the platform base URL for outbound links. This is a ' +
      'misconfiguration — add a primary domain to this conference.',
  )
  return platformBaseUrl()
}

/**
 * Derive the outbound ORIGIN for one `domains[]` entry, or null when the entry
 * cannot yield one: blank, a wildcard routing entry (`*.example.com` matches
 * inbound hosts but is not a concrete host an email link can point at), or
 * unparseable after normalization. Normalizes BEFORE stripping the defensive
 * scheme so a mis-stored `"  HTTPS://X.com "` still sheds it, and returns
 * `URL.origin` so a mis-stored path can never leak into joined outbound URLs.
 */
function deriveOrigin(entry: string): string | null {
  if (entry.includes('*')) return null
  const domain = normalizeDomain(entry)
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
  if (!domain) return null
  const protocol = isLocalhostDomain(domain)
    ? 'http'
    : protocolForDomain(domain)
  try {
    return new URL(`${protocol}://${domain}`).origin
  } catch {
    return null
  }
}

/** First `domains[]` entry that derives a usable outbound origin. */
function findOutboundOrigin(
  conference: { domains?: readonly string[] | null } | null | undefined,
): string | null {
  for (const d of conference?.domains ?? []) {
    if (typeof d !== 'string') continue
    const origin = deriveOrigin(d)
    if (origin) return origin
  }
  return null
}

/**
 * Whether {@link conferenceBaseUrl} would derive a TENANT origin (vs falling
 * back to the platform). Shares the exact derivation with conferenceBaseUrl()
 * — including parseability — so a guard that intends to suppress the platform
 * fallback can never be satisfied by an entry the derivation would reject.
 */
export function hasConferenceDomain(
  conference: { domains?: readonly string[] | null } | null | undefined,
): boolean {
  return findOutboundOrigin(conference) !== null
}
