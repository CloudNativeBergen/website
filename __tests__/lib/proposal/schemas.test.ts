import {
  CreateProposalSchema,
  ProposalInputSchema,
} from '@/server/schemas/proposal'
import { Language, Format, Level, Audience } from '@/lib/proposal/types'

const validRef = { _type: 'reference' as const, _ref: 'some-id' }

const fullProposal = {
  title: 'My Talk',
  description: [{ _type: 'block', children: [{ text: 'Hello' }] }],
  language: Language.english,
  format: Format.lightning_10,
  level: Level.beginner,
  audiences: [Audience.developer],
  topics: [validRef],
  tos: true,
}

describe('CreateProposalSchema', () => {
  it('accepts a full proposal as submitted', () => {
    const result = CreateProposalSchema.safeParse({
      data: fullProposal,
      status: 'submitted',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a minimal draft with only a title', () => {
    const result = CreateProposalSchema.safeParse({
      data: { title: 'WIP Talk' },
      status: 'draft',
    })
    expect(result.success).toBe(true)
  })

  it('defaults status to submitted when omitted', () => {
    const result = CreateProposalSchema.safeParse({ data: fullProposal })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('submitted')
    }
  })

  it('fills in defaults for optional draft fields', () => {
    const result = CreateProposalSchema.safeParse({
      data: { title: 'Draft' },
      status: 'draft',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data.description).toEqual([])
      expect(result.data.data.language).toBe(Language.norwegian)
      expect(result.data.data.format).toBe(Format.lightning_10)
      expect(result.data.data.level).toBe(Level.beginner)
      expect(result.data.data.audiences).toEqual([])
      expect(result.data.data.topics).toEqual([])
      expect(result.data.data.tos).toBe(false)
    }
  })

  it('rejects a draft without a title', () => {
    const result = CreateProposalSchema.safeParse({
      data: { title: '' },
      status: 'draft',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid status values', () => {
    const result = CreateProposalSchema.safeParse({
      data: fullProposal,
      status: 'accepted',
    })
    expect(result.success).toBe(false)
  })
})

describe('ProposalInputSchema (strict)', () => {
  it('accepts a complete valid proposal', () => {
    const result = ProposalInputSchema.safeParse(fullProposal)
    expect(result.success).toBe(true)
  })

  it('requires description to be non-empty', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      description: [],
    })
    expect(result.success).toBe(false)
  })

  it('requires at least one audience', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      audiences: [],
    })
    expect(result.success).toBe(false)
  })

  it('requires at least one topic', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      topics: [],
    })
    expect(result.success).toBe(false)
  })

  it('requires tos to be true', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      tos: false,
    })
    expect(result.success).toBe(false)
  })

  it('requires capacity for workshop formats', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      format: Format.workshop_120,
    })
    expect(result.success).toBe(false)
  })

  it('accepts workshop format with capacity', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      format: Format.workshop_120,
      capacity: 30,
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing title', () => {
    const { title: _, ...withoutTitle } = fullProposal
    const result = ProposalInputSchema.safeParse(withoutTitle)
    expect(result.success).toBe(false)
  })
})
