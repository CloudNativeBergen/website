import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

import { buildRobots } from '@/lib/seo/robots'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { isConferenceUnlisted } from '@/lib/conference/visibility'

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

  const { conference } = await getConferenceForDomain(host)

  return buildRobots(host, { unlisted: isConferenceUnlisted(conference) })
}
