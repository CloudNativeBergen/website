/**
 * `proposal.invitation.cancel` — the client id must be proved to be a
 * `coSpeakerInvitation` before it is patched (#746).
 *
 * The handler authorises through the `proposal` reference it finds on whatever
 * document `getDocument` returns. `review` and `conversation` carry a `proposal`
 * reference too, so without a type constraint an organizer could pass a review's
 * id and have `status` flipped on it — intra-tenant, one enum field, but exactly
 * the shape `requireDocumentInCurrentOrg`'s `_type` equality exists to prevent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getProposal } from '@/lib/proposal/data/sanity'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { speakers } from '../../helpers/trpc'

const { mockPatchChain } = vi.hoisted(() => ({
  mockPatchChain: {
    set: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('@/lib/proposal/data/sanity')
vi.mock('@/lib/cospeaker/sanity')
vi.mock('@/lib/cospeaker/server')
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn(),
    patch: vi.fn(() => mockPatchChain),
    transaction: vi.fn(),
    delete: vi.fn(),
  },
  clientReadUncached: { fetch: vi.fn() },
  clientRead: { fetch: vi.fn() },
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn().mockResolvedValue({
    conference: {
      _id: 'conf-1',
      title: 'Test Conf',
      organization: { _type: 'reference', _ref: 'org-test' },
    },
    domain: 'test.com',
    error: null,
  }),
}))

const organizerSpeaker = speakers.find((s) => s.isOrganizer)!

/** What `getDocumentTenant`'s by-id projection returns for a document. */
function tenantOf(type: string, orgId: string | null = 'org-test') {
  return {
    _type: type,
    orgId: null,
    conferenceId: 'conf-1',
    conferenceOrgId: orgId,
    memberOrgIds: [],
  }
}

const createCaller = (speaker: unknown) =>
  appRouter.createCaller({
    session: { user: { email: (speaker as { email: string }).email }, speaker },
    speaker,
    user: { email: (speaker as { email: string }).email },
  } as never)

describe('proposal.invitation.cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientWrite.getDocument).mockResolvedValue({
      _id: 'inv-1',
      _type: 'coSpeakerInvitation',
      proposal: { _ref: 'proposal-1' },
    } as never)
    vi.mocked(getProposal).mockResolvedValue({
      proposal: { _id: 'proposal-1' },
      proposalError: null,
    } as never)
  })

  it('cancels a genuine co-speaker invitation', async () => {
    vi.mocked(clientReadUncached.fetch).mockResolvedValue(
      tenantOf('coSpeakerInvitation') as never,
    )

    const result = await createCaller(
      organizerSpeaker,
    ).proposal.invitation.cancel({ invitationId: 'inv-1' })

    expect(result).toEqual({ success: true })
    expect(clientWrite.patch).toHaveBeenCalledWith('inv-1')
    expect(mockPatchChain.set).toHaveBeenCalledWith({ status: 'canceled' })
  })

  it('REFUSES a review id — the #746 exploit — and writes nothing', async () => {
    vi.mocked(clientReadUncached.fetch).mockResolvedValue(
      tenantOf('review') as never,
    )

    await expect(
      createCaller(organizerSpeaker).proposal.invitation.cancel({
        invitationId: 'review-1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(clientWrite.patch).not.toHaveBeenCalled()
    expect(clientWrite.getDocument).not.toHaveBeenCalled()
  })

  it('REFUSES a conversation id too', async () => {
    vi.mocked(clientReadUncached.fetch).mockResolvedValue(
      tenantOf('conversation') as never,
    )

    await expect(
      createCaller(organizerSpeaker).proposal.invitation.cancel({
        invitationId: 'conv-1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(clientWrite.patch).not.toHaveBeenCalled()
  })

  it('REFUSES an invitation belonging to another organization', async () => {
    vi.mocked(clientReadUncached.fetch).mockResolvedValue(
      tenantOf('coSpeakerInvitation', 'org-other') as never,
    )

    await expect(
      createCaller(organizerSpeaker).proposal.invitation.cancel({
        invitationId: 'inv-foreign',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(clientWrite.patch).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED when the tenancy probe cannot read the document', async () => {
    vi.mocked(clientReadUncached.fetch).mockRejectedValue(
      new Error('sanity down'),
    )

    await expect(
      createCaller(organizerSpeaker).proposal.invitation.cancel({
        invitationId: 'inv-1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(clientWrite.patch).not.toHaveBeenCalled()
  })
})
