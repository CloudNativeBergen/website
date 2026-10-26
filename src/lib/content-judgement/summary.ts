import type { JevAnswer } from './client'
import { QUESTION_SET_VERSIONS } from './questions'
import type { JudgementPart, JudgementSurface } from './store'

/**
 * The summary a judging task writes on the content itself (Content judgement
 * spec §7.2), so the queues render without a join. Pure; every surface
 * writes it in the same transaction as its Judgement record.
 */

/** "Likely unsafe": any moderation answer at or above this (spec §2). */
export const ADVICE_THRESHOLD = 0.5

export interface JudgementReason {
  /** `<part>.<question>`: Sanity array items need a key. */
  _key: string
  part: JudgementPart
  question: string
  probability: number
}

export type NotJudgedWhy = 'failed' | 'spendCap' | 'imageMissing' | 'photoSize'

export type JudgementSummary =
  | {
      state: 'judged'
      /** Every question at or above the threshold, strongest first. */
      reasons: JudgementReason[]
      /**
       * The build and question set that answered, so an organizer's decision
       * can be tallied (§7.3) without reading the record. Implementation
       * detail on top of §7.2; no personal data.
       */
      model: string
      questionSet: string
      judgedAt: string
    }
  | { state: 'notJudged'; notJudgedWhy: NotJudgedWhy; judgedAt: string }

/** Judged: the reasons at or above the threshold, strongest first. */
export function judgedSummary({
  surface,
  model,
  parts,
  judgedAt,
}: {
  surface: JudgementSurface
  model: string
  parts: { part: JudgementPart; answers: Record<string, JevAnswer> }[]
  judgedAt: string
}): JudgementSummary {
  const reasons: JudgementReason[] = []
  for (const { part, answers } of parts) {
    for (const [question, answer] of Object.entries(answers)) {
      if (answer.type === 'noul' && answer.noul >= ADVICE_THRESHOLD)
        reasons.push({
          _key: `${part}.${question}`,
          part,
          question,
          probability: answer.noul,
        })
    }
  }
  reasons.sort((a, b) => b.probability - a.probability)
  return {
    state: 'judged',
    reasons,
    model,
    questionSet: QUESTION_SET_VERSIONS[surface],
    judgedAt,
  }
}

export function notJudgedSummary(
  notJudgedWhy: NotJudgedWhy,
  judgedAt: string,
): JudgementSummary {
  return { state: 'notJudged', notJudgedWhy, judgedAt }
}
