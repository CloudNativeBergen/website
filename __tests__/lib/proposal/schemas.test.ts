import {
  CreateProposalSchema,
  ProposalInputSchema,
  ProposalActionSchema,
  ProposalAdminCreateSchema,
  ProposalUpdateSchema,
  InvitationCreateSchema,
  InvitationResponseSchema,
  InvitationCancelSchema,
  AudienceFeedbackSchema,
} from '@/server/schemas/proposal'
import { Language, Format, Level, Audience, Action } from '@/lib/proposal/types'

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

  it('accepts workshop format with prerequisites', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      format: Format.workshop_120,
      capacity: 30,
      prerequisites: 'Bring a computer with Docker installed',
    })
    expect(result.success).toBe(true)
  })

  it('accepts non-workshop format without prerequisites', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      format: Format.presentation_40,
      prerequisites: undefined,
    })
    expect(result.success).toBe(true)
  })

  it('rejects prerequisites for non-workshop formats', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      format: Format.presentation_40,
      prerequisites: 'Should not be allowed',
    })
    expect(result.success).toBe(false)
  })

  it('normalizes empty prerequisites to undefined', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      format: Format.workshop_120,
      capacity: 30,
      prerequisites: '   ',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.prerequisites).toBeUndefined()
    }
  })

  it('trims whitespace from prerequisites', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      format: Format.workshop_120,
      capacity: 30,
      prerequisites: '  Docker required  ',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.prerequisites).toBe('Docker required')
    }
  })

  it('rejects missing title', () => {
    const { title: _, ...withoutTitle } = fullProposal
    const result = ProposalInputSchema.safeParse(withoutTitle)
    expect(result.success).toBe(false)
  })

  it('rejects invalid enum values', () => {
    const result = ProposalInputSchema.safeParse({
      ...fullProposal,
      language: 'klingon',
    })
    expect(result.success).toBe(false)
  })
})

describe('ProposalActionSchema', () => {
  it('accepts a valid action with defaults', () => {
    const result = ProposalActionSchema.safeParse({ action: Action.submit })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.notify).toBe(true)
      expect(result.data.comment).toBeUndefined()
    }
  })

  it('accepts action with notify=false', () => {
    const result = ProposalActionSchema.safeParse({
      action: Action.accept,
      notify: false,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.notify).toBe(false)
    }
  })

  it('accepts action with comment', () => {
    const result = ProposalActionSchema.safeParse({
      action: Action.reject,
      comment: 'Not a good fit',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.comment).toBe('Not a good fit')
    }
  })

  it('transforms null comment to undefined', () => {
    const result = ProposalActionSchema.safeParse({
      action: Action.accept,
      comment: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.comment).toBeUndefined()
    }
  })

  it('rejects invalid action', () => {
    const result = ProposalActionSchema.safeParse({ action: 'launch' })
    expect(result.success).toBe(false)
  })

  it('rejects missing action', () => {
    const result = ProposalActionSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('ProposalAdminCreateSchema', () => {
  it('accepts valid admin proposal', () => {
    const result = ProposalAdminCreateSchema.safeParse({
      ...fullProposal,
      speakers: ['speaker-1'],
      conferenceId: 'conf-1',
    })
    expect(result.success).toBe(true)
  })

  it('requires at least one speaker', () => {
    const result = ProposalAdminCreateSchema.safeParse({
      ...fullProposal,
      speakers: [],
      conferenceId: 'conf-1',
    })
    expect(result.success).toBe(false)
  })

  it('requires conferenceId', () => {
    const result = ProposalAdminCreateSchema.safeParse({
      ...fullProposal,
      speakers: ['s1'],
      conferenceId: '',
    })
    expect(result.success).toBe(false)
  })

  it('requires capacity for workshop format', () => {
    const result = ProposalAdminCreateSchema.safeParse({
      ...fullProposal,
      format: Format.workshop_240,
      speakers: ['s1'],
      conferenceId: 'conf-1',
    })
    expect(result.success).toBe(false)
  })
})

describe('ProposalUpdateSchema', () => {
  it('accepts partial update with just title', () => {
    const result = ProposalUpdateSchema.safeParse({ title: 'Updated' })
    expect(result.success).toBe(true)
  })

  it('requires title', () => {
    const result = ProposalUpdateSchema.safeParse({ level: Level.advanced })
    expect(result.success).toBe(false)
  })

  it('accepts update with multiple fields', () => {
    const result = ProposalUpdateSchema.safeParse({
      title: 'Updated',
      level: Level.advanced,
      format: Format.presentation_40,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid enum in partial update', () => {
    const result = ProposalUpdateSchema.safeParse({
      title: 'Updated',
      level: 'expert',
    })
    expect(result.success).toBe(false)
  })
})

describe('InvitationCreateSchema', () => {
  it('accepts valid invitation', () => {
    const result = InvitationCreateSchema.safeParse({
      proposalId: 'p1',
      invitedEmail: 'bob@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('accepts invitation with name', () => {
    const result = InvitationCreateSchema.safeParse({
      proposalId: 'p1',
      invitedEmail: 'bob@example.com',
      invitedName: 'Bob',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.invitedName).toBe('Bob')
    }
  })

  it('rejects invalid email', () => {
    const result = InvitationCreateSchema.safeParse({
      proposalId: 'p1',
      invitedEmail: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty proposalId', () => {
    const result = InvitationCreateSchema.safeParse({
      proposalId: '',
      invitedEmail: 'bob@example.com',
    })
    expect(result.success).toBe(false)
  })
})

describe('InvitationResponseSchema', () => {
  it('accepts valid acceptance', () => {
    const result = InvitationResponseSchema.safeParse({
      token: 'abc-123',
      accept: true,
    })
    expect(result.success).toBe(true)
  })

  it('accepts decline with reason', () => {
    const result = InvitationResponseSchema.safeParse({
      token: 'abc-123',
      accept: false,
      declineReason: 'Schedule conflict',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.declineReason).toBe('Schedule conflict')
    }
  })

  it('transforms null declineReason to undefined', () => {
    const result = InvitationResponseSchema.safeParse({
      token: 'abc-123',
      accept: false,
      declineReason: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.declineReason).toBeUndefined()
    }
  })

  it('rejects empty token', () => {
    const result = InvitationResponseSchema.safeParse({
      token: '',
      accept: true,
    })
    expect(result.success).toBe(false)
  })
})

describe('InvitationCancelSchema', () => {
  it('accepts valid cancellation', () => {
    const result = InvitationCancelSchema.safeParse({
      invitationId: 'inv-1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty invitationId', () => {
    const result = InvitationCancelSchema.safeParse({ invitationId: '' })
    expect(result.success).toBe(false)
  })
})

describe('AudienceFeedbackSchema', () => {
  it('accepts valid feedback', () => {
    const result = AudienceFeedbackSchema.safeParse({
      greenCount: 10,
      yellowCount: 5,
      redCount: 2,
    })
    expect(result.success).toBe(true)
  })

  it('accepts zero counts', () => {
    const result = AudienceFeedbackSchema.safeParse({
      greenCount: 0,
      yellowCount: 0,
      redCount: 0,
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative counts', () => {
    const result = AudienceFeedbackSchema.safeParse({
      greenCount: -1,
      yellowCount: 0,
      redCount: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer counts', () => {
    const result = AudienceFeedbackSchema.safeParse({
      greenCount: 1.5,
      yellowCount: 0,
      redCount: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing fields', () => {
    const result = AudienceFeedbackSchema.safeParse({ greenCount: 5 })
    expect(result.success).toBe(false)
  })
})
