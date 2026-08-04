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
 *
 * NOTE ON DYNAMISM. Unlike the routes' default `Image` export, this function
 * must NOT call `connection()`: Next treats `generateImageMetadata` like
 * `generateStaticParams` and runs it at build time to enumerate the image ids,
 * where there is no HTTP request and `connection()` is a hard error. The host
 * lookup below is therefore best-effort — at build time it cannot resolve and
 * the `catch` yields the neutral platform name, while at request time (when the
 * page's `<meta>` tags are rendered) it resolves the real tenant. That is safe
 * because only ALT TEXT is at stake here; the tenant-specific pixels are
 * rendered by the route's `Image` export, which is explicitly per-request.
 *
 * DO NOT USE THIS ON A ROUTE UNDER A DYNAMIC SEGMENT. The `[__metadata_id__]`
 * segment this introduces, combined with an unenumerated parent param such as
 * `[slug]`, makes Next classify the route STATIC and try to render it without a
 * request — which a host-resolving OG route can only answer with a 500 or with
 * a cached, cross-tenant response. `speaker/[slug]/opengraph-image.tsx` exports
 * a static `alt` instead; see the note there.
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
