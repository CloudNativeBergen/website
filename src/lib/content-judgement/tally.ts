import type { Transaction } from '@sanity/client'
import type { JudgementSurface } from './store'
import { parseJudgementSummary } from './summary'

/**
 * The agreement tally (Content judgement spec §7.3): an anonymous,
 * platform-wide count of organizers' decisions on content Jev flagged. One
 * `judgementTally` document per surface × model build × question set ×
 * question × score band, with `agreed` and `disagreed` counters, incremented
 * with `inc` IN THE SAME TRANSACTION as the organizer's action.
 *
 * It references no content, organization or conference and holds no personal
 * data, so it is deliberately outside tenancy (`sanity/schemaTypes/
 * judgementTally.ts`). Nothing here reads it: J7's gate computation will, with
 * an annotated query.
 *
 * Pure: builds mutations on a transaction the caller commits.
 */

/** Moderation bands (§7.3): `[0.5, 0.9)` and `[0.9, 1]`. */
export type ScoreBand = '0.5-0.9' | '0.9-1'

export const scoreBand = (probability: number): ScoreBand =>
  probability >= 0.9 ? '0.9-1' : '0.5-0.9'

/** Hide, Remove or Reject agree with the flag; Keep or Approve disagree. */
export type TallyDecision = 'agreed' | 'disagreed'

export interface TallyKey {
  surface: JudgementSurface
  /** The dated build, e.g. `typesafe/jev-1.14-20261014`. */
  model: string
  questionSet: string
  question: string
  band: ScoreBand
}

/**
 * Deterministic, so `createIfNotExists` + `inc` needs no read. A Sanity id
 * allows `[A-Za-z0-9._-]`; the model's `/` (and anything else) becomes `-`.
 */
export function tallyId(key: TallyKey): string {
  const slug = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '-')
  return `judgementTally-${slug(key.surface)}-${slug(key.questionSet)}-${slug(key.question)}-${slug(key.band)}-${slug(key.model)}`
}

export function tallyDocument(key: TallyKey) {
  return {
    _id: tallyId(key),
    _type: 'judgementTally' as const,
    surface: key.surface,
    model: key.model,
    questionSet: key.questionSet,
    question: key.question,
    band: key.band,
    agreed: 0,
    disagreed: 0,
  }
}

/** What a decision counts against: the flagged questions of one Judgement. */
export interface TallyableJudgement {
  model: string
  questionSet: string
  reasons: { question: string; probability: number }[]
}

/**
 * A stored summary (§7.2) that a decision on it can be tallied against: a
 * judged one with at least one flagged question that has not been tallied
 * yet (once per comment, at its first decision). `null` otherwise, including
 * for a shape this code does not recognise.
 */
export function tallyable(summary: unknown): TallyableJudgement | null {
  const parsed = parseJudgementSummary(summary)
  if (parsed?.state !== 'judged' || parsed.talliedAt) return null
  if (parsed.model === null || parsed.questionSet === null) return null
  const reasons = parsed.reasons.filter((r) => r.probability >= 0.5)
  return reasons.length > 0
    ? { model: parsed.model, questionSet: parsed.questionSet, reasons }
    : null
}

/**
 * Add one decision to `tx`: for EVERY flagged question, in its own band
 * (§7.3 refinement), `createIfNotExists` the tally document and `inc` the
 * decision's counter. The caller commits `tx` with its own action.
 */
export function addTally(
  tx: Transaction,
  surface: JudgementSurface,
  judgement: TallyableJudgement,
  decision: TallyDecision,
): void {
  for (const { question, probability } of judgement.reasons) {
    const key: TallyKey = {
      surface,
      model: judgement.model,
      questionSet: judgement.questionSet,
      question,
      band: scoreBand(probability),
    }
    tx.createIfNotExists(tallyDocument(key))
    tx.patch(tallyId(key), (p) => p.inc({ [decision]: 1 }))
  }
}
