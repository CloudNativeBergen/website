import { createHash } from 'node:crypto'
import type { JevAnswer } from './client'
import { QUESTION_SET_VERSIONS, type DecisionRequest } from './questions'

/**
 * The `contentJudgement` document (Content judgement spec §7.1), shared by
 * every surface so all of them agree on the id scheme and the stored shape.
 * Pure: each surface writes it in its own transaction, with its summary.
 */

export type JudgementSurface = keyof typeof QUESTION_SET_VERSIONS
export type JudgementPart = 'caption' | 'photo' | 'comment' | 'opening'

/** Deterministic per content, so the latest Judgement replaces the previous. */
export function judgementId(contentId: string): string {
  return `contentJudgement-${contentId}`
}

/**
 * SHA-256 of exactly the content that was sent (the request's `state`, text
 * and image bytes), not the questions or the model: shows whether the content
 * changed since it was judged.
 */
export function contentHash(request: DecisionRequest): string {
  return createHash('sha256')
    .update(JSON.stringify(request.state))
    .digest('hex')
}

export interface JudgementInput {
  conferenceId: string
  surface: JudgementSurface
  contentId: string
  request: DecisionRequest
  outcome: { model: string; inputTokens: number | null }
  /** One entry per part (a Wall Post has `caption` and `photo`). */
  parts: { part: JudgementPart; answers: Record<string, JevAnswer> }[]
  judgedAt: string
}

export function judgementDocument(input: JudgementInput) {
  const { outcome } = input
  return {
    _id: judgementId(input.contentId),
    _type: 'contentJudgement' as const,
    conference: { _type: 'reference' as const, _ref: input.conferenceId },
    surface: input.surface,
    content: {
      _type: 'reference' as const,
      _ref: input.contentId,
      _weak: true as const,
    },
    parts: input.parts.map(({ part, answers }) => ({
      _key: part,
      part,
      answers: Object.entries(answers).map(([question, answer]) =>
        storedAnswer(question, answer),
      ),
    })),
    model: outcome.model,
    questionSet: QUESTION_SET_VERSIONS[input.surface],
    contentHash: contentHash(input.request),
    inputTokens: outcome.inputTokens ?? undefined,
    judgedAt: input.judgedAt,
  }
}

function storedAnswer(question: string, answer: JevAnswer) {
  if (answer.type === 'noul')
    return { _key: question, question, probability: answer.noul }
  return {
    _key: question,
    question,
    choice: answer.choice,
    probabilities: Object.entries(answer.probabilities).map(
      ([choice, probability]) => ({ _key: choice, choice, probability }),
    ),
    confidence: answer.confidence,
  }
}
