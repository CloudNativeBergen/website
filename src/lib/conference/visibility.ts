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
