/**
 * The public talk projection (#1887). The mapping test pins `PublicTalk` to
 * its exact keys so an organizer-only field cannot reach a public page; the
 * store tests run the real query text through groq-js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runGroq } from '../../helpers/sanityStore'
import { toPublicTalk } from '@/lib/proposal/public'

const h = vi.hoisted(() => ({ docs: [] as Record<string, unknown>[] }))

vi.mock('@/lib/sanity/client', () => {
  const fetch = (query: string, params?: Record<string, unknown>) =>
    runGroq(h.docs as never, query, params ?? {})
  return {
    clientReadCached: { fetch },
    clientReadUncached: { fetch },
    clientRead: { fetch },
    clientWrite: {},
  }
})

const { listPublicTalks } = await import('@/lib/proposal/server')

const organizerRow = {
  _id: 'talk-1',
  _rev: 'r1',
  _type: 'talk',
  title: 'Talk',
  description: 'About it',
  language: 'english',
  level: 'beginner',
  format: 'presentation_25',
  attachments: [],
  scheduleInfo: { date: '2026-10-01' },
  status: 'confirmed',
  withdrawnReason: 'x',
  outline: 'private outline',
  notes: 'organizer note',
  reviews: [{ comment: 'meh' }],
  reviewSummary: { count: 1 },
  _organizationId: 'org-1',
  conference: { _ref: 'conf-a', _type: 'reference' },
  coSpeakerInvitations: [{ email: 'co@example.com' }],
  issuedSpeakerTickets: [{ email: 'a@example.com' }],
  utm: { source: 'x' },
  speakers: [
    {
      _id: 's1',
      name: 'Ada',
      title: 'Eng',
      slug: 'ada',
      image: 'img',
      email: 'ada@example.com',
      knownEmails: ['ada@example.com'],
    },
  ],
  topics: [{ _id: 'tp1', title: 'K8s', slug: 'k8s', color: 'red' }],
}

describe('toPublicTalk', () => {
  it('copies exactly the public fields', () => {
    const talk = toPublicTalk(organizerRow)
    expect(Object.keys(talk).sort()).toEqual(
      [
        '_id',
        'attachments',
        'description',
        'format',
        'language',
        'level',
        'scheduleInfo',
        'speakers',
        'title',
        'topics',
      ].sort(),
    )
    expect(Object.keys(talk.speakers![0]).sort()).toEqual(
      ['_id', 'image', 'name', 'slug', 'title'].sort(),
    )
    expect(Object.keys(talk.topics![0]).sort()).toEqual(
      ['_id', 'slug', 'title'].sort(),
    )
  })

  it('never carries reviews, notes, status internals or emails', () => {
    const json = JSON.stringify(toPublicTalk(organizerRow))
    for (const leak of [
      'reviews',
      'reviewSummary',
      'notes',
      'organizer note',
      'status',
      'withdrawnReason',
      'outline',
      '_organizationId',
      'conference',
      'coSpeakerInvitations',
      'issuedSpeakerTickets',
      '@example.com',
    ]) {
      expect(json).not.toContain(leak)
    }
  })
})

describe('listPublicTalks', () => {
  beforeEach(() => {
    h.docs = [
      { _id: 's1', _type: 'speaker', name: 'Ada', slug: { current: 'ada' } },
      {
        _id: 'mine',
        _type: 'talk',
        title: 'Mine',
        status: 'confirmed',
        conference: { _ref: 'conf-a' },
        speakers: [{ _ref: 's1' }],
        reviews: [{ comment: 'meh' }],
      },
      {
        _id: 'foreign',
        _type: 'talk',
        title: 'Other conference',
        status: 'confirmed',
        conference: { _ref: 'conf-b' },
        speakers: [{ _ref: 's1' }],
      },
      {
        _id: 'pending',
        _type: 'talk',
        title: 'Not confirmed',
        status: 'submitted',
        conference: { _ref: 'conf-a' },
        speakers: [{ _ref: 's1' }],
      },
      {
        _id: 'draft-day',
        _type: 'schedule',
        status: 'draft',
        date: '2026-01-01',
        conference: { _ref: 'conf-a' },
        tracks: [{ trackTitle: 'Draft', talks: [{ talk: { _ref: 'mine' } }] }],
      },
      {
        _id: 'official-day',
        _type: 'schedule',
        status: 'official',
        date: '2026-02-02',
        conference: { _ref: 'conf-a' },
        tracks: [
          {
            trackTitle: 'Main',
            talks: [
              { talk: { _ref: 'mine' }, startTime: '09:00', endTime: '09:30' },
            ],
          },
        ],
      },
    ]
  })

  it('returns only confirmed talks in the requested conference', async () => {
    const { talks, err } = await listPublicTalks('conf-a', { speakerId: 's1' })
    expect(err).toBeNull()
    expect(talks.map((t) => t._id)).toEqual(['mine'])
    expect(JSON.stringify(talks)).not.toContain('meh')
  })

  it('scopes by conference: the other conference sees only its own talk', async () => {
    const { talks } = await listPublicTalks('conf-b', { speakerId: 's1' })
    expect(talks.map((t) => t._id)).toEqual(['foreign'])
  })

  it('resolves the slot from the OFFICIAL schedule only', async () => {
    const { talks } = await listPublicTalks('conf-a', { speakerId: 's1' })
    expect(talks[0].scheduleInfo).toEqual({
      date: '2026-02-02',
      trackTitle: 'Main',
      timeSlot: { startTime: '09:00', endTime: '09:30' },
    })
  })
  it('treats a legacy status-less schedule as official', async () => {
    h.docs = h.docs.map((d) => {
      if (d._id !== 'official-day') return d
      const { status: _status, ...legacy } = d
      return legacy
    })
    const { talks } = await listPublicTalks('conf-a', { speakerId: 's1' })
    expect(talks[0].scheduleInfo).toEqual({
      date: '2026-02-02',
      trackTitle: 'Main',
      timeSlot: { startTime: '09:00', endTime: '09:30' },
    })
  })
})
