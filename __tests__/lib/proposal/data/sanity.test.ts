const { mockFetch, mockTransaction, mockTxDelete, mockTxCommit } = vi.hoisted(
  () => {
    const mockTxDelete = vi.fn()
    const mockTxCommit = vi.fn().mockResolvedValue({})
    const transaction = { delete: mockTxDelete, commit: mockTxCommit }
    mockTxDelete.mockReturnValue(transaction)
    const mockTransaction = vi.fn(() => transaction)
    const mockFetch = vi.fn()
    return { mockFetch, mockTransaction, mockTxDelete, mockTxCommit }
  },
)

vi.mock('next-sanity', () => ({
  groq: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (query, part, index) =>
        query + part + (index < values.length ? String(values[index]) : ''),
      '',
    ),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: mockFetch,
  },
  clientWrite: {
    transaction: mockTransaction,
  },
}))

import {
  deleteProposal,
  ProposalDeletionBlockedError,
} from '@/lib/proposal/data/sanity'

describe('deleteProposal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTxCommit.mockResolvedValue({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes co-speaker invitations and reviews together with the talk in a single transaction', async () => {
    mockFetch.mockResolvedValue([
      { _id: 'invitation-1', _type: 'coSpeakerInvitation' },
      { _id: 'invitation-2', _type: 'coSpeakerInvitation' },
      { _id: 'review-1', _type: 'review' },
    ])

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('references($proposalId)'),
      { proposalId: 'proposal-1' },
    )
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockTxDelete.mock.calls.map((call) => call[0])).toEqual([
      'invitation-1',
      'invitation-2',
      'review-1',
      'proposal-1',
    ])
    expect(mockTxCommit).toHaveBeenCalledTimes(1)
  })

  it('deletes a talk without referencing documents', async () => {
    mockFetch.mockResolvedValue([])

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBeNull()
    expect(mockTxDelete).toHaveBeenCalledTimes(1)
    expect(mockTxDelete).toHaveBeenCalledWith('proposal-1')
    expect(mockTxCommit).toHaveBeenCalledTimes(1)
  })

  it('returns a descriptive error when the talk is placed in a schedule', async () => {
    mockFetch.mockResolvedValue([{ _id: 'schedule-1', _type: 'schedule' }])

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBeInstanceOf(ProposalDeletionBlockedError)
    expect(err?.message).toBe(
      'Cannot delete proposal: it is referenced by a published schedule. Remove those references first.',
    )
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockTxCommit).not.toHaveBeenCalled()
  })

  it('does not delete invitations or reviews when a blocking reference exists', async () => {
    mockFetch.mockResolvedValue([
      { _id: 'invitation-1', _type: 'coSpeakerInvitation' },
      { _id: 'review-1', _type: 'review' },
      { _id: 'conference-1', _type: 'conference' },
    ])

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBeInstanceOf(ProposalDeletionBlockedError)
    expect(err?.message).toContain('a conference (featured talks)')
    expect(mockTxDelete).not.toHaveBeenCalled()
    expect(mockTxCommit).not.toHaveBeenCalled()
  })

  it('lists every blocking reference type once in the error message', async () => {
    mockFetch.mockResolvedValue([
      { _id: 'schedule-1', _type: 'schedule' },
      { _id: 'schedule-2', _type: 'schedule' },
      { _id: 'signup-1', _type: 'workshopSignup' },
    ])

    const { err } = await deleteProposal('proposal-1')

    expect(err?.message).toBe(
      'Cannot delete proposal: it is referenced by a published schedule and workshop signups. Remove those references first.',
    )
  })

  it('falls back to the raw document type for unknown blocking references', async () => {
    mockFetch.mockResolvedValue([{ _id: 'other-1', _type: 'someNewType' }])

    const { err } = await deleteProposal('proposal-1')

    expect(err?.message).toContain('referenced by someNewType')
  })

  it('returns the error when the reference lookup fails', async () => {
    const failure = new Error('fetch failed')
    mockFetch.mockRejectedValue(failure)

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBe(failure)
    expect(err).not.toBeInstanceOf(ProposalDeletionBlockedError)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('returns the error when the transaction commit fails', async () => {
    mockFetch.mockResolvedValue([])
    const failure = new Error('commit failed')
    mockTxCommit.mockRejectedValue(failure)

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBe(failure)
  })
})
