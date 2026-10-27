/**
 * TRIAGE of a talk's comments (Content judgement spec §8.2): what Jev's
 * advice on a comment says, and which of the three tiles a comment counts
 * under. Client-safe and pure: the server filters and counts with it
 * (`readTalkFeedback`), the panel renders with it.
 *
 * Speaker flags and Jev's advice are counted apart, so Jev's mistakes never
 * read as complaints. A Keep ends the advice (§8.2); a hidden comment has
 * been dealt with and counts under nothing.
 */

/** Jev's advice on a comment, as organizers see it (summary §7.2). */
export type CommentJudgement =
  | {
      state: 'judged'
      /** Every question at or above 0.5, strongest first. */
      reasons: { question: string; probability: number }[]
    }
  | { state: 'notJudged'; why: 'failed' | 'spendCap' }

/** An organizer's Keep: who (null once erased or unknown) and when. */
export interface CommentKeep {
  by: string | null
  at: string
}

export interface TriagedComment {
  hidden: boolean
  /** A speaker's flag no organizer has acted on. */
  flagged: boolean
  /** `null`: no Judgement yet, or the organization has judgement off. */
  judgement: CommentJudgement | null
  kept: CommentKeep | null
}

/**
 * Organizer copy per question: what to check, not what Jev "thinks".
 * `personal_info` is one probability, so "personal details", never "a phone
 * number" (§8.2).
 */
export const REASON_COPY: Record<string, string> = {
  abusive: 'may be abusive',
  sexual: 'may be sexual',
  spam: 'looks like spam',
  personal_info: 'may contain personal details',
}

export const percent = (probability: number) =>
  `${Math.round(probability * 100)}%`

/** "may be sexual (82%), may be abusive (71%)": every reason, strongest first. */
export function reasonText(judgement: CommentJudgement | null): string {
  if (judgement?.state !== 'judged') return ''
  return judgement.reasons
    .map(
      (r) =>
        `${REASON_COPY[r.question] ?? r.question} (${percent(r.probability)})`,
    )
    .join(', ')
}

/** Likely unsafe (§2): a Judgement with any answer at or above 0.5. */
export const likelyUnsafe = (judgement: CommentJudgement | null) =>
  judgement?.state === 'judged' && judgement.reasons.length > 0

/** Flagged by a speaker, no organizer has acted. */
export const bySpeaker = (c: TriagedComment) => !c.hidden && c.flagged

/** Jev's open advice: likely unsafe, not hidden, not kept. */
export const unsafe = (c: TriagedComment) =>
  !c.hidden && !c.kept && likelyUnsafe(c.judgement)

/** Not judged (§2): no Judgement, or one that could not be made. */
export const unchecked = (c: TriagedComment) =>
  !c.hidden && (c.judgement === null || c.judgement.state === 'notJudged')

/** A comment whose text is collapsed behind its reason line (§8.2). */
export const needsALook = (c: TriagedComment) => bySpeaker(c) || unsafe(c)

export const TRIAGE_FILTERS = ['speaker', 'unsafe', 'unchecked'] as const
export type TriageFilter = (typeof TRIAGE_FILTERS)[number]

const MATCHES: Record<TriageFilter, (c: TriagedComment) => boolean> = {
  speaker: bySpeaker,
  unsafe,
  unchecked,
}

export const matchesTriage = (c: TriagedComment, filter: TriageFilter) =>
  MATCHES[filter](c)

/** The three tiles' counts, and how many comments there are in all. */
export interface TriageCounts {
  all: number
  speaker: number
  unsafe: number
  unchecked: number
}

export function triageCounts(
  comments: readonly TriagedComment[],
): TriageCounts {
  return {
    all: comments.length,
    speaker: comments.filter(bySpeaker).length,
    unsafe: comments.filter(unsafe).length,
    unchecked: comments.filter(unchecked).length,
  }
}
