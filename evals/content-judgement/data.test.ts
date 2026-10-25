import { describe, expect, it } from 'vitest'
import { buildRequest, QUESTION_SET_VERSION } from './questions'
import { categories, loadData, moderationKeys, surfaces } from './schema'

describe('public labelled eval data', () => {
  const expectedCounts = {
    'wall-caption': 130,
    'feedback-comment': 160,
    'conversation-opening': 112,
  }

  it.each(surfaces)(
    '%s is schema-valid, unique, and multilingual',
    (surface) => {
      const items = loadData(surface)
      expect(items.length).toBeGreaterThanOrEqual(expectedCounts[surface] * 0.9)
      expect(items.length).toBeLessThanOrEqual(expectedCounts[surface] * 1.1)
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
      expect(
        items.filter((item) => item.lang !== 'en').length / items.length,
      ).toBeGreaterThanOrEqual(0.4)
      if (surface === 'wall-caption') {
        for (const item of items)
          expect(item.text.length).toBeLessThanOrEqual(80)
      }
    },
  )

  it('has globally unique ids and at least twelve items per conversation category', () => {
    const all = surfaces.flatMap((surface) => loadData(surface))
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length)
    const conversations = loadData('conversation-opening')
    for (const category of categories) {
      expect(
        conversations.filter((item) => item.category === category).length,
      ).toBeGreaterThanOrEqual(12)
    }
  })

  it('keeps harsh-but-fair and benign borderline items unflagged, and evasion meaningful', () => {
    for (const surface of ['wall-caption', 'feedback-comment'] as const) {
      for (const item of loadData(surface)) {
        const positive = moderationKeys.some((key) => item.labels[key])
        if (
          item.tags.includes('harsh_fair') ||
          item.tags.includes('borderline') ||
          item.tags.includes('benign')
        ) {
          expect(positive, item.id).toBe(false)
        }
        if (item.tags.includes('evasion')) expect(positive, item.id).toBe(true)
      }
    }
  })

  it('builds versioned requests with state content and no reference labels', () => {
    expect(QUESTION_SET_VERSION).toBe('v2')
    for (const surface of ['wall-caption', 'feedback-comment'] as const) {
      const item = loadData(surface)[0]
      const request = buildRequest(surface, item)
      expect(Object.keys(request.questions)).toEqual([...moderationKeys])
      expect(request.state).toEqual(
        surface === 'wall-caption'
          ? { caption: item.text }
          : { comment: item.text },
      )
      for (const question of Object.values(request.questions)) {
        expect(question.type).toBe('noul')
        expect(Object.keys(question.criteria)).toEqual(['true', 'false'])
      }
    }
    const item = loadData('conversation-opening')[0]
    const request = buildRequest('conversation-opening', item, 'test/model')
    expect(request.model).toBe('test/model')
    expect(request.state).toEqual({
      subject: item.subject,
      message: item.text,
      openedBy: item.openedBy,
    })
    expect(request.questions.category.type).toBe('choice')
    expect(Object.keys(request.questions.category.criteria)).toEqual([
      ...categories,
    ])
  })
})

describe('schema rejection boundaries', () => {
  it('rejects overlong captions, mistyped labels, and unknown tags', async () => {
    const { wallCaptionSchema } = await import('./schema')
    const item = loadData('wall-caption')[0]
    expect(() =>
      wallCaptionSchema.parse({ ...item, text: 'x'.repeat(81) }),
    ).toThrow()
    expect(() =>
      wallCaptionSchema.parse({
        ...item,
        labels: { ...item.labels, abusive: 'false' },
      }),
    ).toThrow()
    expect(() =>
      wallCaptionSchema.parse({ ...item, tags: ['unsupported'] }),
    ).toThrow()
    expect(() =>
      wallCaptionSchema.parse({ ...item, tags: ['benign', 'benign'] }),
    ).toThrow()
  })
  it('rejects empty/overlong feedback and unsupported conversation options', async () => {
    const { feedbackCommentSchema, conversationOpeningSchema } =
      await import('./schema')
    const feedback = loadData('feedback-comment')[0]
    expect(() =>
      feedbackCommentSchema.parse({ ...feedback, text: '' }),
    ).toThrow()
    expect(() =>
      feedbackCommentSchema.parse({ ...feedback, text: 'x'.repeat(401) }),
    ).toThrow()
    const conversation = loadData('conversation-opening')[0]
    expect(() =>
      conversationOpeningSchema.parse({ ...conversation, category: 'unknown' }),
    ).toThrow()
    expect(() =>
      conversationOpeningSchema.parse({
        ...conversation,
        openedBy: 'attendee',
      }),
    ).toThrow()
    expect(() =>
      conversationOpeningSchema.parse({ ...conversation, lang: 'no' }),
    ).toThrow()
  })
})
