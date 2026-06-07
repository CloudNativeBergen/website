import { describe, expect, it } from 'vitest'
import {
  filterProposals,
  ProposalFilters,
} from '@/lib/proposal/utils/filtering'
import {
  Status,
  Format,
  Level,
  Language,
  Audience,
  ReviewStatus,
} from '@/lib/proposal/types'
import { ProposalExisting } from '@/lib/proposal/types'

const mockProposal = (
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting => ({
  _id: '1',
  _rev: 'rev',
  _type: 'talk',
  _createdAt: '2023-01-01T12:00:00Z',
  _updatedAt: '2023-01-01T12:00:00Z',
  title: 'Test Proposal',
  description: [
    { _type: 'block', _key: '1', children: [{ _type: 'span', text: 'desc' }] },
  ],
  language: Language.english,
  format: Format.presentation_45,
  level: Level.beginner,
  audiences: [Audience.developer],
  outline: 'outline',
  tos: true,
  status: Status.submitted,
  conference: { _type: 'reference', _ref: 'conf-1' },
  ...overrides,
})

describe('filterProposals', () => {
  const proposals = [
    mockProposal({
      _id: '1',
      title: 'Alpha',
      status: Status.submitted,
      format: Format.presentation_45,
    }),
    mockProposal({
      _id: '2',
      title: 'Beta',
      status: Status.accepted,
      format: Format.lightning_10,
    }),
    mockProposal({
      _id: '3',
      title: 'Gamma',
      status: Status.confirmed,
      format: Format.workshop_120,
    }),
  ]

  it('should filter by status', () => {
    const filters: ProposalFilters = { status: [Status.accepted] }
    const result = filterProposals(proposals, filters)
    expect(result).toHaveLength(1)
    expect(result[0]._id).toBe('2')
  })

  it('should filter by format', () => {
    const filters: ProposalFilters = { format: [Format.lightning_10] }
    const result = filterProposals(proposals, filters)
    expect(result).toHaveLength(1)
    expect(result[0]._id).toBe('2')
  })

  it('should search by title', () => {
    const filters: ProposalFilters = { searchQuery: 'alp' }
    const result = filterProposals(proposals, filters)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Alpha')
  })

  it('should sort by title asc', () => {
    const filters: ProposalFilters = { sortBy: 'title', sortOrder: 'asc' }
    const result = filterProposals(proposals, filters)
    expect(result[0].title).toBe('Alpha')
    expect(result[1].title).toBe('Beta')
    expect(result[2].title).toBe('Gamma')
  })

  it('should sort by title desc', () => {
    const filters: ProposalFilters = { sortBy: 'title', sortOrder: 'desc' }
    const result = filterProposals(proposals, filters)
    expect(result[0].title).toBe('Gamma')
    expect(result[1].title).toBe('Beta')
    expect(result[2].title).toBe('Alpha')
  })

  it('should sort by reviews asc', () => {
    const proposalsWithReviews = [
      mockProposal({ _id: 'two', reviews: [{} as any, {} as any] }),
      mockProposal({ _id: 'zero', reviews: [] }),
      mockProposal({ _id: 'one', reviews: [{} as any] }),
    ]
    const filters: ProposalFilters = { sortBy: 'reviews', sortOrder: 'asc' }
    const result = filterProposals(proposalsWithReviews, filters)
    expect(result.map((p) => p._id)).toEqual(['zero', 'one', 'two'])
  })

  it('should sort by reviews desc', () => {
    const proposalsWithReviews = [
      mockProposal({ _id: 'one', reviews: [{} as any] }),
      mockProposal({ _id: 'zero', reviews: [] }),
      mockProposal({ _id: 'two', reviews: [{} as any, {} as any] }),
    ]
    const filters: ProposalFilters = { sortBy: 'reviews', sortOrder: 'desc' }
    const result = filterProposals(proposalsWithReviews, filters)
    expect(result.map((p) => p._id)).toEqual(['two', 'one', 'zero'])
  })

  it('should filter by review status (reviewed)', () => {
    const proposalsWithReviews = [
      mockProposal({ _id: '1', reviews: [{ reviewer: { _id: 'u1' } } as any] }),
      mockProposal({ _id: '2', reviews: [] }),
    ]
    const filters: ProposalFilters = { reviewStatus: ReviewStatus.reviewed }
    const result = filterProposals(proposalsWithReviews, filters, 'u1')
    expect(result).toHaveLength(1)
    expect(result[0]._id).toBe('1')
  })

  it('should filter by review status (unreviewed)', () => {
    const proposalsWithReviews = [
      mockProposal({ _id: '1', reviews: [{ reviewer: { _id: 'u1' } } as any] }),
      mockProposal({ _id: '2', reviews: [] }),
    ]
    const filters: ProposalFilters = { reviewStatus: ReviewStatus.unreviewed }
    const result = filterProposals(proposalsWithReviews, filters, 'u1')
    expect(result).toHaveLength(1)
    expect(result[0]._id).toBe('2')
  })

  it('should hide multiple talks', () => {
    const speaker1: any = {
      _id: 's1',
      name: 'Speaker One',
      _rev: 'rev',
      _createdAt: '2023-01-01',
      _updatedAt: '2023-01-01',
      email: 's1@example.com',
    }
    const testProposals = [
      mockProposal({
        _id: '1',
        title: 'Talk 1',
        status: Status.accepted,
        speakers: [speaker1],
      }),
      mockProposal({
        _id: '2',
        title: 'Talk 2',
        status: Status.submitted,
        speakers: [speaker1],
      }),
      mockProposal({
        _id: '3',
        title: 'Talk 3',
        status: Status.submitted,
        speakers: [
          {
            _id: 's2',
            name: 'Speaker Two',
            _rev: 'rev',
            _createdAt: '2023-01-01',
            _updatedAt: '2023-01-01',
            email: 's2@example.com',
          } as any,
        ],
      }),
    ]
    const filters: ProposalFilters = { hideMultipleTalks: true }
    const result = filterProposals(testProposals, filters)
    expect(result).toHaveLength(2)
    expect(result.map((p) => p._id)).not.toContain('2')
    expect(result.map((p) => p._id)).toContain('1')
    expect(result.map((p) => p._id)).toContain('3')
  })

  it('should not filter when status array is empty (treat as no filter)', () => {
    const filters: ProposalFilters = { status: [] }
    const result = filterProposals(proposals, filters)
    expect(result).toHaveLength(3)
  })

  it('should not filter when format array is empty (treat as no filter)', () => {
    const filters: ProposalFilters = { format: [] }
    const result = filterProposals(proposals, filters)
    expect(result).toHaveLength(3)
  })

  it('hideMultipleTalks handles proposals with no speakers', () => {
    const testProposals = [
      mockProposal({ _id: '1', title: 'No Speakers', speakers: undefined }),
      mockProposal({ _id: '2', title: 'Empty Speakers', speakers: [] }),
    ]
    const filters: ProposalFilters = { hideMultipleTalks: true }
    const result = filterProposals(testProposals, filters)
    expect(result).toHaveLength(2)
  })
})
