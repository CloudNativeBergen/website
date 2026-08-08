/**
 * @vitest-environment node
 *
 * The stored invited address is BOTH the mailbox a bearer token is delivered to
 * AND the key acceptance is granted against, so the canonicalization applied
 * here is a security decision, not formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPatchChain } = vi.hoisted(() => ({
  mockPatchChain: {
    set: vi.fn().mockReturnThis(),
    commit: vi.fn().mockImplementation(async () => ({ _id: 'inv-1' })),
  },
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    create: vi.fn().mockResolvedValue({ _id: 'inv-1' }),
    patch: vi.fn(() => mockPatchChain),
    delete: vi.fn().mockResolvedValue({}),
  },
  clientReadUncached: { fetch: vi.fn() },
  clientRead: { fetch: vi.fn() },
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))
vi.mock('@/lib/cospeaker/server', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}))

import { clientWrite } from '@/lib/sanity/client'
import { createOrganizerInvitation } from '@/lib/organizer-invite/server'
import { verifyOrganizerInviteToken } from '@/lib/organizer-invite/token'
import { ORGANIZER_INVITATION_VALID_DAYS } from '@/lib/organizer-invite/types'

describe('createOrganizerInvitation — the stored recipient address', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trims and lowercases the stored address', async () => {
    await createOrganizerInvitation({
      conferenceId: 'conf-1',
      invitedBySpeakerId: 'sp-1',
      invitedEmail: '  Ada@Example.COM ',
    })
    expect(clientWrite.create).toHaveBeenCalledWith(
      expect.objectContaining({ invitedEmail: 'ada@example.com' }),
    )
  })

  it('does NOT NFKC-fold the stored address (it is a real mailbox)', async () => {
    // `oﬃce@example.com` folds to `office@example.com` under NFKC, which is a
    // DIFFERENT mailbox. Folding here would mail a token to one address and
    // grant against another. (The router refuses such addresses outright; this
    // pins the creator's behaviour independently, so the two cannot both drift.)
    await createOrganizerInvitation({
      conferenceId: 'conf-1',
      invitedBySpeakerId: 'sp-1',
      invitedEmail: 'oﬃce@example.com',
    })
    const stored = vi.mocked(clientWrite.create).mock
      .calls[0][0] as unknown as { invitedEmail: string }
    expect(stored.invitedEmail).toBe('oﬃce@example.com')
    expect(stored.invitedEmail).not.toBe('office@example.com')
  })

  it('signs a token that names THIS document and THIS address', async () => {
    const now = new Date('2026-08-01T12:00:00.000Z')
    const invitation = await createOrganizerInvitation({
      conferenceId: 'conf-1',
      invitedBySpeakerId: 'sp-1',
      invitedEmail: 'Ada@Example.com',
      now,
    })
    const verified = verifyOrganizerInviteToken(invitation!.token)
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verified.payload.docId).toBe('inv-1')
    expect(verified.payload.invitedEmail).toBe('ada@example.com')
    const expectedExpiry = new Date(now)
    expectedExpiry.setDate(
      expectedExpiry.getDate() + ORGANIZER_INVITATION_VALID_DAYS,
    )
    expect(verified.payload.expiresAt).toBe(expectedExpiry.getTime())
  })

  it('returns null rather than throwing when the write fails', async () => {
    vi.mocked(clientWrite.create).mockRejectedValueOnce(new Error('nope'))
    await expect(
      createOrganizerInvitation({
        conferenceId: 'conf-1',
        invitedBySpeakerId: 'sp-1',
        invitedEmail: 'ada@example.com',
      }),
    ).resolves.toBeNull()
  })

  it('rolls back the document when the token cannot be stored', async () => {
    // A token-less invitation is `pending`, so it would occupy the
    // duplicate-pending slot and block the organizer from retrying — worse than
    // no invitation at all.
    mockPatchChain.commit.mockRejectedValueOnce(new Error('write failed'))
    await expect(
      createOrganizerInvitation({
        conferenceId: 'conf-1',
        invitedBySpeakerId: 'sp-1',
        invitedEmail: 'ada@example.com',
      }),
    ).resolves.toBeNull()
    expect(clientWrite.delete).toHaveBeenCalledWith('inv-1')
  })

  it('stores the conference the invitation belongs to', async () => {
    // The conference ref is what makes every later read conference-SCOPED; an
    // invitation without it would be unreachable rather than global, but it is
    // also what the cross-tenant refusal keys on.
    await createOrganizerInvitation({
      conferenceId: 'conf-42',
      invitedBySpeakerId: 'sp-1',
      invitedEmail: 'ada@example.com',
    })
    expect(clientWrite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        _type: 'organizerInvitation',
        conference: { _type: 'reference', _ref: 'conf-42' },
        status: 'pending',
      }),
    )
  })
})
