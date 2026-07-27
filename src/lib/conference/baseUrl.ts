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
  const entry = findOutboundDomain(conference)

  if (entry) {
    // domains[] stores bare hostnames, but strip a defensive scheme so a
    // mis-stored `https://x` can never become `https://https://x`.
    const domain = normalizeDomain(entry.replace(/^https?:\/\//i, '')).replace(
      /\/+$/,
      '',
    )
    const protocol = isLocalhostDomain(domain)
      ? 'http'
      : protocolForDomain(domain)
    // Enforce the origin contract like platformBaseUrl(): a mis-stored path
    // segment ("example.com/foo") must not leak into joined outbound URLs.
    try {
      return new URL(`${protocol}://${domain}`).origin
    } catch {
      console.error(
        `[baseUrl] conference "${conference?.title ?? 'unknown'}" has an invalid domains[] entry "${entry}"; falling back to the platform base URL.`,
      )
      return platformBaseUrl()
    }
  }

  console.error(
    `[baseUrl] conference "${conference?.title ?? 'unknown'}" has no usable domains[]; ` +
      'falling back to the platform base URL for outbound links. This is a ' +
      'misconfiguration — add a primary domain to this conference.',
  )
  return platformBaseUrl()
}

/**
 * First `domains[]` entry usable for OUTBOUND links: non-empty and not a
 * wildcard routing entry (`*.example.com` matches inbound hosts but is not a
 * concrete host an email link can point at).
 */
function findOutboundDomain(
  conference: { domains?: readonly string[] | null } | null | undefined,
): string | undefined {
  return conference?.domains?.find(
    (d): d is string =>
      typeof d === 'string' && d.trim().length > 0 && !d.includes('*'),
  )
}

/**
 * Whether {@link conferenceBaseUrl} would derive a TENANT origin (vs falling
 * back to the platform). Call sites that deliberately want `undefined`/`''`
 * instead of a platform fallback must use THIS guard — checking
 * `domains?.[0]` disagrees with the helper when the first entry is blank or a
 * wildcard and a later entry is usable.
 */
export function hasConferenceDomain(
  conference: { domains?: readonly string[] | null } | null | undefined,
): boolean {
  return findOutboundDomain(conference) !== undefined
}
