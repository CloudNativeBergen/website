import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { OG_IMAGE_SIZE } from '@/lib/og/styles'
import { PLATFORM_NAME } from '@/lib/branding/platform'

/**
 * Conference-driven `generateImageMetadata` for an OpenGraph image route
 * (go-live gate G2, E2). The `alt` text previously hardcoded a single tenant's
 * brand; this resolves the current-domain conference title (neutral platform
 * fallback) and lets each route template its own alt around it.
 *
 * Returns the single-entry array Next.js expects; the route's default `Image`
 * export renders the pixels and may ignore the passed `id`.
 */
export async function ogImageMetadata(buildAlt: (brand: string) => string) {
  let brand = PLATFORM_NAME
  try {
    const { conference } = await getConferenceForCurrentDomain()
    brand = conference?.title?.trim() || PLATFORM_NAME
  } catch {
    // Keep the neutral fallback on any resolution error.
  }
  return [
    {
      id: 'og',
      alt: buildAlt(brand),
      size: OG_IMAGE_SIZE,
      contentType: 'image/png',
    },
  ]
}
