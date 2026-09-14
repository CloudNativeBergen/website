import { fetchImageBytes, type ImageBytes } from './bytes'

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

export type LinkCardSource = (url: string) => Promise<LinkCard | null>

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
  fetchImpl: typeof fetch = fetch,
): Promise<LinkCard | null> {
  let html: string
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'text/html' },
    })
    if (!response.ok) return null
    html = (await response.text()).slice(0, LINK_CARD_HTML_LIMIT)
  } catch {
    return null
  }
  const parsed = parseLinkMetadata(html, url)
  let thumb: ImageBytes | null = null
  if (parsed.imageUrl) {
    try {
      thumb = await fetchImageBytes(
        parsed.imageUrl,
        LINK_CARD_THUMB_MAX_BYTES,
        fetchImpl,
      )
    } catch {
      thumb = null
    }
  }
  return { title: parsed.title, description: parsed.description, thumb }
}
