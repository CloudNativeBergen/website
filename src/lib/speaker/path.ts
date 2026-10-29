/**
 * Public profile path for a speaker, or `null` when there is no slug.
 * `/speaker/${slug}` with a missing slug renders `/speaker/null`, a dead URL
 * crawlers then fetch, so every link builder goes through here.
 */
export function speakerPath(slug: string | null | undefined): string | null {
  const s = typeof slug === 'string' ? slug.trim() : ''
  return s ? `/speaker/${encodeURIComponent(s)}` : null
}
