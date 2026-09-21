/**
 * What an organizer may change on a Library Recipe (Templates spec §5.2):
 * title, Channels, posts per week, the window, copy and alt skeletons,
 * instructions. Pure. Everything else comes from the entry, so an edited
 * Recipe is coherent by construction.
 */

import { PER_DAY_CEILING } from '../ceilings'
import { CONFERENCE_PLACEHOLDERS } from '../placeholders'
import type { Anchor, TaskRecipe } from '../template/types'
import {
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABELS,
  type CampaignTrigger,
  type MarketingChannel,
  type SubjectSource,
} from '../types'
import type { LibraryEntry } from './entries'

export interface RecipeEdits {
  title: string
  /** A Channel that is absent is switched off: its sibling is not stored. */
  channels: Partial<
    Record<MarketingChannel, { skeleton: string; perWeek?: number }>
  >
  /** Recurring entries only. */
  window?: { from: Anchor; to: Anchor }
  /** Entries that carry an image only. */
  alt?: string
  instructions?: string
}

/** Bounds what one attach creates: a Task, a post and a variant per day. */
export const COUNTDOWN_MAX_DAYS = 120

const SUBJECT_TOKENS: Record<SubjectSource, readonly string[]> = {
  speaker: ['name', 'company', 'title', 'hook'],
  talk: ['name', 'company', 'title', 'hook'],
  sponsor: ['name', 'company', 'tier', 'hook'],
  // The only subjectless entry is the countdown, which counts `{days}`.
  none: ['days'],
}

/**
 * The placeholders a skeleton of this entry can have filled in. Alt text is
 * written before the Channel's tagged link exists, so `{url}` would stay in it
 * verbatim — and scheduling refuses media carrying a placeholder.
 */
export function allowedPlaceholders(
  entry: LibraryEntry,
  field: 'copy' | 'alt' = 'copy',
): string[] {
  return [...CONFERENCE_PLACEHOLDERS, ...SUBJECT_TOKENS[entry.subject]].filter(
    (name) => field === 'copy' || name !== 'url',
  )
}

const publishingOf = (recipes: TaskRecipe[]) =>
  recipes.filter(
    (r): r is TaskRecipe & { channel: MarketingChannel } =>
      r.kind === 'publishing' && !!r.channel,
  )

/** The editable fields of an entry's Recipes, as stored on a Campaign. */
export function editsOf(
  entry: LibraryEntry,
  stored: TaskRecipe[],
): RecipeEdits {
  const posts = publishingOf(stored.filter((r) => r.beat === entry.id))
  const first = posts[0]
  const cadence = first?.cadence
  const alt = stored.find((r) => r.beat === entry.id && r.alt)?.alt
  const instructions = stored.find(
    (r) => r.beat === entry.id && r.instructions,
  )?.instructions
  return {
    title: first?.title ?? entry.title,
    channels: Object.fromEntries(
      posts.map((r) => [
        r.channel,
        {
          skeleton: r.skeleton ?? '',
          ...(cadence?.perWeek[r.channel] !== undefined
            ? { perWeek: cadence.perWeek[r.channel] }
            : {}),
        },
      ]),
    ),
    ...(cadence ? { window: { from: cadence.from, to: cadence.to } } : {}),
    ...(alt ? { alt } : {}),
    ...(instructions ? { instructions } : {}),
  }
}

/** The entry's Recipes with the edits applied. Assumes `editIssues` is empty. */
export function applyEdits(
  entry: LibraryEntry,
  edits: RecipeEdits,
): TaskRecipe[] {
  const perWeek = Object.fromEntries(
    MARKETING_CHANNELS.flatMap((channel) => {
      const rate = edits.channels[channel]?.perWeek
      return rate === undefined ? [] : [[channel, rate] as const]
    }),
  )
  return entry.recipes
    .filter((r) => r.kind !== 'publishing' || edits.channels[r.channel!])
    .map((r) => ({
      ...r,
      title: r.kind === 'publishing' ? edits.title : `Render: ${edits.title}`,
      ...(r.kind === 'publishing'
        ? { skeleton: edits.channels[r.channel!]!.skeleton }
        : {}),
      ...(r.alt ? { alt: edits.alt } : {}),
      ...(edits.instructions ? { instructions: edits.instructions } : {}),
      ...(r.cadence
        ? {
            cadence: {
              ...r.cadence,
              ...(edits.window ?? {}),
              perWeek,
            },
          }
        : {}),
    }))
}

// The strict outreach rule (`SendOutreachSchema`), not the lenient
// `unresolvedPlaceholders`: an invented `{recipient}` must not sail through to
// a post that is generated months later with nobody watching.
const TOKEN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g

function unknownTokens(text: string, allowed: ReadonlySet<string>): string[] {
  const unknown = new Set<string>()
  for (const [, name] of text.matchAll(TOKEN))
    if (!allowed.has(name)) unknown.add(`{${name}}`)
  return [...unknown]
}

/** Why these edits cannot be saved; empty when they can. */
export function editIssues(entry: LibraryEntry, edits: RecipeEdits): string[] {
  const issues: string[] = []
  const offered = new Set(publishingOf(entry.recipes).map((r) => r.channel))
  const chosen = MARKETING_CHANNELS.filter((c) => edits.channels[c])
  if (chosen.length === 0) issues.push('Choose at least one Channel.')
  const check = (
    label: string,
    text: string | undefined,
    field: 'copy' | 'alt' = 'copy',
  ) => {
    const unknown = unknownTokens(
      text ?? '',
      new Set(allowedPlaceholders(entry, field)),
    )
    if (unknown.length > 0)
      issues.push(
        `${label}: ${unknown.join(', ')} cannot be filled in for this Recipe.`,
      )
  }
  for (const channel of chosen) {
    if (!offered.has(channel)) {
      issues.push(
        `This Recipe does not post to ${MARKETING_CHANNEL_LABELS[channel]}.`,
      )
      continue
    }
    check(
      `${MARKETING_CHANNEL_LABELS[channel]} copy`,
      edits.channels[channel]?.skeleton,
    )
  }
  check('Alt text', edits.alt, 'alt')
  // A blank would otherwise fall back to the Library's text behind a "saved".
  if (entry.recipes.some((r) => r.alt) && !edits.alt?.trim())
    issues.push('Write the alt text for the card.')
  if (entry.recipes.some((r) => r.cadence)) {
    // A Channel without a rate is dealt no slots: it would post nothing.
    for (const channel of chosen)
      if (offered.has(channel) && !edits.channels[channel]?.perWeek)
        issues.push(
          `Say how many ${MARKETING_CHANNEL_LABELS[channel]} posts a week.`,
        )
    if (!edits.window) issues.push('Choose the window the Recipe posts in.')
    // `{days}` and the countdown's Task keys (`d-30`) are both counted from the
    // conference start, so a window hung on another Milestone would go stale
    // when dates move and would not recognise its own Tasks on re-attach.
    else if (entry.subject === 'none') {
      const { from, to } = edits.window
      if ([from, to].some((anchor) => anchor.milestone !== 'CONFERENCE_START'))
        issues.push(
          'The countdown counts the days to the conference: set its window in days from Conference.',
        )
      else if (
        [from, to].some(
          ({ offsetDays }) =>
            offsetDays < -COUNTDOWN_MAX_DAYS || offsetDays > -1,
        )
      )
        issues.push(
          `The countdown runs from at most ${COUNTDOWN_MAX_DAYS} days before the conference to the day before it.`,
        )
      else if (to.offsetDays < from.offsetDays)
        issues.push('The first countdown post must come before the last.')
      // One Task per DAY is the countdown's key (`d-30`): a second post on a
      // day would be the same Task twice, and the attach could never land.
      if (chosen.some((c) => (edits.channels[c]?.perWeek ?? 0) > 7))
        issues.push('The countdown posts once a day at most: 7 a week.')
    }
  }
  return issues
}

/** Ceilings warn, never block (slice 1 §5.4): a rate no week can carry. */
export function entryCeilingNotes(edits: RecipeEdits): string[] {
  return MARKETING_CHANNELS.flatMap((channel) => {
    const rate = edits.channels[channel]?.perWeek
    const limit = PER_DAY_CEILING[channel]
    return rate !== undefined && rate > limit * 7
      ? [
          `${MARKETING_CHANNEL_LABELS[channel]}: ${rate} posts a week is over the ceiling of ${limit} a day.`,
        ]
      : []
  })
}

interface RecipeHolder {
  recipes: TaskRecipe[]
  triggers: CampaignTrigger[]
}

/** Recipe keys are unique within a Campaign, so an entry attaches once. */
export function hasEntry(campaign: RecipeHolder, entry: LibraryEntry): boolean {
  return campaign.recipes.some((r) => r.beat === entry.id)
}

/** The caller has checked {@link hasEntry}. */
export function attachEntry(
  campaign: RecipeHolder,
  entry: LibraryEntry,
  recipes: TaskRecipe[],
): RecipeHolder {
  return {
    recipes: [...campaign.recipes, ...recipes],
    triggers: [...campaign.triggers, ...entry.triggers],
  }
}
