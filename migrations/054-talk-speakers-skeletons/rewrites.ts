/**
 * The built-in talk skeletons #1153 changed, frozen: the `2026.2` text a plan
 * was seeded with (`from`) and the `2026.3` text that replaces it (`to`).
 * Frozen rather than read from the live built-in, so a later Template can
 * never change what this migration writes (the lesson of 053).
 *
 * The two Bluesky `from` texts are also the `2026.1` texts, so a plan
 * backfilled by 053 gets those two lines too. The `2026.1` LinkedIn lines
 * still carried `{url}` and are not matched: rewriting them would change
 * wording beyond #1153.
 */
export interface Rewrite {
  recipeKey: string
  from: string
  to: string
}

export const REWRITES: readonly Rewrite[] = [
  {
    recipeKey: 'talkTeaser:linkedin',
    from: '{hook}\n\n{name} ({company}) answers it at {event}.\n\n🎙️ "{title}"\n\nSchedule — link in the first comment.\n\n{eventTag}',
    to: '{hook}\n\nAnswered at {event} by {speakers}.\n\n🎙️ "{title}"\n\nSchedule — link in the first comment.\n\n{eventTag}',
  },
  {
    recipeKey: 'talkTeaser:bluesky',
    from: '{hook}\n\n{name} has the answer — and the graphs. "{title}" at {event}.\n\n{url}',
    to: '{hook}\n\nThe answer — and the graphs: "{title}" by {name} at {event}.\n\n{url}',
  },
  {
    recipeKey: 'videoDrip:linkedin',
    from: '{hook}\n\n{name} ({company}) at {event}: "{title}". Recording online.\n\nWatch — link in the first comment.\n\n{eventTag}',
    to: '{hook}\n\n{speakers} at {event}: "{title}". Recording online.\n\nWatch — link in the first comment.\n\n{eventTag}',
  },
  {
    recipeKey: 'videoDrip:bluesky',
    from: '🎬 "{title}" — {name} ({company}) at {event}.\n\n{hook}\n\n{url}',
    to: '🎬 "{title}" — {speakers} at {event}.\n\n{hook}\n\n{url}',
  },
]

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
    if (typeof r._key !== 'string' || r.subjectSource !== 'talk') return []
    const rewrite = REWRITES.find(
      (w) => w.recipeKey === r.key && w.from === r.skeleton,
    )
    return rewrite ? [{ _key: r._key, to: rewrite.to }] : []
  })
}
