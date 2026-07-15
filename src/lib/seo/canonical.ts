import type { Metadata } from 'next'
import { headers } from 'next/headers'

import type { Conference } from '@/lib/conference/types'
import { getConferenceForDomain } from '@/lib/conference/sanity'

/** The conference shape the canonical helpers actually depend on. */
type ConferenceLike = Pick<Conference, 'domains'> | null | undefined

/**
 * `http` for localhost hosts, `https` everywhere else — mirrors the protocol
 * logic used for `metadataBase` in `src/app/layout.tsx` and `getBaseUrl` in
 * `src/lib/seo/robots.ts`.
 */
function protocolFor(host: string): string {
  return host.includes('localhost') ? 'http' : 'https'
}

/**
 * Resolve the canonical host for a conference edition.
 *
 * Prefers the edition's primary production domain (`domains[0]`, skipping any
 * wildcard patterns such as `*.example.com`) so that preview and apex deploys
 * still emit the production canonical host. Falls back to the request host when
 * no conference resolved — this keeps localhost and unknown preview hosts
 * working rather than pointing them at a domain we cannot know.
 */
export function canonicalHost(
  conference: ConferenceLike,
  requestHost: string,
): string {
  const primary = conference?.domains?.find(
    (domain) => domain && !domain.includes('*'),
  )
  return primary || requestHost || 'localhost:3000'
}

/**
 * Absolute origin (`https://host`) for the conference's canonical host.
 */
export function canonicalOrigin(
  conference: ConferenceLike,
  requestHost: string,
): string {
  const host = canonicalHost(conference, requestHost)
  return `${protocolFor(host)}://${host}`
}

/**
 * Build an absolute canonical URL for `path` on the conference's canonical
 * host. The path is normalized to a single leading slash; the site root (`/`)
 * yields the bare origin with no trailing slash.
 */
export function canonicalUrl(
  conference: ConferenceLike,
  requestHost: string,
  path: string,
): string {
  const origin = canonicalOrigin(conference, requestHost)
  if (!path || path === '/') {
    return origin
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${origin}${normalizedPath}`
}

/**
 * Server helper that resolves the current request host and conference edition,
 * returning the `alternates` object (self-referential canonical) to merge into
 * a route's `metadata` / `generateMetadata`. Use this from pages that do not
 * already have the conference in hand; pages that already fetched it should
 * call {@link canonicalUrl} directly to avoid a redundant lookup.
 */
export async function canonicalAlternates(
  path: string,
): Promise<NonNullable<Metadata['alternates']>> {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  const { conference } = await getConferenceForDomain(host)
  return { canonical: canonicalUrl(conference, host, path) }
}
