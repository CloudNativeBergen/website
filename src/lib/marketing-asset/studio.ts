import { z } from 'zod'
import type { MarketingAssetSubjectType } from './types'

/**
 * The studio's tabs (docs/MARKETING_ASSETS_SPEC.md §4.2), in the order the
 * studio shows them. The studio page's `?tab=` and a saved asset's
 * `studio.tab` are the same value, which is what "Open in studio" relies on.
 */
export const STUDIO_TABS = [
  'meme-generator',
  'conference',
  'photo-gallery',
  'speakers',
  'sponsors',
] as const
export type StudioTab = (typeof STUDIO_TABS)[number]

/** Which studio tab made an asset, as the save request names it. */
export const studioOriginSchema = z.object({ tab: z.enum(STUDIO_TABS) })
export type StudioOriginInput = z.output<typeof studioOriginSchema>

/**
 * Where a studio-made asset came from, as the gallery reads it: the tab, and
 * the speaker or sponsor the studio was opened on. The studio cannot address a
 * talk or a card variant, so that is as close as "Open in studio" lands.
 */
export interface MarketingAssetStudioOrigin {
  tab: StudioTab
  speakerId: string | null
  sponsorId: string | null
}

/** The one tab that can be opened on each kind of subject. */
const TAB_SUBJECT: Partial<Record<StudioTab, MarketingAssetSubjectType>> = {
  speakers: 'speaker',
  sponsors: 'sponsor',
}

/**
 * The speaker or sponsor a studio save was opened on, taken from the asset's
 * subject — which the server has already proven this organization's — and
 * never from a second client-sent id. Only a speaker card's speaker and a
 * sponsor card's sponsor count; any other pairing opens the tab alone.
 */
export function studioTarget(
  tab: StudioTab,
  subject: { type: MarketingAssetSubjectType; id: string } | null | undefined,
): { type: 'speaker' | 'sponsor'; id: string } | null {
  const type = TAB_SUBJECT[tab]
  if (!type || !subject || subject.type !== type) return null
  return { type: type as 'speaker' | 'sponsor', id: subject.id }
}

/** The studio page, on the tab and the speaker or sponsor an asset names. */
export function openInStudioHref(origin: MarketingAssetStudioOrigin): string {
  const params = new URLSearchParams({ tab: origin.tab })
  if (origin.tab === 'speakers' && origin.speakerId)
    params.set('speaker', origin.speakerId)
  if (origin.tab === 'sponsors' && origin.sponsorId)
    params.set('sponsor', origin.sponsorId)
  return `/admin/marketing/studio?${params.toString()}`
}
