/**
 * The PostHog ingestion proxy (issue #1008). Dependency-free on purpose: this
 * module is imported by `next.config.ts`, which runs outside the app's alias
 * resolution, so it must not pull in anything under `@/`.
 */

/**
 * The non-obvious path the browser sends events to. `next.config.ts` rewrites
 * it to PostHog's EU ingestion hosts (`posthogRewrites` below), so the request
 * is first-party and no `posthog.com` hostname appears in the page. Renaming it
 * is a one-line change here; nothing else spells it.
 */
export const POSTHOG_INGEST_PATH = '/pulse'

/** The Next.js `rewrites()` entries for the ingestion proxy. Static assets first. */
export function posthogRewrites(): { source: string; destination: string }[] {
  return [
    {
      source: `${POSTHOG_INGEST_PATH}/static/:path*`,
      destination: 'https://eu-assets.i.posthog.com/static/:path*',
    },
    {
      source: `${POSTHOG_INGEST_PATH}/:path*`,
      destination: 'https://eu.i.posthog.com/:path*',
    },
  ]
}
