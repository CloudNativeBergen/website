import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

// --- Mocks (data layer + fan-out boundaries) -------------------------------

const validateMock = vi.fn()
const getFanoutMock = vi.fn()
vi.mock('@/lib/messaging/sponsor', () => ({
  validateSponsorMessagingToken: (...a: unknown[]) => validateMock(...a),
  getSponsorFanoutContext: (...a: unknown[]) => getFanoutMock(...a),
}))

const ensureMock = vi.fn()
const getConversationMock = vi.fn()
const listMessagesMock = vi.fn()
const addMessageMock = vi.fn()
vi.mock('@/lib/messaging/sanity', () => ({
  sponsorConversationId: (id: string) => `conversation.sponsor.${id}`,
  ensureSponsorConversation: (...a: unknown[]) => ensureMock(...a),
  getConversationById: (...a: unknown[]) => getConversationMock(...a),
  listMessages: (...a: unknown[]) => listMessagesMock(...a),
  addMessage: (...a: unknown[]) => addMessageMock(...a),
}))

vi.mock('@/lib/messaging/notify', () => ({
  notifySponsorMessage: vi.fn(),
}))

// runAfterResponse: noop (fan-out wiring is covered by notifySponsor.test.ts).
vi.mock('@/server/runAfterResponse', () => ({ runAfterResponse: vi.fn() }))

import { sponsorMessagesRouter } from './sponsorMessages'

const caller = sponsorMessagesRouter.createCaller({} as unknown as Context)

const CTX = {
  sfcId: 'sfc-1',
  conferenceId: 'conf-1',
  sponsorName: 'Acme Corp',
  contactPersons: [
    { name: 'Dana Diaz', email: 'dana@acme.test' },
    { name: 'Sam Stone', email: 'sam@acme.test' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  validateMock.mockResolvedValue(CTX)
  ensureMock.mockResolvedValue('conversation.sponsor.sfc-1')
  addMessageMock.mockResolvedValue({
    _id: 'message.1',
    body: 'hi',
    createdAt: '2026-07-01T00:00:00Z',
    authorName: 'Dana Diaz',
    authorSponsorId: 'sfc-1',
  })
  getConversationMock.mockResolvedValue(null)
  listMessagesMock.mockResolvedValue([])
  getFanoutMock.mockResolvedValue(null)
})

describe('sponsorMessages.list', () => {
  it('404s an invalid token with no enumeration oracle', async () => {
    validateMock.mockResolvedValueOnce(null)
    await expect(caller.list({ token: 'bad-token' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('returns contact names + an empty thread when nothing posted yet', async () => {
    const res = await caller.list({ token: 'valid-list-1' })
    expect(res.contactNames).toEqual(['Dana Diaz', 'Sam Stone'])
    expect(res.messages).toEqual([])
    expect(res.sponsorName).toBe('Acme Corp')
  })

  it('maps sponsor vs organizer messages (fromSponsor flag)', async () => {
    getConversationMock.mockResolvedValueOnce({
      _id: 'conversation.sponsor.sfc-1',
      subject: 'Acme Corp',
    })
    listMessagesMock.mockResolvedValueOnce([
      {
        _id: 'm2',
        body: 'org reply',
        createdAt: '2026-07-02',
        authorId: 'org-1',
      },
      {
        _id: 'm1',
        body: 'sponsor msg',
        createdAt: '2026-07-01',
        authorName: 'Dana Diaz',
        authorSponsorId: 'sfc-1',
      },
    ])
    const res = await caller.list({ token: 'valid-list-2' })
    expect(res.messages.find((m) => m._id === 'm1')?.fromSponsor).toBe(true)
    expect(res.messages.find((m) => m._id === 'm2')?.fromSponsor).toBe(false)
  })
})

describe('sponsorMessages.send — token + validation', () => {
  it('404s an invalid token', async () => {
    validateMock.mockResolvedValueOnce(null)
    await expect(
      caller.send({ token: 'bad-send', body: 'hi', authorName: 'Dana Diaz' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects an authorName that is not a contact person (STRICT match)', async () => {
    await expect(
      caller.send({
        token: 'strict-1',
        body: 'hi',
        authorName: 'Mallory Malware',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(addMessageMock).not.toHaveBeenCalled()
  })

  it('appends a sponsor-authored message on a valid contact name', async () => {
    const res = await caller.send({
      token: 'happy-1',
      body: 'A real question',
      authorName: 'Dana Diaz',
    })
    expect(ensureMock).toHaveBeenCalledOnce()
    expect(addMessageMock).toHaveBeenCalledOnce()
    expect(addMessageMock.mock.calls[0][0]).toMatchObject({
      sponsorAuthor: { sponsorForConferenceId: 'sfc-1', authorName: 'Dana Diaz' },
    })
    expect(res.message.fromSponsor).toBe(true)
  })
})

describe('sponsorMessages.send — rate limit (5/min per token)', () => {
  it('allows a burst of 5 then rejects the 6th', async () => {
    const token = 'rate-limit-token'
    for (let i = 0; i < 5; i++) {
      await caller.send({ token, body: `msg ${i}`, authorName: 'Dana Diaz' })
    }
    await expect(
      caller.send({ token, body: 'over', authorName: 'Dana Diaz' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })
})
