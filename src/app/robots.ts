import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

import { buildRobots } from '@/lib/seo/robots'

/**
 * Per-host `robots.txt` (Next.js file convention).
 *
 * The host is derived from the incoming request `Host` header — the same
 * approach `src/app/layout.tsx` uses to derive `metadataBase` — so the
 * emitted `Sitemap:` line is correct for whichever tenant domain is served.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'

  return buildRobots(host)
}
