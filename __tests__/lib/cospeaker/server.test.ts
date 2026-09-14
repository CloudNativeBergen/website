const {
  mockSend,
  mockGetConference,
  mockGetProposalAbstract,
  mockCreate,
  mockPatch,
  mockIfRevisionId,
  mockPatchSet,
  mockPatchUnset,
  mockPatchCommit,
} = vi.hoisted(() => {
  const mockPatchCommit = vi.fn()
  const mockPatchUnset = vi.fn((_fields: string[]) => ({
    commit: mockPatchCommit,
  }))
  const mockPatchSet = vi.fn((_fields: Record<string, unknown>) => ({
    commit: mockPatchCommit,
    unset: mockPatchUnset,
  }))
  const mockIfRevisionId = vi.fn((_rev: string) => ({ set: mockPatchSet }))
  return {
    mockSend: vi.fn(),
    mockGetConference: vi.fn(),
    mockGetProposalAbstract: vi.fn(),
    mockCreate: vi.fn(),
    mockPatch: vi.fn((_id: string) => ({
      set: mockPatchSet,
      ifRevisionId: mockIfRevisionId,
    })),
    mockIfRevisionId,
    mockPatchSet,
    mockPatchUnset,
    mockPatchCommit,
  }
})

// Boundary mock only: the real `createCoSpeakerInvitation` logic runs, and we
// observe the document it actually writes.
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    create: (doc: Record<string, unknown>) => mockCreate(doc),
    patch: (id: string) => mockPatch(id),
  },
}))

vi.mock('@/lib/email/config', () => ({
  resend: { emails: { send: mockSend } },
  // #843: send paths resolve their client through `resolveEmailSender`, so the
  // stub answers with the SAME spy the assertions below read.
  resolveEmailSender: async () => ({ client: { emails: { send: mockSend } } }),
  retryWithBackoff: (fn: () => unknown) => fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: mockGetConference,
}))

vi.mock('@/lib/cospeaker/sanity', () => ({
  getProposalAbstract: mockGetProposalAbstract,
}))

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createCoSpeakerInvitation,
  mintInvitationToken,
  renewCoSpeakerInvitation,
  sendInvitationEmail,
  truncateAbstract,
  ABSTRACT_MAX_LENGTH,
} from '@/lib/cospeaker/server'
import { INVITATION_VALID_DAYS } from '@/lib/cospeaker/constants'
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

/**
 * The email actually rendered for delivery. `sentEmailProps` inspects the props
 * the sender chose; this renders them through the real template, so the
 * per-variant copy is asserted on the HTML a recipient would receive.
 */
function renderSentEmail(): string {
  expect(mockSend).toHaveBeenCalledTimes(1)
  const { react } = mockSend.mock.calls[0][0] as { react: React.ReactElement }
  return renderToStaticMarkup(react)
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
        _id: 'conf-1',
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
    expect(mockGetProposalAbstract).toHaveBeenCalledWith('proposal-1', 'conf-1')
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
    expect(mockGetProposalAbstract).toHaveBeenCalledWith(
      'proposal-ref-1',
      'conf-1',
    )
    expect(sentEmailProps().proposalAbstract).toBe('Referenced abstract.')
  })

  it.each([
    [
      'invitation',
      "You've been invited to co-present",
      'Co-Speaker Invitation',
    ],
    ['reminder', 'Reminder: co-speaker invitation for', 'Reminder: Co-Speaker'],
    [
      'renewed',
      'A new link for your co-speaker invitation to',
      'Has a New Link',
    ],
  ])(
    'the %s variant gets its own subject and heading',
    async (variant, subjectFragment, headingFragment) => {
      mockGetProposalAbstract.mockResolvedValue('A deep dive into GitOps.')

      const result = await sendInvitationEmail(
        invitation,
        variant as 'invitation' | 'reminder' | 'renewed',
      )

      expect(result).toBe(true)
      const { subject } = mockSend.mock.calls[0][0] as { subject: string }
      expect(subject).toContain(subjectFragment)

      expect(renderSentEmail()).toContain(headingFragment)
    },
  )

  it('tells a reminder recipient plainly that it is a reminder', async () => {
    mockGetProposalAbstract.mockResolvedValue('A deep dive into GitOps.')

    await sendInvitationEmail(invitation, 'reminder')

    const html = renderSentEmail()
    expect(html).toContain('This is a reminder')
    expect(html).toContain('still waiting for your answer')
    // What happens if they do nothing, and by when.
    expect(html).toContain('If you do nothing, the invitation lapses')
  })

  it('tells a renewal recipient the old link is dead', async () => {
    mockGetProposalAbstract.mockResolvedValue('A deep dive into GitOps.')

    await sendInvitationEmail(invitation, 'renewed')

    const html = renderSentEmail()
    expect(html).toContain('expired before you answered it')
    expect(html).toContain('replaces the old link')
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

// #684 — the stored `invitedEmail` is BOTH the acceptance match key and the
// mailbox the invitation bearer token is delivered to. It must be canonicalized
// (trim + lowercase) but must NOT be NFKC-folded, which would rewrite the local
// part and could deliver the token to a different person. Exercises the real
// service against a mocked Sanity boundary.
describe('createCoSpeakerInvitation — stored recipient address', () => {
  const params = {
    invitedByEmail: 'sam@example.com',
    invitedByName: 'Sam Speaker',
    invitedName: 'Ida Invitee',
    proposalId: 'proposal-1',
    proposalTitle: 'GitOps for Everyone',
    invitedBySpeakerId: 'speaker-1',
    conferenceId: 'conf-1',
  }

  function writtenDoc(): Record<string, unknown> {
    expect(mockCreate).toHaveBeenCalledTimes(1)
    return mockCreate.mock.calls[0][0] as Record<string, unknown>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockImplementation((doc: Record<string, unknown>) =>
      Promise.resolve({ ...doc, _id: 'inv-1' }),
    )
    mockPatchCommit.mockResolvedValue({
      _id: 'inv-1',
      invitedEmail: 'ida@example.com',
      status: 'pending',
      token: 'tok',
    })
  })

  it('trims and lowercases the stored address', async () => {
    await createCoSpeakerInvitation({
      ...params,
      invitedEmail: '  Ida@Example.COM ',
    })

    expect(writtenDoc().invitedEmail).toBe('ida@example.com')
  })

  it('does NOT NFKC-fold the stored address (it is a real mailbox)', async () => {
    // U+FB00 LATIN SMALL LIGATURE FF. NFKC would turn this into
    // `office@ex.com`, a potentially different mailbox — and this address
    // receives the invitation bearer token.
    const ligature = 'oﬀice@ex.com'

    await createCoSpeakerInvitation({ ...params, invitedEmail: ligature })

    expect(writtenDoc().invitedEmail).toBe(ligature)
  })
})

/**
 * `resend` renews the SAME document rather than cancel-and-recreate, so the
 * invitation's history (who invited whom, when) survives. Boundary mock only:
 * the real patch-building logic runs and we read the document it writes.
 */
describe('renewCoSpeakerInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPatchCommit.mockResolvedValue({})
  })

  const params = {
    invitationId: 'inv-1',
    invitedEmail: 'ida@example.com',
    proposalId: 'proposal-1',
    ifRevisionId: 'rev-1',
  }

  it('patches the SAME document id', async () => {
    await renewCoSpeakerInvitation(params)

    expect(mockPatch).toHaveBeenCalledWith('inv-1')
  })

  it('conditions the write on the revision the caller read', async () => {
    await renewCoSpeakerInvitation({ ...params, ifRevisionId: 'rev-7' })

    // Without this a second renewal silently invalidates the token the first
    // one already emailed.
    expect(mockIfRevisionId).toHaveBeenCalledWith('rev-7')
  })

  it('mints a token that differs from the lapsed one, on the same document', async () => {
    // The token the document carried before renewal: same invitation, same
    // invitee, same proposal — only the expiry differs.
    const lapsedToken = mintInvitationToken({
      invitationId: params.invitationId,
      invitedEmail: params.invitedEmail,
      proposalId: params.proposalId,
      expiresAt: new Date('2026-05-04T00:00:00Z').getTime(),
    })

    const { token } = await renewCoSpeakerInvitation(params)

    expect(token).toBeTruthy()
    expect(token).not.toBe(lapsedToken)
    expect(mockPatchSet.mock.calls[0][0].token).toBe(token)
  })

  it('opens a fresh validity window and returns the invitation to pending', async () => {
    const before = Date.now()
    const { expiresAt } = await renewCoSpeakerInvitation(params)

    const windowMs = new Date(expiresAt).getTime() - before
    const expectedMs = INVITATION_VALID_DAYS * 24 * 60 * 60 * 1000
    expect(windowMs).toBeGreaterThan(expectedMs - 60_000)
    expect(windowMs).toBeLessThanOrEqual(expectedMs)
    expect(mockPatchSet.mock.calls[0][0]).toMatchObject({
      status: 'pending',
      expiresAt,
    })
  })

  it('clears everything keyed to the old window — it is a new one', async () => {
    await renewCoSpeakerInvitation(params)

    // Both, and for the same reason. `organizerAlertedAt` left set would
    // silence the daily job on a renewed invitation that lapses again:
    // alerted once, never again.
    expect(mockPatchUnset).toHaveBeenCalledWith([
      'lastRemindedAt',
      'organizerAlertedAt',
    ])
  })
})
