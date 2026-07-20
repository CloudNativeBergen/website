/**
 * Pure helpers for creating a topic (SE-2). Kept free of any Sanity/server
 * import so both the `topic` router and unit tests can use them.
 */

/**
 * Default chip colors assigned round-robin (by title hash) when an admin creates
 * a topic without picking one. The Sanity topic schema REQUIRES a color, so we
 * never persist an empty one; a deterministic hash keeps distinct topics
 * visually distinguishable without a color picker in the minimal create flow.
 */
export const TOPIC_COLOR_PALETTE = [
  '#2563EB', // blue
  '#16A34A', // green
  '#DC2626', // red
  '#D97706', // amber
  '#7C3AED', // violet
  '#DB2777', // pink
  '#0891B2', // cyan
  '#4B5563', // gray
] as const

/** Deterministic default color for a title (stable across calls). */
export function defaultTopicColor(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % TOPIC_COLOR_PALETTE.length
  return TOPIC_COLOR_PALETTE[index]
}

/** Stable fallback when a title reduces to an empty slug. */
export const FALLBACK_TOPIC_SLUG = 'topic'

/**
 * Reduce a topic title to a URL-safe lowercase slug. Never empty: falls back to
 * {@link FALLBACK_TOPIC_SLUG} for a title with no slug-safe characters.
 */
export function slugifyTopicTitle(title: string): string {
  const base = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return (base || FALLBACK_TOPIC_SLUG).slice(0, 96)
}
