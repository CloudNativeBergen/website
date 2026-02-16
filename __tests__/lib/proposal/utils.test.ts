import {
  extractSpeakersFromProposal,
  extractSpeakerIds,
  calculateReviewScore,
} from '@/lib/proposal/utils'
import { Status, Language, Format, Level, Audience } from '@/lib/proposal/types'
import type { ProposalExisting } from '@/lib/proposal/types'

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

describe('extractSpeakersFromProposal', () => {
  it('returns empty array when speakers is undefined', () => {
    expect(extractSpeakersFromProposal(makeProposal())).toEqual([])
  })

  it('returns empty array when speakers is empty', () => {
    expect(extractSpeakersFromProposal(makeProposal({ speakers: [] }))).toEqual(
      [],
    )
  })

  it('returns speakers with _id and name', () => {
    const speakers = [
      {
        _id: 's1',
        _rev: 'r1',
        _createdAt: '',
        _updatedAt: '',
        name: 'Alice',
        email: 'a@test.com',
      },
    ]
    const result = extractSpeakersFromProposal(makeProposal({ speakers }))
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alice')
  })

  it('filters out reference-only entries', () => {
    const speakers = [
      { _type: 'reference' as const, _ref: 's1' },
      {
        _id: 's2',
        _rev: 'r2',
        _createdAt: '',
        _updatedAt: '',
        name: 'Bob',
        email: 'b@test.com',
      },
    ] as unknown as ProposalExisting['speakers']
    const result = extractSpeakersFromProposal(makeProposal({ speakers }))
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bob')
  })

  it('filters out null entries', () => {
    const speakers = [
      null,
      {
        _id: 's1',
        _rev: 'r1',
        _createdAt: '',
        _updatedAt: '',
        name: 'Alice',
        email: 'a@test.com',
      },
    ] as unknown as ProposalExisting['speakers']
    const result = extractSpeakersFromProposal(makeProposal({ speakers }))
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alice')
  })

  it('returns empty when speakers is not an array', () => {
    const proposal = makeProposal({
      speakers: 'bad' as unknown as ProposalExisting['speakers'],
    })
    expect(extractSpeakersFromProposal(proposal)).toEqual([])
  })
})

describe('extractSpeakerIds', () => {
  it('returns empty array for undefined input', () => {
    expect(extractSpeakerIds(undefined)).toEqual([])
  })

  it('returns empty array for empty array', () => {
    expect(extractSpeakerIds([])).toEqual([])
  })

  it('extracts ids from string array', () => {
    expect(extractSpeakerIds(['s1', 's2'])).toEqual(['s1', 's2'])
  })

  it('extracts _ref from Reference objects', () => {
    expect(extractSpeakerIds([{ _type: 'reference', _ref: 'ref1' }])).toEqual([
      'ref1',
    ])
  })

  it('extracts _id from objects with _id', () => {
    expect(extractSpeakerIds([{ _id: 'id1' }])).toEqual(['id1'])
  })

  it('handles mixed input types', () => {
    const input = [
      'str1',
      { _type: 'reference' as const, _ref: 'ref1' },
      { _id: 'id1' },
    ]
    expect(extractSpeakerIds(input)).toEqual(['str1', 'ref1', 'id1'])
  })

  it('filters out unrecognized formats', () => {
    const input = ['valid', 42 as unknown as string, null as unknown as string]
    expect(extractSpeakerIds(input)).toEqual(['valid'])
  })
})

describe('calculateReviewScore', () => {
  it('returns 0 for empty reviews', () => {
    expect(calculateReviewScore([], 'content')).toBe(0)
  })

  it('returns 0 for undefined reviews', () => {
    expect(
      calculateReviewScore(
        undefined as unknown as Parameters<typeof calculateReviewScore>[0],
        'content',
      ),
    ).toBe(0)
  })

  it('calculates average content score', () => {
    const reviews = [
      { score: { content: 4, relevance: 3, speaker: 2 } },
      { score: { content: 2, relevance: 1, speaker: 5 } },
    ]
    expect(calculateReviewScore(reviews, 'content')).toBe(3)
  })

  it('calculates average relevance score', () => {
    const reviews = [
      { score: { content: 4, relevance: 5, speaker: 2 } },
      { score: { content: 2, relevance: 3, speaker: 5 } },
    ]
    expect(calculateReviewScore(reviews, 'relevance')).toBe(4)
  })

  it('calculates average speaker score', () => {
    const reviews = [
      { score: { content: 4, relevance: 3, speaker: 2 } },
      { score: { content: 2, relevance: 1, speaker: 4 } },
    ]
    expect(calculateReviewScore(reviews, 'speaker')).toBe(3)
  })

  it('handles single review', () => {
    const reviews = [{ score: { content: 5, relevance: 3, speaker: 1 } }]
    expect(calculateReviewScore(reviews, 'content')).toBe(5)
  })

  it('handles reviews missing score field', () => {
    const reviews = [
      { score: { content: 4, relevance: 3, speaker: 2 } },
      {} as {
        score?: { content?: number; relevance?: number; speaker?: number }
      },
    ]
    // only first review contributes: 4/2 = 2
    expect(calculateReviewScore(reviews, 'content')).toBe(2)
  })

  it('handles reviews with missing specific score type', () => {
    const reviews = [
      {
        score: { content: 4, relevance: 3 } as {
          content?: number
          relevance?: number
          speaker?: number
        },
      },
    ]
    expect(calculateReviewScore(reviews, 'speaker')).toBe(0)
  })
})
