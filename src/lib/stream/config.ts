export const STREAM_CONFIG = {
  refreshInterval: 300000, // 5 minutes
  revalidate: 300, // 5 minutes

  sponsorBanner: {
    speed: 120,
    className: 'mb-8',
  },

  blueskyFeed: {
    // NOTE: no hardcoded `handle` — it is derived per conference from
    // `socialLinks` at render time (see `deriveBlueskyHandle`). When a
    // conference has no Bluesky link the feed is omitted rather than defaulting
    // to another org's account.
    compact: true,
    title: 'Social Stream',
    speed: 180,
    maxHeight: '800px',
    className: 'h-fit',
  },

  nextTalk: {
    className: 'min-h-[200px]',
  },

  layout: {
    containerPadding: 'py-12',
    contentSpacing: 'space-y-8',
  },
} as const

/**
 * Derive the conference's Bluesky handle from its `socialLinks`.
 *
 * Accepts a `https://bsky.app/profile/<handle>` URL (or a bare `@handle` /
 * `handle` entry) and returns the bare handle. Returns `null` when no Bluesky
 * link is present so callers can OMIT the social feed instead of falling back
 * to a hardcoded brand account.
 */
export function deriveBlueskyHandle(
  socialLinks: string[] | undefined | null,
): string | null {
  if (!socialLinks?.length) return null

  for (const raw of socialLinks) {
    const link = raw?.trim()
    if (!link) continue

    const profileMatch = link.match(/bsky\.app\/profile\/([^/?#]+)/i)
    if (profileMatch) {
      return decodeURIComponent(profileMatch[1]).replace(/^@/, '')
    }
  }

  return null
}
