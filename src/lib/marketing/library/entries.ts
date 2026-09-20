/**
 * THE RECIPE LIBRARY (Templates spec §5.1). The platform's Trigger-driven and
 * recurring Recipes, offered on any Campaign. An entry IS the built-in
 * Template's beat — the same Recipes and the same Trigger — so a Campaign it
 * is attached to generates exactly as the built-in Campaign does. The entry
 * fixes the wiring (event, subject list, Kinds, the render Prerequisite, keys);
 * `edits.ts` says what an organizer may change.
 */

import { BUILTIN_TEMPLATE } from '../template/builtin'
import type { TaskRecipe } from '../template/types'
import type { CampaignTrigger, SubjectSource } from '../types'

export const LIBRARY_IDS = [
  'speakerCard',
  'sponsorCard',
  'talkTeaser',
  'videoDrip',
  'countdown',
] as const
export type LibraryId = (typeof LIBRARY_IDS)[number]

export interface LibraryEntry {
  /** Also the beat of its Recipes: the countdown keeps its `countdown` prefix. */
  id: LibraryId
  title: string
  description: string
  subject: SubjectSource
  recipes: TaskRecipe[]
  triggers: CampaignTrigger[]
}

/** Where each entry lives in the built-in Template, and what it says it does. */
const SOURCES: Record<LibraryId, { campaign: string; description: string }> = {
  speakerCard: {
    campaign: 'speakers',
    description:
      'A card render and a post per Channel for every confirmed speaker.',
  },
  sponsorCard: {
    campaign: 'sponsorAcquisition',
    description:
      'A thank-you card and a post per Channel when a sponsor signs.',
  },
  talkTeaser: {
    campaign: 'programme',
    description: 'A teaser post for every scheduled talk.',
  },
  videoDrip: {
    campaign: 'postEvent',
    description: 'A post for every recorded talk, once recordings are live.',
  },
  countdown: {
    campaign: 'finalPush',
    description: 'A daily countdown to the conference.',
  },
}

function build(id: LibraryId): LibraryEntry {
  const campaign = BUILTIN_TEMPLATE.campaigns.find(
    (c) => c.key === SOURCES[id].campaign,
  )
  const recipes = (campaign?.recipes ?? []).filter((r) => r.beat === id)
  const title = recipes.find((r) => r.kind === 'publishing')?.title
  if (!campaign || !title)
    throw new Error(`Recipe Library: the built-in Template has no "${id}"`)
  const keys = new Set(recipes.map((r) => r.key))
  return {
    id,
    title,
    description: SOURCES[id].description,
    subject: recipes[0].subjectSource,
    recipes: structuredClone(recipes),
    triggers: campaign.triggers
      .filter((t) => keys.has(t.taskRecipeKey))
      .map((t) => ({ ...t })),
  }
}

export const LIBRARY: LibraryEntry[] = LIBRARY_IDS.map(build)

export function libraryEntry(id: LibraryId): LibraryEntry {
  return LIBRARY.find((e) => e.id === id)!
}

/** The entry a stored Recipe came from, by its beat; null for any other beat. */
export function libraryEntryOfBeat(beat: string): LibraryEntry | null {
  return LIBRARY.find((e) => e.id === beat) ?? null
}
