import { fetchImageBytes, readBounded, type ImageBytes } from './bytes'

/**
 * The link card a platform that does not unfurl (Bluesky) needs us to
 * supply: title, description and thumbnail GENERATED from the linked page's
 * own metadata (spec §4.1). The page is ours — the tagged link always points
 * at our domain — so its Open Graph tags are the same ones every other
 * network would read.
 */

export interface LinkCard {
  title: string
  description: string
  thumb: ImageBytes | null
}

/** How much of the page we read looking for `<head>` metadata. */
export const LINK_CARD_HTML_LIMIT = 256 * 1024
/** Bluesky's `app.bsky.embed.external#thumb` cap (lexicon `maxSize`). */
export const LINK_CARD_THUMB_MAX_BYTES = 1_000_000
export const LINK_CARD_TITLE_MAX = 200
export const LINK_CARD_DESCRIPTION_MAX = 300

/** `fetchImpl` is the publish's deadline-bound transport. */
export type LinkCardSource = (
  url: string,
  fetchImpl: typeof fetch,
  options: { thumb: boolean },
) => Promise<LinkCard | null>

/** Where card thumbnails may come from besides the page's own host. */
export const LINK_CARD_IMAGE_HOSTS = ['cdn.sanity.io'] as const
const MAX_REDIRECTS = 3

export interface LinkCardFetchOptions {
  /**
   * Hosts the card may be generated for — the conference's own domains.
   * The variant's link is organizer-typed text, and this fetch runs from
   * the cron with no user in the loop, so it never follows a link (or a
   * redirect, or an `og:image`) to a host the tenant does not own.
   */
  allowedHosts: readonly string[]
  fetch?: typeof fetch
  /** Skip the `og:image` fetch (the caller has its own thumbnail). */
  thumb?: boolean
}

/**
 * Never a destination, whatever the allowlist says: the allowlist is built
 * from organizer-typed `domains[]` entries, and an entry that names an
 * address literal or a local name would turn the cron into a proxy into
 * the deployment's own network.
 */
function isPublicHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) return false // IPv4 / IPv6
  if (/\.(local|internal|home\.arpa|lan|intranet)$/.test(hostname)) return false
  return hostname.includes('.')
}

function entryMatches(entry: string, hostname: string): boolean {
  if (entry.startsWith('*.')) {
    const suffix = entry.slice(2)
    return (
      hostname.endsWith(`.${suffix}`) &&
      !hostname.slice(0, -suffix.length - 1).includes('.')
    )
  }
  return entry === hostname
}

/** Exported for the host-policy tests only. */
export function hostAllowed(url: URL, allowed: readonly string[]): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  // Only default ports: a `:port` on a claimed entry is a dev convenience.
  if (url.port !== '') return false
  const hostname = url.hostname.toLowerCase()
  if (!isPublicHostname(hostname)) return false
  return allowed.some((entry) => {
    const candidate = entry.trim().toLowerCase()
    return candidate !== '' && entryMatches(candidate, hostname)
  })
}

/**
 * `fetch` that follows at most {@link MAX_REDIRECTS} redirects and only
 * onto allowed hosts; anything else is a miss, never a request.
 */
async function fetchWithinHosts(
  url: string,
  allowed: readonly string[],
  fetchImpl: typeof fetch,
  init: RequestInit,
): Promise<{ response: Response; url: URL } | null> {
  let current: URL
  try {
    current = new URL(url)
  } catch {
    return null
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!hostAllowed(current, allowed)) return null
    const response = await fetchImpl(current, { ...init, redirect: 'manual' })
    const location = response.headers.get('location')
    if (response.status < 300 || response.status >= 400 || !location) {
      return { response, url: current }
    }
    await response.body?.cancel()
    try {
      current = new URL(location, current)
    } catch {
      return null
    }
  }
  return null
}

export interface ParsedLinkMetadata {
  title: string
  description: string
  imageUrl: string | null
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole: string, entity: string) => {
      const lower = entity.toLowerCase()
      if (lower.startsWith('#x')) {
        return String.fromCodePoint(parseInt(lower.slice(2), 16))
      }
      if (lower.startsWith('#'))
        return String.fromCodePoint(Number(lower.slice(1)))
      return ENTITIES[lower] ?? whole
    },
  )
}

function collapse(text: string): string {
  return decodeEntities(text).replace(/\s+/g, ' ').trim()
}

/** `<meta …>` tags as attribute maps, in document order; attribute order agnostic. */
function metaTags(html: string): Record<string, string>[] {
  const tags: Record<string, string>[] = []
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs: Record<string, string> = {}
    for (const attr of match[1].matchAll(
      /([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi,
    )) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? ''
    }
    tags.push(attrs)
  }
  return tags
}

/**
 * Pure: Open Graph first, then the plain `<title>` / `description` meta.
 * A relative `og:image` resolves against the page URL.
 */
export function parseLinkMetadata(
  html: string,
  pageUrl: string,
): ParsedLinkMetadata {
  const head = html.slice(0, LINK_CARD_HTML_LIMIT)
  const tags = metaTags(head)
  const meta = (key: string, attr: 'property' | 'name') =>
    tags.find((t) => t[attr]?.toLowerCase() === key && t.content !== undefined)
      ?.content
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const title = collapse(
    meta('og:title', 'property') ??
      meta('twitter:title', 'name') ??
      titleTag ??
      '',
  )
  const description = collapse(
    meta('og:description', 'property') ??
      meta('twitter:description', 'name') ??
      meta('description', 'name') ??
      '',
  )
  const rawImage = meta('og:image', 'property') ?? meta('twitter:image', 'name')
  let imageUrl: string | null = null
  if (rawImage) {
    try {
      const resolved = new URL(decodeEntities(rawImage).trim(), pageUrl)
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        imageUrl = resolved.toString()
      }
    } catch {
      imageUrl = null
    }
  }
  return {
    title: title.slice(0, LINK_CARD_TITLE_MAX),
    description: description.slice(0, LINK_CARD_DESCRIPTION_MAX),
    imageUrl,
  }
}

/**
 * Fetch the page and build the card. `null` when the page cannot be read —
 * the adapter then falls back to a bare card so the link still ships. A
 * thumbnail that is missing, not an image, or over the cap is simply
 * omitted: the card is still worth posting without it.
 */
export async function fetchLinkCard(
  url: string,
  options: LinkCardFetchOptions,
): Promise<LinkCard | null> {
  const fetchImpl = options.fetch ?? fetch
  const { allowedHosts } = options
  let html: string
  // Where the page actually came from after redirects: a relative
  // `og:image` resolves against it, while the card's `uri` stays the link.
  let pageUrl = url
  try {
    const landed = await fetchWithinHosts(url, allowedHosts, fetchImpl, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'text/html' },
    })
    if (!landed?.response.ok) return null
    pageUrl = landed.url.toString()
    // Past the limit the page is cut, not refused: `<head>` comes first.
    const bytes = await readBounded(landed.response, LINK_CARD_HTML_LIMIT, {
      truncate: true,
    })
    if (!bytes) return null
    html = new TextDecoder().decode(bytes)
  } catch {
    return null
  }
  const parsed = parseLinkMetadata(html, pageUrl)
  let thumb: ImageBytes | null = null
  if (parsed.imageUrl && options.thumb !== false) {
    try {
      const imageHosts = [...allowedHosts, ...LINK_CARD_IMAGE_HOSTS]
      thumb = await fetchImageBytes(
        parsed.imageUrl,
        LINK_CARD_THUMB_MAX_BYTES,
        (input, init) =>
          fetchWithinHosts(
            String(input),
            imageHosts,
            fetchImpl,
            init ?? {},
          ).then((r) =>
            r ? r.response : Promise.reject(new Error('host not allowed')),
          ),
      )
    } catch {
      thumb = null
    }
  }
  return { title: parsed.title, description: parsed.description, thumb }
}
