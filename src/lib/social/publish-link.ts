import {
  conferenceBaseUrl,
  hasConferenceDomain,
} from '@/lib/conference/baseUrl'
import { normalizeShortCode, shortLinkUrl } from '@/lib/marketing/short-code'
import type { PublishInput } from './provider/types'

/**
 * The link fields of a variant's publish input (short-links spec §2.3) — ONE
 * mapping for the publish tick and for every pre-publish validation, so what
 * is validated is what is posted.
 *
 * A variant with a `/go/<code>` code (a marketing Task's) posts the short
 * link and keeps its stored long tagged `link` as the destination a link card
 * is scraped from. A variant without one — a standalone post, whose link the
 * organizer typed and is not ours to shorten — posts its `link` unchanged.
 *
 * `shortLinkOrigin` is the conference's outbound origin; `null` when the
 * caller has none, which posts the long link rather than a relative one.
 */
export function publishLinkFields(
  variant: { link: string | null; shortCode?: string | null },
  shortLinkOrigin: string | null,
): Pick<PublishInput, 'link' | 'linkDestination'> {
  if (!variant.link) return {}
  // A stored value that is not a code (a dataset hand-edit) would post a
  // `/go/` link the route 404s; the long link still reaches the page.
  const code = normalizeShortCode(variant.shortCode)
  if (!code || !shortLinkOrigin) return { link: variant.link }
  return {
    link: shortLinkUrl(shortLinkOrigin, code),
    linkDestination: variant.link,
  }
}

/**
 * The origin a conference's short links are built on: its own outbound origin
 * (`conferenceBaseUrl()`, the derivation its tagged links are minted with), or
 * `null` when it has no usable domain. `conferenceBaseUrl` would then fall
 * back to the PLATFORM host, where `/go/` resolves no conference and 404s — a
 * dead posted link — so the long link is posted instead.
 */
export function shortLinkOriginOf(
  conference:
    | { title?: string | null; domains?: readonly string[] | null }
    | null
    | undefined,
): string | null {
  return hasConferenceDomain(conference) ? conferenceBaseUrl(conference) : null
}
