/**
 * The organizer proposal projection (#1887). The mapping test pins
 * `OrganizerProposal` to its exact keys so no raw document field or Sanity ref
 * rides along; the tenancy test runs the real list query through groq-js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runGroq } from '../../helpers/sanityStore'
import {
  toOrganizerProposal,
  toOrganizerProposalDetail,
} from '@/lib/proposal/organizer'

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

const { listOrganizerProposals, getOrganizerProposal } =
  await import('@/lib/proposal/server')

const rawRow = {
  _id: 'talk-1',
  _rev: 'r1',
  _type: 'talk',
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-02T00:00:00Z',
  title: 'Talk',
  description: [],
  language: 'english',
  level: 'beginner',
  format: 'presentation_25',
  audiences: ['developer'],
  outline: 'outline',
  status: 'submitted',
  tos: true,
  utm: { source: 'x' },
  feedbackCode: null,
  issuedSpeakerTickets: [{ email: 'a@example.com' }],
  attachments: [],
  reviewSummary: null,
  coSpeakerInvitations: [],
  conference: {
    _id: 'conf-a',
    title: 'Conf',
    startDate: '2026-10-01',
    endDate: '2026-10-02',
    organization: { _ref: 'org-1' },
  },
  topics: [
    {
      _id: 'tp1',
      _type: 'topic',
      title: 'K8s',
      color: 'red',
      slug: { _type: 'slug', current: 'k8s' },
      description: 'd',
    },
  ],
  speakers: [
    {
      _id: 's1',
      _rev: 'x',
      name: 'Ada',
      email: 'ada@example.com',
      providers: ['github'],
      image: 'img',
      flags: [],
      slug: 'ada',
      bio: 'not projected',
      previousAcceptedTalks: [
        {
          _id: 'old',
          _rev: 'x',
          title: 'Old',
          status: 'confirmed',
          _createdAt: '2025-01-01',
          conference: { _id: 'conf-0', title: 'Old', startDate: '2025-10-01' },
          topics: [{ _id: 'tp1', title: 'K8s', color: 'red', _type: 'topic' }],
        },
      ],
    },
  ],
  reviews: [
    {
      _id: 'rv1',
      _rev: 'x',
      _type: 'review',
      _createdAt: '2026-01-03',
      _updatedAt: '2026-01-03',
      comment: 'ok',
      score: { content: 4, relevance: 4, speaker: 4 },
      proposal: { _ref: 'talk-1', _type: 'reference' },
      conference: { _ref: 'conf-a', _type: 'reference' },
      reviewer: { _id: 'r1', name: 'Rev', email: 'r@example.com', image: 'i' },
    },
  ],
}

describe('toOrganizerProposal', () => {
  it('copies exactly the organizer fields', () => {
    const p = toOrganizerProposal(rawRow)
    expect(Object.keys(p).sort()).toEqual(
      [
        '_createdAt',
        '_id',
        'attachments',
        'audiences',
        'coSpeakerInvitations',
        'conference',
        'description',
        'format',
        'language',
        'level',
        'outline',
        'reviewSummary',
        'reviews',
        'speakers',
        'status',
        'title',
        'topics',
      ].sort(),
    )
    expect(Object.keys(p.conference).sort()).toEqual(
      ['_id', 'endDate', 'startDate', 'title'].sort(),
    )
    expect(Object.keys(p.speakers![0]).sort()).toEqual(
      [
        '_id',
        'email',
        'flags',
        'image',
        'name',
        'previousAcceptedTalks',
        'providers',
        'slug',
      ].sort(),
    )
    expect(
      Object.keys(p.speakers![0].previousAcceptedTalks![0]).sort(),
    ).toEqual(['_createdAt', '_id', 'conference', 'status', 'title', 'topics'])
    expect(Object.keys(p.topics![0]).sort()).toEqual(
      ['_id', 'color', 'description', 'slug', 'title'].sort(),
    )
    expect(p.topics![0].slug).toEqual({ current: 'k8s' })
    expect(Object.keys(p.reviews![0]).sort()).toEqual(
      [
        '_createdAt',
        '_id',
        '_updatedAt',
        'comment',
        'reviewer',
        'score',
      ].sort(),
    )
  })

  it('carries no Sanity refs or raw document internals', () => {
    const json = JSON.stringify(toOrganizerProposal(rawRow))
    for (const leak of [
      '_ref',
      '_rev',
      '_type',
      'organization',
      'utm',
      'issuedSpeakerTickets',
      'feedbackCode',
      'not projected',
    ]) {
      expect(json).not.toContain(leak)
    }
  })
})

describe('listOrganizerProposals tenancy', () => {
  beforeEach(() => {
    h.docs = [
      { _id: 'conf-a', _type: 'conference', title: 'A' },
      { _id: 'conf-b', _type: 'conference', title: 'B' },
      { _id: 's1', _type: 'speaker', name: 'Ada' },
      {
        _id: 'mine',
        _type: 'talk',
        title: 'Mine',
        status: 'submitted',
        conference: { _ref: 'conf-a' },
        speakers: [{ _ref: 's1' }],
      },
      {
        _id: 'foreign',
        _type: 'talk',
        title: 'Foreign',
        status: 'submitted',
        conference: { _ref: 'conf-b' },
        speakers: [{ _ref: 's1' }],
      },
      {
        _id: 'review-foreign',
        _type: 'review',
        comment: 'foreign review',
        proposal: { _ref: 'foreign' },
      },
    ]
  })

  it('lists only the requested conference', async () => {
    const { proposals, proposalsError } = await listOrganizerProposals('conf-a')
    expect(proposalsError).toBeNull()
    expect(proposals.map((p) => p._id)).toEqual(['mine'])
    expect(proposals[0].conference).toEqual({
      _id: 'conf-a',
      title: 'A',
      startDate: null,
      endDate: null,
    })
    expect(JSON.stringify(proposals)).not.toContain('foreign')
  })

  it('applies filters server-side within the conference', async () => {
    const { proposals } = await listOrganizerProposals('conf-b', {
      searchQuery: 'Foreign',
    })
    expect(proposals.map((p) => p._id)).toEqual(['foreign'])
    expect(proposals[0].reviews?.map((r) => r.comment)).toEqual([
      'foreign review',
    ])
  })
})

describe('toOrganizerProposalDetail', () => {
  const detailRow = {
    ...rawRow,
    withdrawnReason: 'r',
    speakers: [
      {
        ...rawRow.speakers[0],
        title: 'Eng',
        links: ['https://x.example'],
        socialTagOptOut: true,
        submittedTalks: [
          {
            ...rawRow.speakers[0].previousAcceptedTalks[0],
            reviewCount: 1,
            reviewScores: [{ total: 12, _type: 'x' }],
          },
        ],
      },
    ],
  }

  it('copies exactly the detail fields', () => {
    const p = toOrganizerProposalDetail(detailRow)
    expect(Object.keys(p).sort()).toEqual(
      [
        ...Object.keys(toOrganizerProposal(rawRow)),
        '_updatedAt',
        'withdrawnReason',
      ].sort(),
    )
    expect(Object.keys(p.speakers![0]).sort()).toEqual(
      [
        '_id',
        'bio',
        'email',
        'flags',
        'image',
        'links',
        'name',
        'previousAcceptedTalks',
        'providers',
        'slug',
        'submittedTalks',
        'title',
      ].sort(),
    )
    expect(Object.keys(p.speakers![0].submittedTalks![0]).sort()).toEqual(
      [
        '_createdAt',
        '_id',
        'conference',
        'reviewCount',
        'reviewScores',
        'status',
        'title',
        'topics',
      ].sort(),
    )
    expect(p.speakers![0].submittedTalks![0].reviewScores).toEqual([
      { total: 12, weight: undefined },
    ])
    const json = JSON.stringify(p)
    for (const leak of ['_ref', '_rev', '_type', 'socialTagOptOut', 'utm']) {
      expect(json).not.toContain(leak)
    }
  })
})

describe('getOrganizerProposal tenancy', () => {
  beforeEach(() => {
    h.docs = [
      { _id: 'org-1', _type: 'organization' },
      {
        _id: 'conf-a',
        _type: 'conference',
        title: 'A',
        organization: { _ref: 'org-1' },
      },
      {
        _id: 'conf-b',
        _type: 'conference',
        title: 'B',
        organization: { _ref: 'org-1' },
      },
      { _id: 's1', _type: 'speaker', name: 'Ada' },
      {
        _id: 'mine',
        _type: 'talk',
        title: 'Mine',
        status: 'submitted',
        conference: { _ref: 'conf-a' },
        speakers: [{ _ref: 's1' }],
      },
      {
        _id: 'foreign',
        _type: 'talk',
        title: 'Foreign',
        status: 'submitted',
        conference: { _ref: 'conf-b' },
        speakers: [{ _ref: 's1' }],
      },
    ]
  })

  it('reads a proposal of the requested conference', async () => {
    const { proposal, proposalError } = await getOrganizerProposal(
      'conf-a',
      'mine',
    )
    expect(proposalError).toBeNull()
    expect(proposal?.title).toBe('Mine')
  })

  // conf-b shares the organization, so only the conference predicate keeps
  // its talk out: org scoping alone would admit it.
  it('reads a foreign-conference id as null, like a nonexistent one', async () => {
    expect(await getOrganizerProposal('conf-a', 'foreign')).toEqual({
      proposal: null,
      proposalError: null,
    })
    expect(await getOrganizerProposal('conf-a', 'missing')).toEqual({
      proposal: null,
      proposalError: null,
    })
  })
})
