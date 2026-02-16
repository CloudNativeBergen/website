import {
  validateProposalForm,
  validateProposalForAdmin,
  PROPOSAL_VALIDATION_MESSAGES,
} from '@/lib/proposal/validation'
import { Language, Format, Level, Audience } from '@/lib/proposal/types'
import type { ProposalInput } from '@/lib/proposal/types'

function makeValidProposal(
  overrides: Partial<ProposalInput> = {},
): ProposalInput {
  return {
    title: 'My Talk',
    description: [{ _type: 'block', children: [{ text: 'Hello' }] }] as any,
    language: Language.english,
    format: Format.lightning_10,
    level: Level.beginner,
    audiences: [Audience.developer],
    outline: '',
    topics: [{ _type: 'reference', _ref: 'topic1' }],
    tos: true,
    ...overrides,
  }
}

describe('validateProposalForm', () => {
  it('returns empty errors for a valid proposal', () => {
    expect(validateProposalForm(makeValidProposal())).toEqual({})
  })

  it('returns error for empty title', () => {
    const errors = validateProposalForm(makeValidProposal({ title: '' }))
    expect(errors.title).toBe(PROPOSAL_VALIDATION_MESSAGES.TITLE_REQUIRED)
  })

  it('returns error for whitespace-only title', () => {
    const errors = validateProposalForm(makeValidProposal({ title: '   ' }))
    expect(errors.title).toBe(PROPOSAL_VALIDATION_MESSAGES.TITLE_REQUIRED)
  })

  it('returns error for undefined title', () => {
    const errors = validateProposalForm(
      makeValidProposal({ title: undefined as unknown as string }),
    )
    expect(errors.title).toBe(PROPOSAL_VALIDATION_MESSAGES.TITLE_REQUIRED)
  })

  it('returns error for empty description', () => {
    const errors = validateProposalForm(
      makeValidProposal({ description: [] as any }),
    )
    expect(errors.description).toBe(
      PROPOSAL_VALIDATION_MESSAGES.DESCRIPTION_REQUIRED,
    )
  })

  it('returns error for undefined description', () => {
    const errors = validateProposalForm(
      makeValidProposal({ description: undefined as any }),
    )
    expect(errors.description).toBe(
      PROPOSAL_VALIDATION_MESSAGES.DESCRIPTION_REQUIRED,
    )
  })

  it('returns error for missing format', () => {
    const errors = validateProposalForm(
      makeValidProposal({ format: undefined as unknown as Format }),
    )
    expect(errors.format).toBe(PROPOSAL_VALIDATION_MESSAGES.FORMAT_REQUIRED)
  })

  it('returns error for missing level', () => {
    const errors = validateProposalForm(
      makeValidProposal({ level: undefined as unknown as Level }),
    )
    expect(errors.level).toBe(PROPOSAL_VALIDATION_MESSAGES.LEVEL_REQUIRED)
  })

  it('returns error for empty audiences', () => {
    const errors = validateProposalForm(makeValidProposal({ audiences: [] }))
    expect(errors.audiences).toBe(
      PROPOSAL_VALIDATION_MESSAGES.AUDIENCE_REQUIRED,
    )
  })

  it('returns error for undefined audiences', () => {
    const errors = validateProposalForm(
      makeValidProposal({ audiences: undefined as unknown as Audience[] }),
    )
    expect(errors.audiences).toBe(
      PROPOSAL_VALIDATION_MESSAGES.AUDIENCE_REQUIRED,
    )
  })

  it('returns error for empty topics', () => {
    const errors = validateProposalForm(makeValidProposal({ topics: [] }))
    expect(errors.topics).toBe(PROPOSAL_VALIDATION_MESSAGES.TOPICS_REQUIRED)
  })

  it('returns error for tos set to false', () => {
    const errors = validateProposalForm(makeValidProposal({ tos: false }))
    expect(errors.tos).toBe(PROPOSAL_VALIDATION_MESSAGES.TOS_REQUIRED)
  })

  it('returns capacity error for workshop_120 without capacity', () => {
    const errors = validateProposalForm(
      makeValidProposal({ format: Format.workshop_120 }),
    )
    expect(errors.capacity).toBe(PROPOSAL_VALIDATION_MESSAGES.CAPACITY_REQUIRED)
  })

  it('returns capacity error for workshop_240 without capacity', () => {
    const errors = validateProposalForm(
      makeValidProposal({ format: Format.workshop_240 }),
    )
    expect(errors.capacity).toBe(PROPOSAL_VALIDATION_MESSAGES.CAPACITY_REQUIRED)
  })

  it('accepts workshop format with capacity', () => {
    const errors = validateProposalForm(
      makeValidProposal({ format: Format.workshop_120, capacity: 30 }),
    )
    expect(errors.capacity).toBeUndefined()
  })

  it('does not return capacity error for non-workshop formats', () => {
    const errors = validateProposalForm(
      makeValidProposal({ format: Format.presentation_40 }),
    )
    expect(errors.capacity).toBeUndefined()
  })

  it('suppresses capacity check when requireCapacity is false', () => {
    const errors = validateProposalForm(
      makeValidProposal({ format: Format.workshop_120 }),
      { requireCapacity: false },
    )
    expect(errors.capacity).toBeUndefined()
  })

  it('returns multiple errors simultaneously', () => {
    const errors = validateProposalForm(
      makeValidProposal({
        title: '',
        description: [] as any,
        format: undefined as unknown as Format,
        audiences: [],
        topics: [],
        tos: false,
      }),
    )
    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining([
        'title',
        'description',
        'format',
        'audiences',
        'topics',
        'tos',
      ]),
    )
  })
})

describe('validateProposalForAdmin', () => {
  it('returns speakers error when speakerIds is empty', () => {
    const errors = validateProposalForAdmin(makeValidProposal(), [])
    expect(errors.speakers).toBe(PROPOSAL_VALIDATION_MESSAGES.SPEAKERS_REQUIRED)
  })

  it('returns speakers error when speakerIds is undefined', () => {
    const errors = validateProposalForAdmin(
      makeValidProposal(),
      undefined as unknown as string[],
    )
    expect(errors.speakers).toBe(PROPOSAL_VALIDATION_MESSAGES.SPEAKERS_REQUIRED)
  })

  it('does not return speakers error with valid speaker ids', () => {
    const errors = validateProposalForAdmin(makeValidProposal(), ['s1'])
    expect(errors.speakers).toBeUndefined()
  })

  it('combines form errors with speaker errors', () => {
    const errors = validateProposalForAdmin(
      makeValidProposal({ title: '' }),
      [],
    )
    expect(errors.title).toBe(PROPOSAL_VALIDATION_MESSAGES.TITLE_REQUIRED)
    expect(errors.speakers).toBe(PROPOSAL_VALIDATION_MESSAGES.SPEAKERS_REQUIRED)
  })

  it('returns no errors for valid admin proposal', () => {
    const errors = validateProposalForAdmin(makeValidProposal(), ['s1', 's2'])
    expect(errors).toEqual({})
  })
})
