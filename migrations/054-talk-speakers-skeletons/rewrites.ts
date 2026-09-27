/**
 * The built-in talk skeletons #1153 changed. The frozen `from` → `to` pairs
 * live in ONE table shared with seeding and copying
 * (`src/lib/marketing/template/legacy-skeletons.ts`), so a saved Template or
 * an earlier plan copied later is brought current by the same pairs this
 * migration writes.
 */
import {
  currentSkeleton,
  LEGACY_SKELETONS,
} from '../../src/lib/marketing/template/legacy-skeletons'

export const REWRITES = LEGACY_SKELETONS

type Doc = Record<string, unknown>

export const isLive = (id: string) =>
  !id.startsWith('drafts.') && !id.startsWith('versions.')

/**
 * The new skeleton per recipe `_key` of one Campaign: only a talk Recipe
 * whose key and skeleton are EXACTLY a built-in `from` — an edited skeleton
 * is the organizer's and is left alone.
 */
export function rewritesFor(campaign: Doc): { _key: string; to: string }[] {
  const recipes = Array.isArray(campaign.recipes)
    ? (campaign.recipes as Doc[])
    : []
  return recipes.flatMap((r) => {
    if (typeof r._key !== 'string') return []
    const to = currentSkeleton(r)
    return to ? [{ _key: r._key, to }] : []
  })
}
