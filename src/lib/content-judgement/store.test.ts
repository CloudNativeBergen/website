import { describe, expect, it } from 'vitest'
import { buildCommentRequest, buildConversationRequest } from './questions'
import { judgementDocument, judgementId } from './store'

const judgedAt = '2026-10-26T12:00:00.000Z'

describe('judgementDocument', () => {
  it('builds the record for a comment, with no copy of the text', () => {
    const request = buildCommentRequest('Call me on 99 88 77 66')
    const doc = judgementDocument({
      conferenceId: 'conf-1',
      surface: 'feedbackComment',
      contentId: 'feedbackResponse-abc',
      request,
      outcome: { model: 'typesafe/jev-1.14-20261014', inputTokens: 412 },
      parts: [
        {
          part: 'comment',
          answers: {
            abusive: { type: 'noul', noul: 0.01 },
            sexual: { type: 'noul', noul: 0.02 },
            spam: { type: 'noul', noul: 0.1 },
            personal_info: { type: 'noul', noul: 0.93 },
          },
        },
      ],
      judgedAt,
    })

    expect(doc).toEqual({
      _id: 'contentJudgement-feedbackResponse-abc',
      _type: 'contentJudgement',
      conference: { _type: 'reference', _ref: 'conf-1' },
      surface: 'feedbackComment',
      content: {
        _type: 'reference',
        _ref: 'feedbackResponse-abc',
        _weak: true,
      },
      parts: [
        {
          _key: 'comment',
          part: 'comment',
          answers: [
            { _key: 'abusive', question: 'abusive', probability: 0.01 },
            { _key: 'sexual', question: 'sexual', probability: 0.02 },
            { _key: 'spam', question: 'spam', probability: 0.1 },
            {
              _key: 'personal_info',
              question: 'personal_info',
              probability: 0.93,
            },
          ],
        },
      ],
      model: 'typesafe/jev-1.14-20261014',
      questionSet: 'v2',
      // `printf %s '{"comment":"Call me on 99 88 77 66"}' | shasum -a 256`
      contentHash:
        '1243e69fd31f5587d12ebd4ea15dc15b2c6cf368f07a94d8210ac7dd345c3477',
      inputTokens: 412,
      judgedAt,
    })
    expect(JSON.stringify(doc)).not.toContain('99 88 77 66')
  })

  it('stores a category answer with its probabilities and confidence', () => {
    const doc = judgementDocument({
      conferenceId: 'conf-1',
      surface: 'conversation',
      contentId: 'conv-1',
      request: buildConversationRequest({
        subject: 'Visa',
        message: 'Can I get a visa letter?',
        openedBy: 'speaker',
      }),
      outcome: { model: 'typesafe/jev-1.14-20261014', inputTokens: null },
      parts: [
        {
          part: 'opening',
          answers: {
            category: {
              type: 'choice',
              choice: 'travel_and_visa',
              probabilities: { travel_and_visa: 0.91, other: 0.09 },
              confidence: 0.91,
            },
          },
        },
      ],
      judgedAt,
    })

    expect(doc.questionSet).toBe('v2')
    expect(doc.inputTokens).toBeUndefined()
    expect(doc.parts).toEqual([
      {
        _key: 'opening',
        part: 'opening',
        answers: [
          {
            _key: 'category',
            question: 'category',
            choice: 'travel_and_visa',
            probabilities: [
              {
                _key: 'travel_and_visa',
                choice: 'travel_and_visa',
                probability: 0.91,
              },
              { _key: 'other', choice: 'other', probability: 0.09 },
            ],
            confidence: 0.91,
          },
        ],
      },
    ])
  })

  it('changes its hash when the content changes, not when the build does', () => {
    const base = {
      conferenceId: 'conf-1',
      surface: 'feedbackComment' as const,
      contentId: 'r-1',
      parts: [],
      judgedAt,
    }
    const outcome = (model: string) => ({ model, inputTokens: null })
    const a = judgementDocument({
      ...base,
      request: buildCommentRequest('Great talk'),
      outcome: outcome('typesafe/jev-1.14-20261014'),
    })
    const b = judgementDocument({
      ...base,
      request: buildCommentRequest('Great talk'),
      outcome: outcome('typesafe/jev-1.14-20261101'),
    })
    const c = judgementDocument({
      ...base,
      request: buildCommentRequest('Great talk!'),
      outcome: outcome('typesafe/jev-1.14-20261014'),
    })
    expect(a.contentHash).toBe(b.contentHash)
    expect(a.contentHash).not.toBe(c.contentHash)
  })
})

describe('judgementId', () => {
  it('is deterministic per content, so a new Judgement replaces the old', () => {
    expect(judgementId('r-1')).toBe('contentJudgement-r-1')
  })
})
