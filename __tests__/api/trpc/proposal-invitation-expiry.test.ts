/**
 * ZOMBIE INVITATIONS (the bug this suite exists for).
 *
 * `status: 'expired'` is written in exactly ONE place — the `invitation.respond`
 * path — so it only lands when the INVITEE clicks their link. Nobody clicks a
 * dead link, so an invitation that lapsed months ago still reads `pending` in
 * Sanity forever. Counted as pending it permanently consumes a co-speaker slot
 * and blocks every re-invite to the same address.
 *
 * Every test here drives the REAL procedure. The Sanity client and the email
 * sender are the only mocked boundaries; the expiry decision itself is the
 * production code's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getProposal } from '@/lib/proposal/data/sanity'
import { getInvitationById } from '@/lib/cospeaker/sanity'
import {
  createCoSpeakerInvitation,
  renewCoSpeakerInvitation,
  sendInvitationEmail,
} from '@/lib/cospeaker/server'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { Status, Format } from '@/lib/proposal/types'
import { speakers } from '../../helpers/trpc'

const { mockPatchChain } = vi.hoisted(() => ({
  mockPatchChain: {
    ifRevisionId: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    unset: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('@/lib/proposal/data/sanity')
vi.mock('@/lib/cospeaker/sanity')
// `@/lib/cospeaker/remind` is deliberately NOT mocked: the open check, the
// cooldown and the claim ordering these tests are about live there, and the
// daily cron runs the same function. It sends through the mock below.
vi.mock('@/lib/cospeaker/server')
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn().mockResolvedValue(undefined),
}))
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
      organizer: 'Test Org',
      cfpEmail: 'cfp@test.com',
      organization: { _type: 'reference', _ref: 'org-test' },
    },
    domain: 'test.com',
    error: null,
  }),
}))

const organizer = speakers.find((s) => s.isOrganizer)!

const DAY = 24 * 60 * 60 * 1000
const past = (ms: number) => new Date(Date.now() - ms).toISOString()
const future = (ms: number) => new Date(Date.now() + ms).toISOString()

/** What `getDocumentTenant` returns for an invitation of the request's org. */
const invitationTenant = {
  _type: 'coSpeakerInvitation',
  orgId: null,
  conferenceId: 'conf-1',
  conferenceOrgId: 'org-test',
  memberOrgIds: [],
}

const createCaller = (speaker: unknown) =>
  appRouter.createCaller({
    session: { user: { email: (speaker as { email: string }).email }, speaker },
    speaker,
    user: { email: (speaker as { email: string }).email },
  } as never)

/**
 * `presentation_25` allows exactly ONE co-speaker, so a single invitation
 * either fills the only slot or it does not — no arithmetic to hide behind.
 */
function proposalWith(
  invitations: Array<Record<string, unknown>>,
  status: Status = Status.confirmed,
) {
  return {
    _id: 'proposal-1',
    title: 'Test Proposal',
    status,
    format: Format.presentation_25,
    conference: { _id: 'conf-1' },
    speakers: [
      { _id: organizer._id, name: organizer.name, email: organizer.email },
    ],
    coSpeakerInvitations: invitations,
  }
}

/** A lapsed invitation as PRODUCTION stores it: still `pending`, long past due. */
const lapsedInvitation = {
  _id: 'inv-lapsed',
  invitedEmail: 'lapsed@test.com',
  status: 'pending',
  expiresAt: past(120 * DAY),
  createdAt: past(134 * DAY),
}

const openInvitation = {
  _id: 'inv-open',
  invitedEmail: 'open@test.com',
  status: 'pending',
  expiresAt: future(5 * DAY),
  createdAt: past(9 * DAY),
}

/** Shape `getInvitationById` returns: proposal and inviter dereferenced. */
function fullInvitation(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'inv-1',
    _rev: 'rev-1',
    invitedEmail: 'invited@test.com',
    invitedName: 'Ida Invitee',
    status: 'pending',
    token: 'token-original',
    expiresAt: future(5 * DAY),
    createdAt: past(9 * DAY),
    proposal: {
      _id: 'proposal-1',
      title: 'Test Proposal',
      format: Format.presentation_25,
      status: Status.confirmed,
    },
    invitedBy: {
      _id: organizer._id,
      name: organizer.name,
      email: organizer.email,
    },
    ...overrides,
  }
}

describe('co-speaker invitation expiry is computed, not stored', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPatchChain.set.mockReturnThis()
    mockPatchChain.unset.mockReturnThis()
    mockPatchChain.ifRevisionId.mockReturnThis()
    mockPatchChain.commit.mockResolvedValue({})
    vi.mocked(clientReadUncached.fetch).mockResolvedValue(
      invitationTenant as never,
    )
    vi.mocked(sendInvitationEmail).mockResolvedValue(true)
    vi.mocked(createCoSpeakerInvitation).mockResolvedValue({
      _id: 'inv-new',
      invitedEmail: 'fresh@test.com',
      status: 'pending',
      token: 'token-new',
      expiresAt: future(14 * DAY),
    } as never)
  })

  describe('invitation.send', () => {
    it('does NOT let a lapsed invitation consume the only co-speaker slot', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: proposalWith([lapsedInvitation]) as never,
        proposalError: null,
      } as never)

      const result = await createCaller(organizer).proposal.invitation.send({
        proposalId: 'proposal-1',
        invitedEmail: 'fresh@test.com',
        invitedName: 'Fresh Invitee',
      })

      // Fails on the ACTION SUCCEEDING, not on an absence: the invitation was
      // really created and really emailed.
      expect(result).toMatchObject({ _id: 'inv-new' })
      expect(createCoSpeakerInvitation).toHaveBeenCalledOnce()
      expect(sendInvitationEmail).toHaveBeenCalledOnce()
    })

    it('does NOT let a lapsed invitation block a fresh invite to the SAME address', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: proposalWith([lapsedInvitation]) as never,
        proposalError: null,
      } as never)

      await createCaller(organizer).proposal.invitation.send({
        proposalId: 'proposal-1',
        invitedEmail: 'lapsed@test.com',
      })

      expect(createCoSpeakerInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ invitedEmail: 'lapsed@test.com' }),
      )
    })

    it('STILL blocks a duplicate when the existing invitation is open', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: proposalWith([openInvitation]) as never,
        proposalError: null,
      } as never)

      await expect(
        createCaller(organizer).proposal.invitation.send({
          proposalId: 'proposal-1',
          invitedEmail: 'open@test.com',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('pending invitation already exists'),
      })

      expect(createCoSpeakerInvitation).not.toHaveBeenCalled()
    })

    it('STILL counts an open invitation against the slot limit', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: proposalWith([openInvitation]) as never,
        proposalError: null,
      } as never)

      await expect(
        createCaller(organizer).proposal.invitation.send({
          proposalId: 'proposal-1',
          invitedEmail: 'someone-else@test.com',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('at most 1 co-speaker'),
      })

      expect(createCoSpeakerInvitation).not.toHaveBeenCalled()
    })
  })

  describe('invitation.list', () => {
    const accepted = {
      _id: 'inv-accepted',
      invitedEmail: 'accepted@test.com',
      status: 'accepted',
      expiresAt: past(30 * DAY),
    }
    const canceled = {
      _id: 'inv-canceled',
      invitedEmail: 'canceled@test.com',
      status: 'canceled',
      expiresAt: past(30 * DAY),
    }
    const declined = {
      _id: 'inv-declined',
      invitedEmail: 'declined@test.com',
      status: 'declined',
      expiresAt: past(30 * DAY),
    }

    beforeEach(() => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: proposalWith([
          accepted,
          canceled,
          declined,
          lapsedInvitation,
          openInvitation,
        ]) as never,
        proposalError: null,
      } as never)
    })

    it('omits accepted and canceled invitations, and reports a lapsed one as expired', async () => {
      const rows = await createCaller(organizer).proposal.invitation.list({
        id: 'proposal-1',
      })

      expect(rows.map((r) => [r._id, r.status])).toEqual([
        ['inv-declined', 'declined'],
        ['inv-lapsed', 'expired'],
        ['inv-open', 'pending'],
      ])
    })

    it('returns every status, still with effective expiry, under includeAll', async () => {
      const rows = await createCaller(organizer).proposal.invitation.list({
        id: 'proposal-1',
        includeAll: true,
      })

      expect(rows.map((r) => r._id)).toEqual([
        'inv-accepted',
        'inv-canceled',
        'inv-declined',
        'inv-lapsed',
        'inv-open',
      ])
      expect(rows.find((r) => r._id === 'inv-lapsed')?.status).toBe('expired')
    })
  })

  describe('invitation.remind', () => {
    beforeEach(() => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: proposalWith([]) as never,
        proposalError: null,
      } as never)
    })

    it('re-sends the SAME token without moving the expiry, and stamps the cooldown', async () => {
      const invitation = fullInvitation()
      vi.mocked(getInvitationById).mockResolvedValue(invitation as never)

      const result = await createCaller(organizer).proposal.invitation.remind({
        invitationId: 'inv-1',
      })

      expect(result).toEqual({ success: true, expiresAt: invitation.expiresAt })
      // No third argument: a request-served reminder resolves its conference
      // from the request Host. Only the cron passes an explicit tenant context.
      expect(sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'token-original' }),
        'reminder',
        undefined,
      )
      expect(clientWrite.patch).toHaveBeenCalledWith('inv-1')
      // The claim is conditioned on the revision the invitation was READ at, so
      // a concurrent reminder loses instead of double-sending.
      expect(mockPatchChain.ifRevisionId).toHaveBeenCalledWith('rev-1')
      expect(mockPatchChain.set).toHaveBeenCalledWith({
        lastRemindedAt: expect.any(String),
      })
      // The expiry is the invitee's clock; a reminder must not restart it.
      expect(mockPatchChain.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: expect.anything() }),
      )
    })

    it('REFUSES inside the 24h cooldown and sends nothing', async () => {
      vi.mocked(getInvitationById).mockResolvedValue(
        fullInvitation({ lastRemindedAt: past(2 * 60 * 60 * 1000) }) as never,
      )

      await expect(
        createCaller(organizer).proposal.invitation.remind({
          invitationId: 'inv-1',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('in the last 24 hours'),
      })

      expect(sendInvitationEmail).not.toHaveBeenCalled()
      expect(clientWrite.patch).not.toHaveBeenCalled()
    })

    it('allows a reminder once the cooldown has elapsed', async () => {
      vi.mocked(getInvitationById).mockResolvedValue(
        fullInvitation({ lastRemindedAt: past(25 * 60 * 60 * 1000) }) as never,
      )

      await expect(
        createCaller(organizer).proposal.invitation.remind({
          invitationId: 'inv-1',
        }),
      ).resolves.toMatchObject({ success: true })
      expect(sendInvitationEmail).toHaveBeenCalledOnce()
    })

    it('RELEASES the cooldown claim when the email fails', async () => {
      vi.mocked(getInvitationById).mockResolvedValue(fullInvitation() as never)
      vi.mocked(sendInvitationEmail).mockResolvedValue(false)

      await expect(
        createCaller(organizer).proposal.invitation.remind({
          invitationId: 'inv-1',
        }),
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })

      // Claimed, then released — a failed send must not cost a day of cooldown.
      expect(mockPatchChain.unset).toHaveBeenCalledWith(['lastRemindedAt'])
    })

    it('REFUSES with CONFLICT when the cooldown claim loses its race', async () => {
      vi.mocked(getInvitationById).mockResolvedValue(fullInvitation() as never)
      mockPatchChain.commit.mockRejectedValueOnce(
        Object.assign(new Error('revision mismatch'), { statusCode: 409 }),
      )

      await expect(
        createCaller(organizer).proposal.invitation.remind({
          invitationId: 'inv-1',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' })

      // The loser of the race never sends. This is the whole point of claiming
      // before sending rather than stamping after.
      expect(sendInvitationEmail).not.toHaveBeenCalled()
    })

    it('REFUSES on a lapsed invitation and points at resend', async () => {
      vi.mocked(getInvitationById).mockResolvedValue(
        fullInvitation({ expiresAt: past(30 * DAY) }) as never,
      )

      await expect(
        createCaller(organizer).proposal.invitation.remind({
          invitationId: 'inv-1',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('resend'),
      })

      expect(sendInvitationEmail).not.toHaveBeenCalled()
    })

    it('REFUSES a foreign-tenant invitation before reading it (#746)', async () => {
      vi.mocked(clientReadUncached.fetch).mockResolvedValue({
        ...invitationTenant,
        conferenceOrgId: 'org-other',
      } as never)

      await expect(
        createCaller(organizer).proposal.invitation.remind({
          invitationId: 'inv-foreign',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })

      expect(getInvitationById).not.toHaveBeenCalled()
      expect(sendInvitationEmail).not.toHaveBeenCalled()
    })
  })

  describe('invitation.resend', () => {
    beforeEach(() => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: proposalWith([]) as never,
        proposalError: null,
      } as never)
      vi.mocked(renewCoSpeakerInvitation).mockResolvedValue({
        token: 'token-renewed',
        expiresAt: future(14 * DAY),
      } as never)
    })

    it('renews a lapsed invitation IN PLACE and emails the new link', async () => {
      vi.mocked(getInvitationById).mockResolvedValue(
        fullInvitation({ expiresAt: past(30 * DAY) }) as never,
      )

      const result = await createCaller(organizer).proposal.invitation.resend({
        invitationId: 'inv-1',
      })

      expect(result.success).toBe(true)
      expect(renewCoSpeakerInvitation).toHaveBeenCalledWith({
        invitationId: 'inv-1',
        invitedEmail: 'invited@test.com',
        proposalId: 'proposal-1',
        ifRevisionId: 'rev-1',
      })
      expect(sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'inv-1', token: 'token-renewed' }),
        'renewed',
      )
    })

    it('also renews one whose status was already flipped to expired', async () => {
      vi.mocked(getInvitationById).mockResolvedValue(
        fullInvitation({
          status: 'expired',
          expiresAt: past(30 * DAY),
        }) as never,
      )

      await expect(
        createCaller(organizer).proposal.invitation.resend({
          invitationId: 'inv-1',
        }),
      ).resolves.toMatchObject({ success: true })
    })

    it('REFUSES on an invitation that is still open', async () => {
      vi.mocked(getInvitationById).mockResolvedValue(fullInvitation() as never)

      await expect(
        createCaller(organizer).proposal.invitation.resend({
          invitationId: 'inv-1',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('still open'),
      })

      expect(renewCoSpeakerInvitation).not.toHaveBeenCalled()
      expect(sendInvitationEmail).not.toHaveBeenCalled()
    })

    it.each(['accepted', 'declined', 'canceled'])(
      'REFUSES on a %s invitation',
      async (status) => {
        vi.mocked(getInvitationById).mockResolvedValue(
          fullInvitation({ status, expiresAt: past(30 * DAY) }) as never,
        )

        await expect(
          createCaller(organizer).proposal.invitation.resend({
            invitationId: 'inv-1',
          }),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: expect.stringContaining(`was ${status}`),
        })

        expect(renewCoSpeakerInvitation).not.toHaveBeenCalled()
      },
    )

    /**
     * A renewal offers the seat again, so it must clear the same gate a fresh
     * invitation would. Without it: invite A lapses, B is invited and accepts,
     * then A is resent and accepts — three speakers on a two-speaker format,
     * and `respond` deliberately does not re-check the limit. Reachable by the
     * proposal OWNER too, since `organizerProcedure` is owner-or-organizer.
     */
    it('REFUSES when the seat freed by the lapse has since been filled', async () => {
      const lapsed = fullInvitation({
        _id: 'inv-lapsed',
        invitedEmail: 'lapsed@test.com',
        expiresAt: past(30 * DAY),
      })
      vi.mocked(getInvitationById).mockResolvedValue(lapsed as never)
      // presentation_25 allows ONE co-speaker, and B took it.
      vi.mocked(getProposal).mockResolvedValue({
        proposal: {
          ...proposalWith([
            {
              _id: 'inv-lapsed',
              invitedEmail: 'lapsed@test.com',
              status: 'pending',
              expiresAt: past(30 * DAY),
            },
          ]),
          speakers: [
            {
              _id: organizer._id,
              name: organizer.name,
              email: organizer.email,
            },
            { _id: 'speaker-b', name: 'B', email: 'b@test.com' },
          ],
        } as never,
        proposalError: null,
      } as never)

      await expect(
        createCaller(organizer).proposal.invitation.resend({
          invitationId: 'inv-lapsed',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('at most 1 co-speaker'),
      })

      expect(renewCoSpeakerInvitation).not.toHaveBeenCalled()
      expect(sendInvitationEmail).not.toHaveBeenCalled()
    })

    it('REFUSES when a fresh invitation to the same address is already open', async () => {
      const lapsed = fullInvitation({
        _id: 'inv-lapsed',
        invitedEmail: 'lapsed@test.com',
        expiresAt: past(30 * DAY),
      })
      vi.mocked(getInvitationById).mockResolvedValue(lapsed as never)
      vi.mocked(getProposal).mockResolvedValue({
        proposal: proposalWith([
          {
            _id: 'inv-lapsed',
            invitedEmail: 'lapsed@test.com',
            status: 'pending',
            expiresAt: past(30 * DAY),
          },
          {
            _id: 'inv-fresh',
            invitedEmail: 'lapsed@test.com',
            status: 'pending',
            expiresAt: future(10 * DAY),
          },
        ]) as never,
        proposalError: null,
      } as never)

      await expect(
        createCaller(organizer).proposal.invitation.resend({
          invitationId: 'inv-lapsed',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('pending invitation already exists'),
      })

      expect(renewCoSpeakerInvitation).not.toHaveBeenCalled()
    })

    it('REFUSES when the invitee has since become a speaker', async () => {
      const lapsed = fullInvitation({
        _id: 'inv-lapsed',
        invitedEmail: 'lapsed@test.com',
        expiresAt: past(30 * DAY),
      })
      vi.mocked(getInvitationById).mockResolvedValue(lapsed as never)
      vi.mocked(getProposal).mockResolvedValue({
        proposal: {
          ...proposalWith([]),
          format: Format.presentation_45,
          speakers: [
            {
              _id: organizer._id,
              name: organizer.name,
              email: organizer.email,
            },
            { _id: 'speaker-l', name: 'L', email: 'lapsed@test.com' },
          ],
        } as never,
        proposalError: null,
      } as never)

      await expect(
        createCaller(organizer).proposal.invitation.resend({
          invitationId: 'inv-lapsed',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('already a speaker'),
      })

      expect(renewCoSpeakerInvitation).not.toHaveBeenCalled()
    })

    it('does NOT let the invitation being renewed block or count against ITSELF', async () => {
      // The seat is free: the only invitation on the proposal is the lapsed one
      // being renewed. Fails on the renewal SUCCEEDING, so an over-broad gate
      // (one that forgot `exceptInvitationId`) would show up here.
      vi.mocked(getInvitationById).mockResolvedValue(
        fullInvitation({
          _id: 'inv-lapsed',
          invitedEmail: 'lapsed@test.com',
          expiresAt: past(30 * DAY),
        }) as never,
      )
      vi.mocked(getProposal).mockResolvedValue({
        proposal: proposalWith([
          {
            _id: 'inv-lapsed',
            invitedEmail: 'lapsed@test.com',
            status: 'pending',
            expiresAt: past(30 * DAY),
          },
        ]) as never,
        proposalError: null,
      } as never)

      await expect(
        createCaller(organizer).proposal.invitation.resend({
          invitationId: 'inv-lapsed',
        }),
      ).resolves.toMatchObject({ success: true })

      expect(renewCoSpeakerInvitation).toHaveBeenCalledOnce()
    })

    it('REFUSES with CONFLICT when the renewal loses its race, and sends nothing', async () => {
      vi.mocked(getInvitationById).mockResolvedValue(
        fullInvitation({ expiresAt: past(30 * DAY) }) as never,
      )
      vi.mocked(renewCoSpeakerInvitation).mockRejectedValue(
        Object.assign(new Error('revision mismatch'), { statusCode: 409 }),
      )

      await expect(
        createCaller(organizer).proposal.invitation.resend({
          invitationId: 'inv-1',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' })

      expect(sendInvitationEmail).not.toHaveBeenCalled()
    })

    it('REFUSES a foreign-tenant invitation before reading it (#746)', async () => {
      vi.mocked(clientReadUncached.fetch).mockResolvedValue({
        ...invitationTenant,
        conferenceOrgId: 'org-other',
      } as never)

      await expect(
        createCaller(organizer).proposal.invitation.resend({
          invitationId: 'inv-foreign',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })

      expect(getInvitationById).not.toHaveBeenCalled()
      expect(renewCoSpeakerInvitation).not.toHaveBeenCalled()
    })
  })
})
