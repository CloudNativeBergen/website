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
  erased: [] as string[],
  proposals: [] as unknown[],
  createFails: 0,
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
    fetch: vi.fn(async (q: string) =>
      q.includes('erasedAt')
        ? h.erased
        : q.includes('travelSupport')
          ? []
          : h.existing,
    ),
  },
  clientWrite: {
    createIfNotExists: vi.fn(async (doc: Record<string, unknown>) => {
      if (h.createFails > 0) {
        h.createFails--
        throw new Error('sanity down')
      }
      h.created.push(doc)
      return doc
    }),
  },
}))

const getProposals = vi.fn(async (_args: unknown) => ({
  proposals: h.proposals,
  proposalsError: null,
}))
vi.mock('@/lib/proposal/data/sanity', () => ({
  getProposals: (args: unknown) => getProposals(args),
}))
vi.mock('@/lib/speaker/ticketInputs', () => ({
  fetchSpeakerTicketInputs: async () => null,
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
  BRIEFING_TIME_BUDGET_MS,
  loadBriefingSpeakers,
  renderSpeakerBriefing,
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
  h.erased = []
  h.proposals = []
  h.createFails = 0
  vi.restoreAllMocks()
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
    expect(result).toEqual({
      sent: 1,
      skipped: 1,
      failed: [],
      logFailed: [],
      remaining: 0,
    })
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
    const [first, second] = h.send.mock.calls.map((c) => c[0])
    expect(first.subject).toMatch(/\(updated\)$/)
    expect(first.html).toContain(
      'This is an update to the speaker info we sent earlier.',
    )
    expect(second.subject).not.toMatch(/updated/)
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

  it('retries a failed marker write once, then reports it apart', async () => {
    h.createFails = 1
    let result = await sendSpeakerBriefings(conference, [speaker('sp-1')])
    expect(result).toMatchObject({ sent: 1, logFailed: [] })
    expect(h.created).toHaveLength(1)

    h.createFails = 2
    result = await sendSpeakerBriefings(conference, [speaker('sp-2')])
    expect(result.sent).toBe(1)
    expect(result.logFailed).toEqual([
      { speakerId: 'sp-2', name: 'Speaker sp-2' },
    ])
  })

  it('stops at the time budget and resumes on the next call', async () => {
    let clock = 0
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    h.send.mockImplementation(async () => {
      clock += BRIEFING_TIME_BUDGET_MS / 2 + 1
      return { data: { id: 'x' }, error: null }
    })
    const all = ['sp-1', 'sp-2', 'sp-3'].map(speaker)
    const first = await sendSpeakerBriefings(conference, all)
    expect(first).toMatchObject({ sent: 2, remaining: 1 })

    clock = 0
    h.existing = h.created.map((d) => ({
      _id: d._id as string,
      speakerId: (d.speaker as { _ref: string })._ref,
    }))
    const second = await sendSpeakerBriefings(conference, all)
    expect(second).toMatchObject({ sent: 1, skipped: 2, remaining: 0 })
    expect(h.send.mock.calls.map((c) => c[0].to)).toEqual([
      'sp-1@example.com',
      'sp-2@example.com',
      'sp-3@example.com',
    ])
  })

  it('renders the same output twice in a row', async () => {
    const a = await renderSpeakerBriefing(conference, speaker('sp-1'))
    const b = await renderSpeakerBriefing(conference, speaker('sp-1'))
    expect(a).toBe(b)
  })
})

describe('loadBriefingSpeakers', () => {
  const talk = (id: string, status: string, speakers: unknown[]) => ({
    _id: id,
    title: id,
    status,
    speakers,
  })
  const sp = (id: string, email = `${id}@example.com`) => ({
    _id: id,
    name: id,
    email,
  })

  it('reads this conference only and keeps confirmed speakers with an address', async () => {
    h.proposals = [
      talk('t1', 'confirmed', [sp('ada'), sp('noemail', ' ')]),
      talk('t2', 'accepted', [sp('accepted-only')]),
      talk('t3', 'confirmed', [sp('gone')]),
      talk('t4', 'accepted', [sp('ada')]),
    ]
    h.erased = ['gone']
    const speakers = await loadBriefingSpeakers(
      conference as unknown as Parameters<typeof loadBriefingSpeakers>[0],
    )
    expect(getProposals).toHaveBeenCalledWith(
      expect.objectContaining({
        conferenceId: 'conf-A',
        statuses: ['accepted', 'confirmed'],
      }),
    )
    expect(speakers.map((s) => s._id)).toEqual(['ada'])
    // Both of Ada's talks, so the accepted one can still raise a to-do.
    expect(speakers[0].proposals.map((p) => p._id)).toEqual(['t1', 't4'])
  })
})
