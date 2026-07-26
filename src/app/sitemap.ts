import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

import { getConferenceForDomain } from '@/lib/conference/sanity'
import { getDiscoveryVisibilityForDomain } from '@/lib/conference/visibility'
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

  // FAIL-CLOSED gate first (minimal projection): an unknown host or a
  // transient read failure emits an EMPTY sitemap — never the permissive one —
  // so an unlisted tenant can't leak its discovery surface during an outage,
  // and the unknown-host platform landing contributes no URLs.
  const { discoverable } = await getDiscoveryVisibilityForDomain(host)
  if (!discoverable) {
    return buildSitemap(host, { unlisted: true })
  }

  const { conference } = await getConferenceForDomain(host)
  if (!conference?._id) {
    // The light gate said live but the full read failed (transient) — stay
    // conservative rather than emitting a partial sitemap.
    return buildSitemap(host, { unlisted: true })
  }

  const { speakers } = await getSpeakers(conference._id)

  return buildSitemap(host, {
    speakers: (speakers ?? []).map((speaker) => ({
      slug: speaker.slug,
      lastModified: speaker._updatedAt,
    })),
  })
}
