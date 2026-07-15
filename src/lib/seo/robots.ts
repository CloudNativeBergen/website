import type { MetadataRoute } from 'next'

/**
 * Path prefixes that should be hidden from search-engine crawlers.
 *
 * These map to private organizer portals, token-gated flows, auth/CLI
 * handshakes, API endpoints and thin/utility pages that provide no public
 * SEO value. Every entry has been verified against the App Router tree in
 * `src/app`.
 *
 * IMPORTANT: The bare `/cfp` landing page (`src/app/(main)/cfp`) and the
 * public sponsor pages (`/sponsor`, `/sponsor/terms`) are intentionally
 * left crawlable — only their private sub-paths are disallowed.
 */
export const DISALLOWED_PATHS = [
  '/admin', // (admin) organizer dashboard
  '/api', // route handlers / server endpoints
  '/stream', // (stream) live stream portal
  '/workshop', // (workshop) attendee portal
  '/signin', // auth entry page
  '/cli', // CLI login handshake
  '/invitation', // token-gated invitation responses
  '/error', // thin error page
  '/css-test', // internal style test page
  // Token-gated sponsor flows (public /sponsor and /sponsor/terms stay allowed)
  '/sponsor/contract/sign/',
  '/sponsor/onboarding/',
  '/sponsor/portal/',
  // Private CFP portal sub-paths. The bare /cfp landing page is public, so we
  // only disallow the authenticated portal routes that live under (cfp)/cfp.
  '/cfp/admin',
  '/cfp/expense',
  '/cfp/list',
  '/cfp/profile',
  '/cfp/proposal',
  '/cfp/submit',
  '/cfp/workshop',
] as const

/**
 * Build the absolute origin for a given `host` header value, mirroring the
 * protocol logic used for `metadataBase` in `src/app/layout.tsx`.
 */
export function getBaseUrl(host: string): string {
  const protocol = host.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${host}`
}

/**
 * Produce the per-host robots policy: allow general crawling, disallow the
 * private/portal/token/api prefixes, and point at the host's sitemap.
 */
export function buildRobots(host: string): MetadataRoute.Robots {
  const baseUrl = getBaseUrl(host)

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [...DISALLOWED_PATHS],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
