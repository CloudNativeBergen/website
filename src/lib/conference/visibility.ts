/**
 * Conference visibility state (M0 trial/unlisted groundwork).
 *
 * A conference is either:
 *   - `live`     — publicly listed and indexed (sitemap, robots-allowed, OG).
 *   - `unlisted` — RESOLVES and renders for direct visitors (an organizer must
 *                  be able to preview their work and share the link), but is
 *                  excluded from every discovery surface: the sitemap emits
 *                  nothing, robots serves a blanket disallow, and page metadata
 *                  carries `noindex`.
 *
 * ABSENT-MEANS-LIVE: the `visibility` field is nullable on legacy documents (no
 * backfill is strictly required — every existing conference is live). Server
 * code therefore treats an ABSENT/unknown value as `live`; only the explicit
 * string `'unlisted'` opts a conference out of discovery. `unlisted` is
 * deliberately NOT `private` — the site is still reachable by direct link.
 */

import { cacheLife, cacheTag } from 'next/cache'
import { clientReadCached } from '@/lib/sanity/client'
import { domainTag } from '@/lib/cache/tags'
import { normalizeDomain, wildcardFormForHost } from '@/lib/conference/domains'

export type ConferenceVisibility = 'unlisted' | 'live'

/** The two visibility values, in Studio-list / onboarding order (trial first). */
export const CONFERENCE_VISIBILITY_VALUES: readonly ConferenceVisibility[] = [
  'unlisted',
  'live',
] as const

/** Minimal shape needed to resolve visibility — just the (optional) field. */
type WithVisibility = { visibility?: string | null } | null | undefined

/**
 * Resolve the EFFECTIVE visibility of a conference. Anything other than the
 * explicit string `'unlisted'` — including absent/null/unknown — resolves to
 * `'live'`, so every legacy conference (which carries no field) stays public.
 */
export function resolveConferenceVisibility(
  conference: WithVisibility,
): ConferenceVisibility {
  return conference?.visibility === 'unlisted' ? 'unlisted' : 'live'
}

/**
 * True when a conference is `unlisted` (excluded from discovery surfaces).
 * Absent/unknown → `false` (treated as live).
 */
export function isConferenceUnlisted(conference: WithVisibility): boolean {
  return resolveConferenceVisibility(conference) === 'unlisted'
}

/**
 * Discovery-surface visibility for a HOST, resolved with a MINIMAL projection
 * ({_id, visibility}) and FAIL-CLOSED semantics: an unknown host or a
 * transient read failure reports `discoverable: false`, so robots/sitemap can
 * never leak an unlisted (or unresolvable) tenant's discovery surface during
 * an outage. Cached per domain via the same tags as the full conference read.
 */
export async function getDiscoveryVisibilityForDomain(
  host: string,
): Promise<{ discoverable: boolean }> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:conferences')
  cacheTag(domainTag(normalizeDomain(host)))
  try {
    const row = await clientReadCached.fetch<{
      _id: string
      visibility?: string | null
    } | null>(
      `*[_type == "conference" && ($domain in domains || $wildcardSubdomain in domains)][0]{ _id, visibility }`,
      {
        domain: normalizeDomain(host),
        wildcardSubdomain: wildcardFormForHost(normalizeDomain(host)) ?? '',
      },
    )
    if (!row?._id) return { discoverable: false }
    return { discoverable: resolveConferenceVisibility(row) === 'live' }
  } catch {
    return { discoverable: false }
  }
}
