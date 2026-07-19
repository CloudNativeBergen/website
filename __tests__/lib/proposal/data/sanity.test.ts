const {
  mockFetch,
  mockTransaction,
  mockTxDelete,
  mockTxCommit,
  mockPatch,
  mockSet,
  mockUnset,
  mockPatchCommit,
} = vi.hoisted(() => {
  const mockTxDelete = vi.fn()
  const mockTxCommit = vi.fn().mockResolvedValue({})
  const transaction = { delete: mockTxDelete, commit: mockTxCommit }
  mockTxDelete.mockReturnValue(transaction)
  const mockTransaction = vi.fn(() => transaction)
  const mockFetch = vi.fn()

  const mockPatchCommit = vi.fn().mockResolvedValue({ _id: 'proposal-1' })
  const mockUnset = vi.fn()
  const mockSet = vi.fn()
  const patch = { set: mockSet, unset: mockUnset, commit: mockPatchCommit }
  mockSet.mockReturnValue(patch)
  mockUnset.mockReturnValue(patch)
  const mockPatch = vi.fn(() => patch)

  return {
    mockFetch,
    mockTransaction,
    mockTxDelete,
    mockTxCommit,
    mockPatch,
    mockSet,
    mockUnset,
    mockPatchCommit,
  }
})

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
    patch: mockPatch,
  },
}))

import {
  deleteProposal,
  ProposalDeletionBlockedError,
  updateProposalStatus,
} from '@/lib/proposal/data/sanity'
import { Status } from '@/lib/proposal/types'

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
    mockFetch
      // referencing docs (cascade-safe only, no thread)
      .mockResolvedValueOnce([
        { _id: 'invitation-1', _type: 'coSpeakerInvitation' },
        { _id: 'invitation-2', _type: 'coSpeakerInvitation' },
        { _id: 'review-1', _type: 'review' },
      ])
      // conversationIds (no thread)
      .mockResolvedValueOnce([])
      // messageNotificationIds (no message notifications for the thread)
      .mockResolvedValueOnce([])

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('references($proposalId)'),
      { proposalId: 'proposal-1' },
    )
    // With no thread, everything collapses into the single final transaction:
    // the cascade dependents + the proposal itself.
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockTxDelete.mock.calls.map((call) => call[0])).toEqual([
      'invitation-1',
      'invitation-2',
      'review-1',
      'proposal-1',
    ])
    expect(mockTxCommit).toHaveBeenCalledTimes(1)
  })

  it('cascade-deletes the proposal thread — messages, conversation, and message notifications — keeping other notifications', async () => {
    mockFetch
      // referencing docs: a conversation (weak), a message notification (weak),
      // a non-message notification (weak), and a review (cascade). NONE block.
      .mockResolvedValueOnce([
        { _id: 'conversation.proposal.proposal-1', _type: 'conversation' },
        { _id: 'notif-msg-1', _type: 'notification' },
        { _id: 'notif-status-1', _type: 'notification' },
        { _id: 'review-1', _type: 'review' },
      ])
      // conversationIds for the proposal
      .mockResolvedValueOnce(['conversation.proposal.proposal-1'])
      // messageIds in those conversations
      .mockResolvedValueOnce(['msg-1', 'msg-2'])
      // message notification ids (matched by proposal-thread link)
      .mockResolvedValueOnce(['notif-msg-1'])

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBeNull()

    // The message-notification lookup filters on message_received + link in the
    // two proposal-thread audience variants.
    const notifCall = mockFetch.mock.calls[3]
    expect(notifCall[0]).toContain('notificationType == "message_received"')
    expect(notifCall[0]).toContain('link in $messageLinks')
    expect(notifCall[1]).toEqual({
      messageLinks: [
        '/admin/proposals/proposal-1#messages',
        '/cfp/proposal/proposal-1#messages',
      ],
    })

    // Four transactions: messages, conversation, message-notification, then the
    // cascade dependents + proposal.
    expect(mockTransaction).toHaveBeenCalledTimes(4)
    const deleted = mockTxDelete.mock.calls.map((call) => call[0])
    expect(deleted).toEqual([
      'msg-1',
      'msg-2',
      'conversation.proposal.proposal-1',
      'notif-msg-1',
      'review-1',
      'proposal-1',
    ])
    // The non-message notification is neither blocking nor deleted (its weak
    // ref simply dangles).
    expect(deleted).not.toContain('notif-status-1')
  })

  it('keeps a non-message notification referencing the proposal without blocking or deleting it', async () => {
    mockFetch
      // Only a (weak) notification references the proposal — must NOT block.
      .mockResolvedValueOnce([{ _id: 'notif-1', _type: 'notification' }])
      // no conversations
      .mockResolvedValueOnce([])
      // no message notifications
      .mockResolvedValueOnce([])

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBeNull()
    // Only the proposal itself is deleted; the notification is kept.
    expect(mockTxDelete.mock.calls.map((call) => call[0])).toEqual([
      'proposal-1',
    ])
  })

  it('deletes a talk without referencing documents', async () => {
    mockFetch
      .mockResolvedValueOnce([]) // referencing docs
      .mockResolvedValueOnce([]) // conversationIds
      .mockResolvedValueOnce([]) // messageNotificationIds

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBeNull()
    expect(mockTxDelete).toHaveBeenCalledTimes(1)
    expect(mockTxDelete).toHaveBeenCalledWith('proposal-1')
    expect(mockTxCommit).toHaveBeenCalledTimes(1)
  })

  it('returns a descriptive error when the talk is placed in a schedule', async () => {
    mockFetch.mockResolvedValueOnce([{ _id: 'schedule-1', _type: 'schedule' }])

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBeInstanceOf(ProposalDeletionBlockedError)
    expect(err?.message).toBe(
      'Cannot delete proposal: it is referenced by a published schedule. Remove those references first.',
    )
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockTxCommit).not.toHaveBeenCalled()
  })

  it('still blocks on a schedule even when a message thread also references the proposal', async () => {
    mockFetch.mockResolvedValueOnce([
      { _id: 'conversation.proposal.proposal-1', _type: 'conversation' },
      { _id: 'schedule-1', _type: 'schedule' },
    ])

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBeInstanceOf(ProposalDeletionBlockedError)
    expect(err?.message).toContain('a published schedule')
    // Blocked before any cascade fetch or delete.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('does not delete invitations or reviews when a blocking reference exists', async () => {
    mockFetch.mockResolvedValueOnce([
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
    mockFetch.mockResolvedValueOnce([
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
    mockFetch.mockResolvedValueOnce([{ _id: 'other-1', _type: 'someNewType' }])

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
    mockFetch
      .mockResolvedValueOnce([]) // referencing docs
      .mockResolvedValueOnce([]) // conversationIds
      .mockResolvedValueOnce([]) // messageNotificationIds
    const failure = new Error('commit failed')
    mockTxCommit.mockRejectedValue(failure)

    const { err } = await deleteProposal('proposal-1')

    expect(err).toBe(failure)
  })
})

describe('updateProposalStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPatchCommit.mockResolvedValue({ _id: 'proposal-1' })
  })

  it('persists the withdrawal reason and does not unset it', async () => {
    await updateProposalStatus(
      'proposal-1',
      Status.withdrawn,
      '  Family emergency  ',
    )

    expect(mockPatch).toHaveBeenCalledWith('proposal-1')
    // Reason is trimmed and set alongside the status.
    expect(mockSet).toHaveBeenCalledWith({
      status: Status.withdrawn,
      withdrawnReason: 'Family emergency',
    })
    expect(mockUnset).not.toHaveBeenCalled()
    expect(mockPatchCommit).toHaveBeenCalled()
  })

  it('unsets a stale reason on a status change without a reason', async () => {
    await updateProposalStatus('proposal-1', Status.accepted)

    expect(mockSet).toHaveBeenCalledWith({ status: Status.accepted })
    // No reason -> clear any previous withdrawnReason so it can't linger.
    expect(mockUnset).toHaveBeenCalledWith(['withdrawnReason'])
    expect(mockPatchCommit).toHaveBeenCalled()
  })

  it('treats a whitespace-only reason as no reason and unsets', async () => {
    await updateProposalStatus('proposal-1', Status.withdrawn, '   ')

    expect(mockSet).toHaveBeenCalledWith({ status: Status.withdrawn })
    expect(mockUnset).toHaveBeenCalledWith(['withdrawnReason'])
  })

  it('returns the error when the patch commit fails', async () => {
    const failure = new Error('patch failed')
    mockPatchCommit.mockRejectedValueOnce(failure)

    const { err } = await updateProposalStatus('proposal-1', Status.accepted)

    expect(err).toBe(failure)
  })
})
