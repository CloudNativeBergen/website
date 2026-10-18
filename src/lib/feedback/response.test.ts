/**
 * @vitest-environment node
 *
 * This device's own response, as the Answered state reads it (speaker
 * feedback spec §7.4): by id through the doc endpoint, only for a talk the
 * cookie lists, cached per response. The doc endpoint is a mock here: there
 * is no GROQ to execute, and what is asserted is WHICH ids are read and what
 * of the document reaches the caller.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedbackResponseTag } from '@/lib/cache/tags'

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  docReads: [] as string[],
  cacheLife: [] as unknown[],
  cacheTag: [] as unknown[],
}))

vi.mock('next/cache', () => ({
  cacheLife: (life: unknown) => h.cacheLife.push(life),
  cacheTag: (tag: unknown) => h.cacheTag.push(tag),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    getDocument: async (id: string) => {
      h.docReads.push(id)
      // Sanity's doc endpoint takes a comma-separated LIST of ids too.
      const first = id.split(',')[0]
      return h.docs.get(first) ?? null
    },
  },
}))

import { feedbackResponseId, recordAnswer } from './device'
import { FEEDBACK_RESPONSE_LIFE, ownFeedbackAnswer } from './response'

const NOW = new Date('2026-10-26T09:30:00.000Z')
const device = recordAnswer(null, 'talk-open', NOW).device
const id = feedbackResponseId(device.token, 'talk-open')

const response = (fields: Record<string, unknown> = {}) => ({
  _id: id,
  _type: 'feedbackResponse',
  talk: { _type: 'reference', _ref: 'talk-open' },
  conference: { _type: 'reference', _ref: 'conf-A' },
  colour: 'green',
  submittedAt: '2026-10-26T09:20:00.000Z',
  ...fields,
})

beforeEach(() => {
  h.docs.clear()
  h.docReads.length = 0
  h.cacheLife.length = 0
  h.cacheTag.length = 0
})

describe('ownFeedbackAnswer', () => {
  it('reads this device’s response about the talk by its id, and gives the colour and comment', async () => {
    h.docs.set(id, response({ comment: 'Great demo' }))
    expect(await ownFeedbackAnswer(device, 'talk-open')).toEqual({
      colour: 'green',
      comment: 'Great demo',
    })
    expect(h.docReads).toEqual([id])
  })

  it('is cached per response for 5 minutes, tagged with the response id', async () => {
    h.docs.set(id, response())
    await ownFeedbackAnswer(device, 'talk-open')
    expect(h.cacheTag).toEqual([feedbackResponseTag(id)])
    expect(h.cacheLife).toEqual([FEEDBACK_RESPONSE_LIFE])
    expect(FEEDBACK_RESPONSE_LIFE.revalidate).toBe(5 * 60)
  })

  it('gives no comment when none was sent', async () => {
    h.docs.set(id, response())
    expect(await ownFeedbackAnswer(device, 'talk-open')).toEqual({
      colour: 'green',
      comment: null,
    })
  })

  it('never tells the page a comment was hidden or flagged', async () => {
    h.docs.set(
      id,
      response({
        comment: 'rude',
        hiddenAt: '2026-10-26T09:25:00.000Z',
        flaggedAt: '2026-10-26T09:24:00.000Z',
      }),
    )
    const answer = await ownFeedbackAnswer(device, 'talk-open')
    expect(Object.keys(answer!).sort()).toEqual(['colour', 'comment'])
    expect(JSON.stringify(answer)).not.toMatch(/hidden|flagged/)
  })

  it('is "no answer yet" when the document does not exist: a cookie can list an answer that was never saved', async () => {
    expect(await ownFeedbackAnswer(device, 'talk-open')).toBeNull()
    expect(h.docReads).toEqual([id])
  })

  it('reads nothing for a talk the cookie does not list', async () => {
    h.docs.set(feedbackResponseId(device.token, 'talk-other'), response())
    expect(await ownFeedbackAnswer(device, 'talk-other')).toBeNull()
    expect(await ownFeedbackAnswer(null, 'talk-open')).toBeNull()
    expect(h.docReads).toEqual([])
  })

  it('refuses a document that is not this response: another id, type, talk or colour', async () => {
    for (const [field, value] of [
      ['_id', 'feedbackResponse-00000000000000000000000000000000'],
      ['_type', 'talk'],
      ['talk', { _type: 'reference', _ref: 'talk-other' }],
      ['colour', 'blue'],
    ] as const) {
      // Positive control: the same document with the field as it should be
      // IS this response, so the refusal below is the field's doing.
      h.docs.set(id, response())
      expect(await ownFeedbackAnswer(device, 'talk-open')).not.toBeNull()
      h.docs.set(id, response({ [field]: value }))
      expect(await ownFeedbackAnswer(device, 'talk-open'), field).toBeNull()
    }
  })
})
