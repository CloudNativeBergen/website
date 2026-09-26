import { shortLinkUrl } from '@/lib/marketing/short-code'
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
  if (!variant.shortCode || !shortLinkOrigin) return { link: variant.link }
  return {
    link: shortLinkUrl(shortLinkOrigin, variant.shortCode),
    linkDestination: variant.link,
  }
}
