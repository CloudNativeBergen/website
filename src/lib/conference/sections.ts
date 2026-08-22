/**
 * SECTION SELECTION — how one cached conference read serves every caller.
 *
 * The conference read used to compose its GROQ string from the caller's option
 * flags, and that string is part of the `'use cache'` key. Six flags that
 * change the query text (`organizers`, `schedule`, `confirmedTalksOnly`,
 * `sponsorTiers`, `topics`, `featuredSpeakers`, `featuredTalks`) produced
 * TWELVE distinct cache entries per domain in practice — twelve independent
 * copies of the same document, each re-fetched from Sanity on its own timer,
 * in every Vercel region, all of them busted together by a single
 * `revalidateTag(conferenceTag(id))`. Sanity meters requests, so that is a
 * ~12x multiplier on the single largest line item in the project's quota.
 *
 * The fix is to make the QUERY TEXT independent of the flags: fetch the union
 * of the expensive sections under one namespaced key (`__expanded`) and let
 * this module hand each caller exactly the shape its flags used to produce.
 * The cache key stops varying; the returned object does not change at all.
 *
 * WHY THE EXPANSIONS LIVE UNDER `__expanded` RATHER THAN OVERWRITING THE FIELD.
 * `organizers`, `featuredSpeakers`, `featuredTalks`, `topics` and `schedules`
 * all exist on the conference document as REFERENCE ARRAYS, and the base `...`
 * spread returns them in that raw `{_ref,_type,_key}` form. Callers that did
 * not ask for a section have always received the raw refs, and some of them
 * read those refs (`organizers.length` for the organizer ticket count is the
 * obvious one). So the expansion cannot simply replace the field in the query —
 * that would silently change the shape for every caller that did not opt in.
 * Keeping both, and choosing here, reproduces the old per-flag shapes exactly.
 *
 * `sponsorTiers` is the exception: it is a SUBQUERY, not a document field, so
 * there is no raw form to preserve and the key is simply absent when unasked.
 */

import type { Conference } from './types'

/**
 * The key the conference query parks its dereferenced sections under.
 *
 * Namespaced with a double underscore because the base projection is a bare
 * `...` spread of an APPEND-ONLY schema (see AGENTS.md): a future conference
 * field must not be able to collide with it. Exported so the query, the
 * selector and the tests all name the same string.
 */
export const EXPANDED_SECTIONS_KEY = '__expanded'

/**
 * The dereferenced sections, in the same types the `Conference` fields carry.
 *
 * `| null` is deliberate and load-bearing: GROQ returns `null`, not an absent
 * key, for a projection over a field the document does not have — a conference
 * with no `featuredSpeakers` yields `"featuredSpeakers": null`. Typing these as
 * plain arrays would make every read below look total when it is not.
 */
export interface ExpandedConferenceSections {
  organizers?: Conference['organizers'] | null
  featuredSpeakers?: Conference['featuredSpeakers'] | null
  featuredTalks?: Conference['featuredTalks'] | null
  sponsorTiers?: Conference['sponsorTiers'] | null
  topics?: Conference['topics'] | null
  /** Present only on the `full` tier — the `core` query omits it entirely. */
  schedules?: Conference['schedules'] | null
}

/** A conference document as it comes back from the tiered read. */
export type RawConferenceRead = Conference & {
  [EXPANDED_SECTIONS_KEY]?: ExpandedConferenceSections | null
}

/** Which sections a caller asked to have dereferenced. */
export interface SectionSelection {
  organizers: boolean
  featuredSpeakers: boolean
  featuredTalks: boolean
  sponsorTiers: boolean
  topics: boolean
  schedule: boolean
  confirmedTalksOnly: boolean
}

/**
 * Is this schedule slot one the confirmed-only view keeps?
 *
 * EXACTLY the predicate the GROQ filter it replaces applied:
 *
 *   talks[!defined(talk) || talk->status == "confirmed"]
 *
 * `hasTalkRef` is projected as `defined(talk)` on the very same raw slot, so
 * `!slot.hasTalkRef` IS `!defined(talk)`. A DANGLING reference — the slot has a
 * `talk` ref but the proposal was deleted — is dropped by both: GROQ resolves
 * `talk->status` to null, and `slot.talk?.status` is `undefined` here. Neither
 * equals `'confirmed'`.
 */
function keepsSlotWhenConfirmedOnly(slot: {
  hasTalkRef?: boolean
  talk?: { status?: string }
}): boolean {
  return !slot.hasTalkRef || slot.talk?.status === 'confirmed'
}

/**
 * Drop the non-confirmed slots from a schedule tree.
 *
 * The filter moved out of GROQ and into TypeScript so that `confirmedTalksOnly`
 * stops forking the query text (and therefore the cache key): the read fetches
 * every slot once and each caller narrows locally.
 *
 * THIS IS NOT A CONFIDENTIALITY BOUNDARY, and must not be mistaken for one.
 * `/program` is a fully public page that already passes
 * `confirmedTalksOnly: false` (`src/app/(main)/program/page.tsx`), so
 * unconfirmed talks are public content today, with or without this change. What
 * this preserves is the RENDERED SHAPE the confirmed-only callers have always
 * seen — the homepage program highlights and `/info` must not start listing
 * slots whose talk is still a draft.
 *
 * Rebuilds rather than mutates. The input is the object `'use cache'` handed
 * back, and the same entry serves the confirmed and unconfirmed callers; an
 * in-place splice would let one caller's narrowing corrupt the other's view.
 * Nodes with nothing to filter are returned by reference — a missing `tracks`
 * or `talks` stays exactly as missing as GROQ left it.
 */
export function withConfirmedTalksOnly(
  schedules: Conference['schedules'] | null,
): Conference['schedules'] | null {
  // `null` and `undefined` pass through UNCHANGED rather than becoming `[]` —
  // see the note on verbatim values in `selectConferenceSections`.
  if (!Array.isArray(schedules)) return schedules

  return schedules.map((day) => {
    if (!Array.isArray(day.tracks)) return day
    return {
      ...day,
      tracks: day.tracks.map((track) => {
        if (!Array.isArray(track.talks)) return track
        return {
          ...track,
          talks: track.talks.filter(keepsSlotWhenConfirmedOnly),
        }
      }),
    }
  })
}

/**
 * Hand a caller the conference shape its flags used to produce.
 *
 * Returns a NEW object every call. The old code mutated the fetched document
 * in place and relied on `'use cache'` deserializing a fresh object per call;
 * now that one cache entry backs every flag combination, that assumption is no
 * longer one to lean on — two callers with different flags share the entry, and
 * whichever ran first would otherwise decide what the second one sees.
 *
 * VALUES ARE COPIED THROUGH VERBATIM, `null` included. GROQ emits
 * `"featuredSpeakers": null` — not an absent key — for a projection over a
 * field the document does not have, and that is what these callers have always
 * received. Coercing it to `undefined` here would be a shape change smuggled
 * into a performance change; it is also what `Conference` claims the field is,
 * which makes the temptation to "tidy" it real. The assignment therefore goes
 * through an index-signature view: the cast is confined to these six lines and
 * exists to preserve the pre-existing (and mildly untruthful) `T[] | undefined`
 * typing rather than to quietly correct it. `normalizeConference` still turns a
 * null `organizers`/`topics` into `[]` at the data boundary, exactly as before.
 */
export function selectConferenceSections(
  raw: RawConferenceRead,
  selection: SectionSelection,
): Conference {
  const { [EXPANDED_SECTIONS_KEY]: expandedOrNull, ...conference } = raw
  const expanded = expandedOrNull ?? {}
  const target = conference as unknown as Record<string, unknown>

  if (selection.organizers) target.organizers = expanded.organizers
  if (selection.topics) target.topics = expanded.topics
  if (selection.featuredSpeakers) {
    target.featuredSpeakers = expanded.featuredSpeakers
  }
  if (selection.featuredTalks) target.featuredTalks = expanded.featuredTalks
  if (selection.sponsorTiers) target.sponsorTiers = expanded.sponsorTiers
  if (selection.schedule) {
    target.schedules = selection.confirmedTalksOnly
      ? withConfirmedTalksOnly(expanded.schedules)
      : expanded.schedules
  }

  return conference
}
