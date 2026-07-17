import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

import { getConferenceForDomain } from '@/lib/conference/sanity'
import { getSpeakers } from '@/lib/speaker/sanity'
import { buildSitemap } from '@/lib/seo/sitemap'

/**
 * Per-host `sitemap.xml` (Next.js file convention). Resolves the conference for
 * the incoming host — the same derivation `robots.ts` / `layout.tsx` use — then
 * enumerates the public static pages plus each confirmed speaker's profile page.
 * Disallowed/noindex paths are filtered inside `buildSitemap`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host') || 'localhost:3000'

  const { conference } = await getConferenceForDomain(host)

  // No conference resolves for this host → emit only the static public pages.
  if (!conference?._id) {
    return buildSitemap(host)
  }

  const { speakers } = await getSpeakers(conference._id)

  return buildSitemap(host, {
    speakers: (speakers ?? []).map((speaker) => ({
      slug: speaker.slug,
      lastModified: speaker._updatedAt,
    })),
  })
}
