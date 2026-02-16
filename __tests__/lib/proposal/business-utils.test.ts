import {
  calculateAverageRating,
  getProposalSpeakerNames,
} from '@/lib/proposal/business/utils'
import { Status, Language, Format, Level, Audience } from '@/lib/proposal/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { Review } from '@/lib/review/types'

function makeProposal(
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting {
  return {
    _id: 'p1',
    _rev: 'rev1',
    _type: 'talk',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    title: 'Test Talk',
    description: [],
    language: Language.english,
    format: Format.lightning_10,
    level: Level.beginner,
    audiences: [Audience.developer],
    outline: '',
    tos: true,
    status: Status.submitted,
    conference: { _type: 'reference', _ref: 'conf1' },
    ...overrides,
  }
}

function makeReview(scores: {
  content: number
  relevance: number
  speaker: number
}): Review {
  return {
    _id: 'r1',
    _rev: 'rev1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    comment: 'Good talk',
    score: scores,
    reviewer: { _type: 'reference', _ref: 'reviewer1' },
    proposal: { _type: 'reference', _ref: 'p1' },
  }
}

describe('calculateAverageRating', () => {
  it('returns 0 when reviews is undefined', () => {
    const proposal = makeProposal({ reviews: undefined })
    expect(calculateAverageRating(proposal)).toBe(0)
  })

  it('returns 0 when reviews is empty', () => {
    const proposal = makeProposal({ reviews: [] })
    expect(calculateAverageRating(proposal)).toBe(0)
  })

  it('calculates correctly for a single perfect review', () => {
    const proposal = makeProposal({
      reviews: [makeReview({ content: 5, relevance: 5, speaker: 5 })],
    })
    // totalScores = 15, totalPossible = 15, (15/15)*5 = 5.0
    expect(calculateAverageRating(proposal)).toBe(5)
  })

  it('calculates correctly for a single partial review', () => {
    const proposal = makeProposal({
      reviews: [makeReview({ content: 3, relevance: 2, speaker: 1 })],
    })
    // totalScores = 6, totalPossible = 15, (6/15)*5 = 2.0
    expect(calculateAverageRating(proposal)).toBe(2)
  })

  it('calculates correctly for multiple reviews', () => {
    const proposal = makeProposal({
      reviews: [
        makeReview({ content: 5, relevance: 5, speaker: 5 }),
        makeReview({ content: 1, relevance: 1, speaker: 1 }),
      ],
    })
    // totalScores = 15 + 3 = 18, totalPossible = 30, (18/30)*5 = 3.0
    expect(calculateAverageRating(proposal)).toBe(3)
  })

  it('skips non-object reviews', () => {
    const proposal = makeProposal({
      reviews: [
        makeReview({ content: 5, relevance: 5, speaker: 5 }),
        'not-a-review' as unknown as Review,
      ],
    })
    // only first review counts: 15 score, but totalPossible = 30 (2 items)
    // (15/30)*5 = 2.5
    expect(calculateAverageRating(proposal)).toBe(2.5)
  })

  it('skips reviews without score field', () => {
    const noScore = { ...makeReview({ content: 5, relevance: 5, speaker: 5 }) }
    delete (noScore as Record<string, unknown>).score
    const proposal = makeProposal({
      reviews: [makeReview({ content: 5, relevance: 5, speaker: 5 }), noScore],
    })
    // first review: 15, second skipped, totalPossible = 30
    // (15/30)*5 = 2.5
    expect(calculateAverageRating(proposal)).toBe(2.5)
  })

  it('handles all-zero scores', () => {
    const proposal = makeProposal({
      reviews: [makeReview({ content: 0, relevance: 0, speaker: 0 })],
    })
    // score object exists but values are 0 → score check is falsy
    // totalScores = 0, totalPossible = 15, (0/15)*5 = 0
    expect(calculateAverageRating(proposal)).toBe(0)
  })
})

describe('getProposalSpeakerNames', () => {
  it('returns "Unknown Speaker" when speakers is undefined', () => {
    const proposal = makeProposal({ speakers: undefined })
    expect(getProposalSpeakerNames(proposal)).toBe('Unknown Speaker')
  })

  it('returns "Unknown Speaker" when speakers is empty', () => {
    const proposal = makeProposal({ speakers: [] })
    expect(getProposalSpeakerNames(proposal)).toBe('Unknown Speaker')
  })

  it('returns single speaker name', () => {
    const proposal = makeProposal({
      speakers: [
        {
          _id: 's1',
          _rev: 'r1',
          _createdAt: '',
          _updatedAt: '',
          name: 'Alice',
          email: 'alice@test.com',
        },
      ],
    })
    expect(getProposalSpeakerNames(proposal)).toBe('Alice')
  })

  it('joins multiple speaker names with comma', () => {
    const proposal = makeProposal({
      speakers: [
        {
          _id: 's1',
          _rev: 'r1',
          _createdAt: '',
          _updatedAt: '',
          name: 'Alice',
          email: 'a@test.com',
        },
        {
          _id: 's2',
          _rev: 'r2',
          _createdAt: '',
          _updatedAt: '',
          name: 'Bob',
          email: 'b@test.com',
        },
      ],
    })
    expect(getProposalSpeakerNames(proposal)).toBe('Alice, Bob')
  })

  it('filters out reference-only speakers (no name)', () => {
    const proposal = makeProposal({
      speakers: [
        { _type: 'reference', _ref: 's1' },
        {
          _id: 's2',
          _rev: 'r2',
          _createdAt: '',
          _updatedAt: '',
          name: 'Bob',
          email: 'b@test.com',
        },
      ] as unknown as ProposalExisting['speakers'],
    })
    expect(getProposalSpeakerNames(proposal)).toBe('Bob')
  })

  it('returns "Unknown Speaker" when all speakers are references', () => {
    const proposal = makeProposal({
      speakers: [
        { _type: 'reference', _ref: 's1' },
        { _type: 'reference', _ref: 's2' },
      ] as ProposalExisting['speakers'],
    })
    expect(getProposalSpeakerNames(proposal)).toBe('Unknown Speaker')
  })
})
