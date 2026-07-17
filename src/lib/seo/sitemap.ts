import type { MetadataRoute } from 'next'
import { DISALLOWED_PATHS, getBaseUrl } from './robots'

/**
 * Crawlable, public static paths included in the sitemap. Curated (not derived
 * from the filesystem) so private/thin routes are never emitted by accident;
 * every entry is cross-checked against `DISALLOWED_PATHS` at build time via
 * {@link isDisallowed}. `''` is the home page.
 */
export const PUBLIC_STATIC_PATHS = [
  '',
  '/program',
  '/speaker',
  '/sponsor',
  '/sponsor/terms',
  '/tickets',
  '/conduct',
  '/privacy',
  '/terms',
  '/info',
  '/install',
  '/cfp',
  '/volunteer',
] as const

/** A speaker whose public profile page (`/speaker/<slug>`) should be listed. */
export interface SitemapSpeaker {
  slug?: string
  /** ISO timestamp for `<lastmod>` (Sanity `_updatedAt`). */
  lastModified?: string
}

export interface BuildSitemapInput {
  speakers?: SitemapSpeaker[]
  /** Fallback `<lastmod>` for static pages (e.g. the conference `_updatedAt`). */
  lastModified?: string | Date
}

/**
 * True when `path` is (or lives under) a `robots.ts`-disallowed prefix. Trailing
 * slashes on disallow entries are normalised so `/cfp` (public) is NOT matched
 * by the `/cfp/list` disallow, while `/cfp/list` itself is.
 */
export function isDisallowed(path: string): boolean {
  return DISALLOWED_PATHS.some((raw) => {
    const prefix = raw.replace(/\/$/, '')
    return path === prefix || path.startsWith(`${prefix}/`)
  })
}

/**
 * Build the per-host sitemap: the curated public static pages plus one entry per
 * public speaker profile, all on `host`'s origin. Any path that `robots.ts`
 * disallows is filtered out (defence-in-depth), so no disallowed/noindex URL can
 * appear even if the static list drifts.
 */
export function buildSitemap(
  host: string,
  { speakers = [], lastModified }: BuildSitemapInput = {},
): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl(host)

  const staticEntries: MetadataRoute.Sitemap = PUBLIC_STATIC_PATHS.filter(
    (path) => !isDisallowed(path),
  ).map((path) => ({
    url: `${baseUrl}${path || '/'}`,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }))

  const seen = new Set<string>()
  const speakerEntries: MetadataRoute.Sitemap = speakers
    // Normalise first: a blank / whitespace-only slug (seen historically, see
    // the slug-repair migration) is not a real profile URL and must be dropped.
    .map((speaker) => ({ ...speaker, slug: speaker.slug?.trim() }))
    .filter((speaker): speaker is SitemapSpeaker & { slug: string } => {
      if (!speaker.slug) return false
      const path = `/speaker/${speaker.slug}`
      if (isDisallowed(path) || seen.has(speaker.slug)) return false
      seen.add(speaker.slug)
      return true
    })
    .map((speaker) => ({
      url: `${baseUrl}/speaker/${encodeURIComponent(speaker.slug)}`,
      ...(speaker.lastModified ? { lastModified: speaker.lastModified } : {}),
      changeFrequency: 'monthly',
      priority: 0.5,
    }))

  return [...staticEntries, ...speakerEntries]
}
