/**
 * @vitest-environment node
 *
 * The briefing send: rendered by the real template; Resend is replaced at
 * `resolveEmailSender` and Sanity at its clients.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  send: vi.fn(),
  existing: [] as string[],
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
    fetch: vi.fn(async (_q: string, { ids }: { ids: string[] }) =>
      ids.filter((id) => h.existing.includes(id)),
    ),
  },
  clientWrite: {
    createIfNotExists: vi.fn(async (doc: Record<string, unknown>) => {
      h.created.push(doc)
      return doc
    }),
  },
}))

import {
  briefingLogId,
  sendSpeakerBriefings,
  type BriefingConference,
  type BriefingSpeaker,
} from './speaker-briefing'
import type { ProposalExisting } from '@/lib/proposal/types'

const VERSION = '2026-10-01T10:00:00.000Z'
const conference = {
  _id: 'conf-A',
  title: 'Conf A',
  organizer: 'Org A',
  cfpEmail: 'cfp@a.example.com',
  domains: ['a.example.com'],
  organization: { _type: 'reference', _ref: 'org-A' },
  startDate: '2026-10-28',
  speakerInfo: { updatedAt: VERSION, extra: [] },
} as unknown as BriefingConference

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
})

describe('sendSpeakerBriefings', () => {
  it('folds the version into a valid Sanity id', () => {
    expect(briefingLogId('c', 's', VERSION)).toBe(
      'briefing.c.s.2026-10-01T10-00-00-000Z',
    )
  })

  it('skips speakers who already have the current version', async () => {
    h.existing = [briefingLogId('conf-A', 'sp-1', VERSION)]
    const result = await sendSpeakerBriefings(conference, [
      speaker('sp-1'),
      speaker('sp-2'),
    ])
    expect(result).toEqual({ sent: 1, skipped: 1, failed: [] })
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.send.mock.calls[0][0].to).toBe('sp-2@example.com')
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
