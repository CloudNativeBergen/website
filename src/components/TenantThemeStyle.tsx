import { ThemeStyle } from '@/components/ThemeStyle'
import { isUnknownHost } from '@/lib/conference/guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type { Conference } from '@/lib/conference/types'

/**
 * THE SEAM for per-tenant theming (THEMING L1): one server component that turns
 * "the conference for THIS request host" into the injected `--brand-*` block.
 *
 * It is rendered exactly once per PUBLIC route-group layout — `(main)` and
 * `(workshop)` (via the shared `Layout`), `(stream)`, `(public)` and the root
 * `not-found` page. It is deliberately NOT rendered by the root layout: hoisting
 * it there would also theme the `(cfp)` speaker portal and `(admin)`, which must
 * stay platform-neutral (a speaker submitting to five conferences gets one
 * familiar interface, and admin uses the palette as FUNCTIONAL colour — status,
 * alerts, charts — where a tenant hue would collide with colour that carries
 * meaning).
 *
 * Two call shapes, one behaviour:
 *  - `<TenantThemeStyle conference={conference} />` — for layouts that ALREADY
 *    resolved the conference for their own reasons. No extra query is issued.
 *  - `<TenantThemeStyle />` — for layouts that do not otherwise need the
 *    conference; it resolves the host itself through
 *    `getConferenceForCurrentDomain`, whose read is `'use cache'` and carries
 *    both `domain:<host>` and `conferenceTag(id)`, so a branding save
 *    invalidates the injected theme with the rest of that tenant's surface.
 *
 * FAIL CLOSED: resolution is host-scoped and the ONLY source of the theme. When
 * the host resolves to no conference the component renders NOTHING and the site
 * falls back to the house palette in CSS — it never reaches for "some"
 * conference. (`getConferenceForDomain` returns a truthy `{} as Conference` for
 * an unknown host, so the check goes through the canonical `isUnknownHost`
 * guard rather than a bare falsiness test that would never fire.)
 */
export async function TenantThemeStyle({
  conference,
}: {
  conference?: Conference | null
} = {}) {
  const resolved =
    conference ?? (await getConferenceForCurrentDomain()).conference

  // Unknown host → no tenant theme. Never inherit another tenant's colours.
  if (!resolved || isUnknownHost({ conference: resolved })) return null

  return <ThemeStyle theme={resolved.theme} />
}
