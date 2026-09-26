import { findOutboundOrigin } from '@/lib/conference/baseUrl'
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
 * The origin a variant's short link is built on — THE gate every store and
 * router shares, so they cannot drift. `null` for a variant without a code
 * (it posts its own link), and `null` for a conference with no usable domain:
 * `conferenceBaseUrl` would fall back to the PLATFORM host, where `/go/`
 * resolves no conference and 404s — a dead posted link — so the long link is
 * posted instead. Otherwise the conference's own outbound origin, the
 * derivation its tagged links are minted with.
 */
export function variantShortLinkOrigin(
  shortCode: string | null | undefined,
  conference: { domains?: readonly string[] | null } | null | undefined,
): string | null {
  return normalizeShortCode(shortCode) ? findOutboundOrigin(conference) : null
}
