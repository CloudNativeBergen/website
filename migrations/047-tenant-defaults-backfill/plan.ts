/**
 * Pure targeting + value derivation for the tenant-defaults backfill.
 *
 * Companion to migration 046. 046 pinned the three Cloud Native Days editions'
 * VISUAL identity (theme, background pattern, logos, prospectus copy) before
 * those code defaults were neutralised. This one does the same job for the
 * values that PR neutralises and 046 does not cover:
 *
 *   1. `analyticsPirschCode`   — was a string literal in `src/app/layout.tsx`
 *   2. `venueTravelInfo`       — was hardcoded Bergen transit prose on /info
 *   3. `speakerDinnerInfo`     — was hardcoded Ulriken prose on /info
 *   4. `localRecommendations`  — was hardcoded Bryggen/visitbergen prose on /info
 *   5. `socialHashtag`         — was the literal '#cndb2025' in the stream wall
 *
 * Targeting is NOT reimplemented here: it is the same three editions, matched
 * the same way (by routing domain, aborting on zero/ambiguous matches). Import
 * from 046 so there is exactly ONE tested implementation of "which document is
 * Bergen 2025?" — a second copy is how two migrations end up patching different
 * documents.
 *
 * THE VALUES ARE HARDCODED ON PURPOSE, as in 046: importing them from the code
 * they are being removed from would make this migration write whatever the
 * constant later becomes (or fail to compile once it is gone), destroying the
 * thing it exists to preserve.
 */

import { TARGETS } from '../046-conference-identity-backfill/plan'

export {
  TARGETS,
  resolveTargets,
  type ConferenceTargetDoc,
  type ResolvedTarget,
  type TargetSpec,
} from '../046-conference-identity-backfill/plan'

/** Count of targets, for the index module's log line. */
export const TARGET_COUNT = TARGETS.length

/**
 * The Pirsch identification code that was hardcoded in `src/app/layout.tsx` and
 * injected on EVERY host the platform served. It is Cloud Native Days'
 * analytics property, so it belongs on Cloud Native Days' conference documents
 * and nowhere else.
 */
export const HOUSE_PIRSCH_CODE = 'Jc72d7tD73Ai9raeYVPeXJ0OhEJrrvaK'

/**
 * The three /info FAQ answers that were hardcoded Bergen geography, quoted
 * VERBATIM from `src/app/(main)/info/page.tsx` as it stood before this PR.
 *
 * Two of them interpolated `${conference.city}`, which is why the strings below
 * carry a `{{city}}` placeholder that {@link renderInfoProse} substitutes with
 * the target's own stored city — reproducing exactly what each edition renders
 * today. The substitution is what makes these a true no-op rather than an
 * assumption about which city is stored.
 */
export const HOUSE_INFO_PROSE = {
  venueTravelInfo:
    'The venue is located in the city center of {{city}}, close to Byparken (City Park) where Bybanen and bus routes to the city center terminates. It takes about an hour from {{city}} airport Flesland to the city center. If you are arriving by car, there are parking garages nearby such as Klostergarasjen and Bygarasjen, but we reccomend public transportation.',
  speakerDinnerInfo:
    'Yes! We will host a complimentary speaker dinner for all the speakers and organziers on the evening before the conference at 5 PM. The dinner will be held at a restaurant on the highest mountain in Bergen, Ulriken, with a stunning view of the city.\n We will organize a joint transportation to the lower cable car station for everyone interested, or if you prefer, to hike up together with some of the organizers 🥾 \nYou can find more information about Ulriken on their website at <u><a href="https://ulriken643.no/en/">ulriken643.no</a></u>.',
  localRecommendations:
    'We recommend you to explore the city of {{city}} and the surrounding nature. {{city}} is known for its beautiful nature, mountains, fjords, and the UNESCO World Heritage Site Bryggen. You can find more information about {{city}} on the official tourism website at <u><a href="https://en.visitbergen.com">visitbergen.com</a></u>.',
} as const

export type InfoProseField = keyof typeof HOUSE_INFO_PROSE

/**
 * The event hashtag the live social wall searched for, hardcoded in
 * `BlueskyAuthorFeedLooping`. It is Cloud Native Day BERGEN 2025's tag, so it
 * is written only to that edition — writing it to the other two would make
 * their venue screens show another event's posts, the exact bug the
 * neutralisation exists to fix.
 */
export const HOUSE_SOCIAL_HASHTAG = '#cndb2025'
export const SOCIAL_HASHTAG_HOST = '2025.cloudnativebergen.dev'

/** Only the fields this migration reads. */
export interface ConferenceDefaultsDoc {
  _id: string
  title?: string | null
  domains?: string[] | null
  city?: string | null
  analyticsPirschCode?: string | null
  venueTravelInfo?: string | null
  speakerDinnerInfo?: string | null
  localRecommendations?: string | null
  socialHashtag?: string | null
}

export type PlannedPath =
  | 'analyticsPirschCode'
  | 'venueTravelInfo'
  | 'speakerDinnerInfo'
  | 'localRecommendations'
  | 'socialHashtag'

export interface PlannedSet {
  path: PlannedPath
  value: string
  /** One-line reason, printed by the dry run. */
  reason: string
}

/** A non-fatal observation the dry run should surface to the operator. */
export type PlanNote = string

/**
 * "This field holds nothing." Only null/undefined and whitespace-only strings
 * qualify — a non-string value is emphatically NOT blank, for the same reason
 * spelled out in 046: wrong-typed data is a job for schema validation, never
 * for a backfill to silently overwrite.
 */
const isBlank = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '')

/**
 * Substitute the target's stored city into a captured prose template. Returns
 * `null` when the template needs a city and the document has none — better to
 * skip the field and say so in the log than to write "the city center of
 * undefined" as permanent data.
 */
export function renderInfoProse(
  template: string,
  city: string | null | undefined,
): string | null {
  if (!template.includes('{{city}}')) return template
  const trimmed = city?.trim()
  if (!trimmed) return null
  return template.split('{{city}}').join(trimmed)
}

/**
 * The complete, ordered list of writes for one target. ONLY fields that are
 * absent are included, so a second run of the same plan yields an empty list.
 */
export function planSets(
  doc: ConferenceDefaultsDoc,
  host: string,
): PlannedSet[] {
  const sets: PlannedSet[] = []

  if (isBlank(doc.analyticsPirschCode)) {
    sets.push({
      path: 'analyticsPirschCode',
      value: HOUSE_PIRSCH_CODE,
      reason:
        'absent — pinning the site code that was hardcoded in the root layout, ' +
        'so this edition keeps reporting into the property it already reports into',
    })
  }

  for (const field of Object.keys(HOUSE_INFO_PROSE) as InfoProseField[]) {
    if (!isBlank(doc[field])) continue
    const value = renderInfoProse(HOUSE_INFO_PROSE[field], doc.city)
    if (value === null) continue
    sets.push({
      path: field,
      value,
      reason:
        'absent — pinning the /info answer this edition renders today from ' +
        'hardcoded prose (city interpolated from the document)',
    })
  }

  // Bergen 2025 only — see HOUSE_SOCIAL_HASHTAG.
  if (host === SOCIAL_HASHTAG_HOST && isBlank(doc.socialHashtag)) {
    sets.push({
      path: 'socialHashtag',
      value: HOUSE_SOCIAL_HASHTAG,
      reason:
        'absent — pinning the hashtag the live social wall searched for, which ' +
        'was hardcoded in BlueskyAuthorFeedLooping',
    })
  }

  return sets
}

/**
 * Things the operator must know about but this migration deliberately does NOT
 * write. Generated from the real data by the dry run.
 */
export function planNotes(doc: ConferenceDefaultsDoc): PlanNote[] {
  const notes: PlanNote[] = []

  if (isBlank(doc.city)) {
    notes.push(
      'city is absent, so the two /info answers that interpolate it were SKIPPED. ' +
        'MANUAL: write "How do I get to the venue?" and the local-recommendations ' +
        'answer in Admin → Settings → Local Information, or those questions stop ' +
        'rendering on /info.',
    )
  }

  return notes
}
