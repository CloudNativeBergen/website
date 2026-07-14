const { mockSend, mockGetConference, mockGetProposalAbstract } = vi.hoisted(
  () => ({
    mockSend: vi.fn(),
    mockGetConference: vi.fn(),
    mockGetProposalAbstract: vi.fn(),
  }),
)

vi.mock('@/lib/email/config', () => ({
  resend: { emails: { send: mockSend } },
  retryWithBackoff: (fn: () => unknown) => fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: mockGetConference,
}))

vi.mock('@/lib/cospeaker/sanity', () => ({
  getProposalAbstract: mockGetProposalAbstract,
}))

import React from 'react'
import {
  sendInvitationEmail,
  truncateAbstract,
  ABSTRACT_MAX_LENGTH,
} from '@/lib/cospeaker/server'
import type { CoSpeakerInvitationFull } from '@/lib/cospeaker/types'

const FALLBACK_ABSTRACT =
  'Please view the full proposal details for more information.'

const invitation: CoSpeakerInvitationFull = {
  _id: 'invitation-1',
  invitedEmail: 'invitee@example.com',
  invitedName: 'Ida Invitee',
  status: 'pending',
  token: 'token-abc',
  expiresAt: '2026-08-01T00:00:00Z',
  createdAt: '2026-07-01T00:00:00Z',
  proposal: {
    _id: 'proposal-1',
    title: 'GitOps for Everyone',
  },
  invitedBy: {
    _id: 'speaker-1',
    name: 'Sam Speaker',
    email: 'sam@example.com',
  },
}

function sentEmailProps(): Record<string, unknown> {
  expect(mockSend).toHaveBeenCalledTimes(1)
  const { react } = mockSend.mock.calls[0][0] as {
    react: React.ReactElement<Record<string, unknown>>
  }
  return react.props
}

describe('truncateAbstract', () => {
  it('returns short abstracts unchanged', () => {
    expect(truncateAbstract('A short abstract.')).toBe('A short abstract.')
  })

  it('trims surrounding whitespace', () => {
    expect(truncateAbstract('  padded  ')).toBe('padded')
  })

  it('returns abstracts exactly at the limit unchanged', () => {
    const abstract = 'a'.repeat(ABSTRACT_MAX_LENGTH)
    expect(truncateAbstract(abstract)).toBe(abstract)
  })

  it('truncates long abstracts at a word boundary with an ellipsis', () => {
    const word = 'kubernetes '
    const abstract = word.repeat(100).trim()

    const result = truncateAbstract(abstract)

    expect(result.length).toBeLessThanOrEqual(ABSTRACT_MAX_LENGTH + 1)
    expect(result.endsWith('…')).toBe(true)
    // No mid-word cut: everything before the ellipsis is whole words.
    expect(result.slice(0, -1)).toBe(word.repeat(45).trim())
  })

  it('strips trailing punctuation before appending the ellipsis', () => {
    const abstract = `${'word '.repeat(99)}and, ${'x'.repeat(500)}`

    const result = truncateAbstract(abstract)

    expect(result.endsWith('and…')).toBe(true)
  })

  it('hard-cuts a single unbroken word longer than the limit', () => {
    const abstract = 'x'.repeat(600)

    const result = truncateAbstract(abstract)

    expect(result).toBe(`${'x'.repeat(ABSTRACT_MAX_LENGTH)}…`)
  })

  it('respects a custom max length', () => {
    expect(truncateAbstract('one two three four', 10)).toBe('one two…')
  })
})

describe('sendInvitationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConference.mockResolvedValue({
      conference: {
        title: 'Cloud Native Day Bergen',
        organizer: 'CNDN',
        cfpEmail: 'cfp@example.com',
        city: 'Bergen',
        country: 'Norway',
        startDate: '2026-10-01',
        domains: ['example.com'],
        socialLinks: [],
      },
      domain: 'example.com',
      error: null,
    })
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null })
  })

  it('includes the fetched proposal abstract in the email', async () => {
    mockGetProposalAbstract.mockResolvedValue('A deep dive into GitOps.')

    const result = await sendInvitationEmail(invitation)

    expect(result).toBe(true)
    expect(mockGetProposalAbstract).toHaveBeenCalledWith('proposal-1')
    expect(sentEmailProps().proposalAbstract).toBe('A deep dive into GitOps.')
  })

  it('truncates long abstracts before sending', async () => {
    const longAbstract = 'word '.repeat(200).trim()
    mockGetProposalAbstract.mockResolvedValue(longAbstract)

    const result = await sendInvitationEmail(invitation)

    expect(result).toBe(true)
    const abstract = sentEmailProps().proposalAbstract as string
    expect(abstract.length).toBeLessThanOrEqual(ABSTRACT_MAX_LENGTH + 1)
    expect(abstract.endsWith('…')).toBe(true)
  })

  it('falls back to the placeholder when the abstract is empty', async () => {
    mockGetProposalAbstract.mockResolvedValue(null)

    const result = await sendInvitationEmail(invitation)

    expect(result).toBe(true)
    expect(sentEmailProps().proposalAbstract).toBe(FALLBACK_ABSTRACT)
  })

  it('still sends with the placeholder when the abstract fetch throws', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mockGetProposalAbstract.mockRejectedValue(new Error('sanity down'))

    const result = await sendInvitationEmail(invitation)

    expect(result).toBe(true)
    expect(sentEmailProps().proposalAbstract).toBe(FALLBACK_ABSTRACT)
    consoleSpy.mockRestore()
  })

  it('resolves the proposal id from a reference and fetches the abstract', async () => {
    mockGetProposalAbstract.mockResolvedValue('Referenced abstract.')

    const result = await sendInvitationEmail({
      ...invitation,
      proposal: { _ref: 'proposal-ref-1', _type: 'reference' },
    })

    expect(result).toBe(true)
    expect(mockGetProposalAbstract).toHaveBeenCalledWith('proposal-ref-1')
    expect(sentEmailProps().proposalAbstract).toBe('Referenced abstract.')
  })

  it('skips the abstract fetch when the invitation has no proposal', async () => {
    const result = await sendInvitationEmail({
      ...invitation,
      proposal: undefined,
    })

    expect(result).toBe(true)
    expect(mockGetProposalAbstract).not.toHaveBeenCalled()
    expect(sentEmailProps().proposalAbstract).toBe(FALLBACK_ABSTRACT)
  })
})
