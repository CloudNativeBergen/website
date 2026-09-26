import { z } from 'zod'

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
 * the speaker or sponsor the studio was opened on. Only the tab is stored; the
 * speaker or sponsor is the asset's SUBJECT when it matches the tab, so an
 * edited or erased subject never leaves a stale copy behind. The studio cannot
 * address a talk or a card variant, so that is as close as "Open in studio"
 * lands.
 */
export interface MarketingAssetStudioOrigin {
  tab: StudioTab
  speakerId: string | null
  sponsorId: string | null
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
