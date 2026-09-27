/**
 * Built-in skeletons a later Template version replaced, frozen: the text a
 * plan or a saved Template may still hold (`from`) and the text that
 * replaces it (`to`), per built-in Recipe key. Frozen rather than read from
 * the live built-in, so a later Template can never change what an old text
 * becomes (the lesson of migration 053).
 *
 * ONE table, read by migration 054 (stored Campaigns) and by seeding and
 * copying (a saved Template or an earlier edition's plan): adding a pair is
 * one entry here.
 *
 * Only an EXACT match is replaced: an edited skeleton is the organizer's.
 * Only talk Recipes carry these texts; a speaker subject is one person.
 */
import type { TaskRecipe } from './types'

export interface SkeletonRewrite {
  recipeKey: string
  from: string
  to: string
}

/**
 * 2026.2 → 2026.3 (#1153): talk posts name every speaker. The two Bluesky
 * `from` texts are also the 2026.1 texts. The 2026.1 LinkedIn lines still
 * carried `{url}` and are not matched: rewriting them would change wording
 * beyond #1153.
 */
export const LEGACY_SKELETONS: readonly SkeletonRewrite[] = [
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

/** The current text for a Recipe still on an unedited legacy skeleton. */
export function currentSkeleton(recipe: {
  key?: unknown
  subjectSource?: unknown
  skeleton?: unknown
}): string | null {
  if (recipe.subjectSource !== ('talk' satisfies TaskRecipe['subjectSource']))
    return null
  return (
    LEGACY_SKELETONS.find(
      (w) => w.recipeKey === recipe.key && w.from === recipe.skeleton,
    )?.to ?? null
  )
}

/**
 * Recipes copied from stored history (a saved Template, an earlier plan)
 * with each unedited legacy skeleton brought current. Returns new objects;
 * the input is not touched.
 */
export function withCurrentSkeletons<
  R extends Pick<TaskRecipe, 'key' | 'subjectSource' | 'skeleton'>,
>(recipes: readonly R[]): R[] {
  return recipes.map((r) => {
    const skeleton = currentSkeleton(r)
    return skeleton ? { ...structuredClone(r), skeleton } : structuredClone(r)
  })
}
