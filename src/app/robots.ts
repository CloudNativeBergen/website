import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

import { buildRobots } from '@/lib/seo/robots'
import { getDiscoveryVisibilityForDomain } from '@/lib/conference/visibility'

/**
 * Per-host `robots.txt` (Next.js file convention).
 *
 * The host is derived from the incoming request `Host` header — the same
 * approach `src/app/layout.tsx` uses to derive `metadataBase` — so the
 * emitted `Sitemap:` line is correct for whichever tenant domain is served.
 *
 * The conference is resolved for the host (same derivation as `sitemap.ts` /
 * `layout.tsx`) so an UNLISTED tenant serves a blanket `Disallow: /` — the
 * robots equivalent of noindex — instead of the normal crawl policy.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'

  // FAIL-CLOSED + minimal projection: an unknown host or transient read
  // failure must never serve the permissive crawl policy (which would leak an
  // unlisted tenant's discovery surface during an outage), and robots.txt has
  // no business fetching the full conference document for one field.
  const { discoverable } = await getDiscoveryVisibilityForDomain(host)

  return buildRobots(host, { unlisted: !discoverable })
}
