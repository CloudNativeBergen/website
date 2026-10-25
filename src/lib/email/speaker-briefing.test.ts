/**
 * @vitest-environment node
 *
 * The briefing send: rendered by the real template; Resend is replaced at
 * `resolveEmailSender` and Sanity at its clients.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  send: vi.fn(),
  existing: [] as { _id: string; speakerId: string }[],
  notified: [] as unknown[],
  created: [] as Record<string, unknown>[],
}))

vi.mock('./config', async (original) => {
  const real = await original<typeof import('./config')>()
  return {
    ...real,
    delay: async () => {},
    resolveEmailSender: async () => ({
      client: { emails: { send: h.send } },
      from: undefined,
      platform: false,
    }),
  }
})

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: vi.fn(async () => h.existing),
  },
  clientWrite: {
    createIfNotExists: vi.fn(async (doc: Record<string, unknown>) => {
      h.created.push(doc)
      return doc
    }),
  },
}))

vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn(async (items: unknown[]) => {
    h.notified.push(...items)
    return items.length
  }),
}))

import {
  briefingLogId,
  briefingVersion,
  sendSpeakerBriefings,
  type BriefingConference,
  type BriefingSpeaker,
} from './speaker-briefing'
import type { ProposalExisting } from '@/lib/proposal/types'

const conference = {
  _id: 'conf-A',
  title: 'Conf A',
  organizer: 'Org A',
  cfpEmail: 'cfp@a.example.com',
  domains: ['a.example.com'],
  organization: { _type: 'reference', _ref: 'org-A' },
  startDate: '2026-10-28',
  venueName: 'Grieghallen',
  speakerInfo: { updatedAt: '2026-10-01T10:00:00.000Z' },
} as unknown as BriefingConference
const VERSION = briefingVersion(conference)

const speaker = (id: string): BriefingSpeaker => ({
  _id: id,
  name: `Speaker ${id}`,
  email: `${id}@example.com`,
  proposals: [
    { _id: `t-${id}`, title: 'Talk', status: 'confirmed' } as ProposalExisting,
  ],
})

beforeEach(() => {
  h.send.mockReset()
  h.send.mockResolvedValue({ data: { id: 'x' }, error: null })
  h.existing = []
  h.created = []
  h.notified = []
})

describe('sendSpeakerBriefings', () => {
  it('versions by shared content, not by save time', () => {
    const resaved = {
      ...conference,
      speakerInfo: { updatedAt: '2026-10-02T09:00:00.000Z' },
    } as BriefingConference
    expect(briefingVersion(resaved)).toBe(VERSION)
    expect(briefingVersion({ ...conference, venueName: 'Elsewhere' })).not.toBe(
      VERSION,
    )
    expect(briefingLogId('c', 's', VERSION)).toMatch(
      /^briefing\.c\.s\.[0-9a-f]{16}$/,
    )
  })

  it('skips speakers who already have the current version', async () => {
    h.existing = [
      { _id: briefingLogId('conf-A', 'sp-1', VERSION), speakerId: 'sp-1' },
    ]
    const result = await sendSpeakerBriefings(conference, [
      speaker('sp-1'),
      speaker('sp-2'),
    ])
    expect(result).toEqual({ sent: 1, skipped: 1, failed: [] })
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.send.mock.calls[0][0].to).toBe('sp-2@example.com')
    expect(h.send.mock.calls[0][0].replyTo).toBe('cfp@a.example.com')
    expect(h.send.mock.calls[0][1]).toEqual({
      idempotencyKey: briefingLogId('conf-A', 'sp-2', VERSION),
    })
    expect(h.created).toHaveLength(1)
    expect(h.created[0]).toMatchObject({
      _id: briefingLogId('conf-A', 'sp-2', VERSION),
      _type: 'scheduledReminderLog',
      key: 'speaker-briefing',
      version: VERSION,
    })
  })

  it('notifies in the hub only speakers who had an older version', async () => {
    h.existing = [
      {
        _id: briefingLogId('conf-A', 'sp-1', 'oldversion000000'),
        speakerId: 'sp-1',
      },
    ]
    const result = await sendSpeakerBriefings(conference, [
      speaker('sp-1'),
      speaker('sp-2'),
    ])
    expect(result.sent).toBe(2)
    expect(h.notified).toEqual([
      expect.objectContaining({
        recipientId: 'sp-1',
        notificationType: 'system',
        link: '/cfp/list#briefing',
      }),
    ])
  })

  it('writes no marker for a failed send', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'bad `to`', name: 'validation_error', statusCode: 422 },
    })
    const result = await sendSpeakerBriefings(conference, [speaker('sp-1')])
    expect(result.sent).toBe(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].speakerId).toBe('sp-1')
    expect(h.created).toHaveLength(0)
  })
})
