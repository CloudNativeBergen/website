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

/**
 * A stored summary as the server reads it back: the shape above, checked
 * field by field, so one parser serves the page (`CommentJudgement`) and the
 * tally. A shape this code does not recognise is `null` (no Judgement).
 */
export type ParsedJudgementSummary =
  | {
      state: 'judged'
      reasons: { question: string; probability: number }[]
      model: string | null
      questionSet: string | null
      talliedAt: string | null
    }
  | { state: 'notJudged'; why: 'failed' | 'spendCap' }

export function parseJudgementSummary(
  summary: unknown,
): ParsedJudgementSummary | null {
  if (typeof summary !== 'object' || summary === null) return null
  const s = summary as Record<string, unknown>
  if (s.state === 'notJudged')
    return {
      state: 'notJudged',
      why: s.notJudgedWhy === 'spendCap' ? 'spendCap' : 'failed',
    }
  if (s.state !== 'judged') return null
  const reasons = (Array.isArray(s.reasons) ? s.reasons : []).flatMap((r) => {
    const reason = r as { question?: unknown; probability?: unknown } | null
    return typeof reason?.question === 'string' &&
      typeof reason.probability === 'number'
      ? [{ question: reason.question, probability: reason.probability }]
      : []
  })
  return {
    state: 'judged',
    reasons,
    model: typeof s.model === 'string' ? s.model : null,
    questionSet: typeof s.questionSet === 'string' ? s.questionSet : null,
    talliedAt: typeof s.talliedAt === 'string' ? s.talliedAt : null,
  }
}

export function notJudgedSummary(
  notJudgedWhy: NotJudgedWhy,
  judgedAt: string,
): JudgementSummary {
  return { state: 'notJudged', notJudgedWhy, judgedAt }
}
