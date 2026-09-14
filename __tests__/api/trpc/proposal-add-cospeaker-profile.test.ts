/**
 * `proposal.addCoSpeakerProfile` — the organizer escape hatch that CREATES a
 * co-speaker's profile instead of inviting them.
 *
 * The load-bearing assertion here is the SHAPE of the created document:
 * `knownEmails` and `providers` must be ABSENT. `knownEmails` is the
 * provider-VERIFIED match set (#808); an organizer typing an address is not
 * proof that anyone owns that mailbox, and writing it there would auto-link
 * whoever does own it into this document on their next login.
 *
 * `buildOrganizerCreatedSpeaker` is deliberately NOT mocked — mocking the thing
 * under assertion would prove nothing. Only its Sanity reads are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createAdminCaller,
  createAuthenticatedCaller,
  speakers,
} from '../../helpers/trpc'
import { TRPCError } from '@trpc/server'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { getProposal } from '@/lib/proposal/data/sanity'
import { sendCoSpeakerAddedEmail } from '@/lib/cospeaker/server'
import { requireDocumentInCurrentOrg } from '@/server/tenancy'
import { syncProposalConversationParticipants } from '@/lib/messaging/sanity'
import { Format, Status } from '@/lib/proposal/types'

const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: {
    create: vi.fn().mockReturnThis(),
    patch: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(() => mockTransaction),
    create: vi.fn().mockResolvedValue({ _id: 'speaker-new' }),
    patch: vi.fn(),
    delete: vi.fn().mockResolvedValue({}),
  },
  clientReadUncached: { fetch: vi.fn() },
  clientReadCached: { fetch: vi.fn() },
}))
vi.mock('@/lib/proposal/data/sanity')
vi.mock('@/lib/cospeaker/server')
// The tenancy waist reads Sanity directly and has its own tests; this file is
// about what the mutation does after it passes — and about it refusing when it
// does not.
vi.mock('@/server/tenancy', () => ({
  requireDocumentInCurrentOrg: vi.fn().mockResolvedValue('org-test'),
  requireDocumentsInCurrentOrg: vi.fn().mockResolvedValue('org-test'),
  requireSpeakersInCurrentOrg: vi.fn().mockResolvedValue('org-test'),
}))
vi.mock('@/lib/messaging/sanity', () => ({
  ensureProposalConversation: vi.fn().mockResolvedValue(null),
  syncProposalConversationParticipants: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn().mockResolvedValue(undefined),
  deleteMessageNotificationsFor: vi.fn().mockResolvedValue(0),
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

const PROPOSAL = {
  _id: 'proposal-1',
  title: 'Test Proposal',
  status: Status.submitted,
  format: Format.presentation_45,
  conference: { _id: 'conf-1' },
  speakers: [
    { _id: 'speaker-primary', name: 'Primary', email: 'primary@test.com' },
  ],
  coSpeakerInvitations: [],
}

/**
 * Route the two reads `buildOrganizerCreatedSpeaker` and the duplicate guard
 * make off the single `clientReadUncached.fetch` mock.
 *
 * The probe returns a bounded ROW SET, not one row, so that an in-org match
 * wins over a foreign one sharing the address. `name` is `null` on a foreign
 * row because the query `select`s it on the same predicate — the semantics are
 * pinned against the real GROQ engine in
 * `__tests__/lib/speaker/organizer-create-duplicate-probe.test.ts`.
 */
function mockReads({
  existingSpeakers = [],
}: {
  existingSpeakers?: { name: string | null; inCurrentOrg: boolean }[]
} = {}) {
  vi.mocked(clientReadUncached.fetch).mockImplementation((async (
    query: string,
  ) => {
    if (query.includes('slug.current')) return null
    if (query.includes('knownEmails')) return existingSpeakers
    return null
  }) as never)
}

/** The document handed to `transaction.create`. */
function createdSpeakerDocument() {
  expect(mockTransaction.create).toHaveBeenCalledTimes(1)
  return mockTransaction.create.mock.calls[0][0] as Record<string, unknown>
}

describe('proposal.addCoSpeakerProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReads()
    vi.mocked(getProposal).mockResolvedValue({
      proposal: PROPOSAL as never,
      proposalError: null as never,
    })
    vi.mocked(sendCoSpeakerAddedEmail).mockResolvedValue(true)
    vi.mocked(requireDocumentInCurrentOrg).mockResolvedValue('org-test')
  })

  it('creates a CLAIMABLE PLACEHOLDER: no knownEmails, no providers', async () => {
    const result = await createAdminCaller().proposal.addCoSpeakerProfile({
      proposalId: 'proposal-1',
      name: 'Nina Co-Speaker',
      email: 'Nina@Example.COM',
      title: 'Principal Engineer',
    })

    const doc = createdSpeakerDocument()

    // THE SECURITY ASSERTION. Absent, not empty — an empty array would still be
    // a verified-email set this person never verified.
    expect('knownEmails' in doc).toBe(false)
    expect('providers' in doc).toBe(false)

    expect(doc._type).toBe('speaker')
    expect(doc.name).toBe('Nina Co-Speaker')
    // Display email, stored canonically so the person's later login resolves to
    // THIS document instead of creating a duplicate.
    expect(doc.email).toBe('nina@example.com')
    expect(doc.title).toBe('Principal Engineer')
    expect(doc.organizations).toEqual([
      { _type: 'reference', _ref: 'org-test', _key: 'org-test' },
    ])
    expect(doc.slug).toEqual({ _type: 'slug', current: 'nina-co-speaker' })

    expect(result.speaker.name).toBe('Nina Co-Speaker')
    expect(result.notified).toBe(true)
    expect(result.notificationSkipped).toBe(false)
  })

  it('appends the new speaker to the proposal in the same transaction', async () => {
    await createAdminCaller().proposal.addCoSpeakerProfile({
      proposalId: 'proposal-1',
      name: 'Nina Co-Speaker',
      email: 'nina@example.com',
    })

    const createdId = createdSpeakerDocument()._id as string
    expect(createdId).toBeTruthy()

    expect(mockTransaction.patch).toHaveBeenCalledWith(
      'proposal-1',
      expect.any(Function),
    )
    // Drive the patch builder rather than trusting it exists.
    const builder = mockTransaction.patch.mock.calls[0][1] as (
      p: unknown,
    ) => unknown
    const patch = {
      setIfMissing: vi.fn().mockReturnThis(),
      append: vi.fn().mockReturnThis(),
    }
    builder(patch)
    expect(patch.setIfMissing).toHaveBeenCalledWith({ speakers: [] })
    expect(patch.append).toHaveBeenCalledWith('speakers', [
      expect.objectContaining({ _type: 'reference', _ref: createdId }),
    ])

    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
    // Participants snapshot stays in step, exactly as invitation acceptance does
    expect(syncProposalConversationParticipants).toHaveBeenCalledWith(
      'proposal-1',
      ['speaker-primary', createdId],
    )
  })

  it('notifies the person when an address is given', async () => {
    await createAdminCaller().proposal.addCoSpeakerProfile({
      proposalId: 'proposal-1',
      name: 'Nina Co-Speaker',
      email: 'nina@example.com',
    })

    expect(sendCoSpeakerAddedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'nina@example.com',
        toName: 'Nina Co-Speaker',
        proposalTitle: 'Test Proposal',
      }),
    )
  })

  it('skips the notification, and says so, when there is no address', async () => {
    const result = await createAdminCaller().proposal.addCoSpeakerProfile({
      proposalId: 'proposal-1',
      name: 'No Email Person',
    })

    expect(sendCoSpeakerAddedEmail).not.toHaveBeenCalled()
    expect(result.notified).toBe(false)
    expect(result.notificationSkipped).toBe(true)
    // The profile is still created, and carries no blank match key.
    const doc = createdSpeakerDocument()
    expect('email' in doc).toBe(false)
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
  })

  it('does not fail or roll back the mutation when the email throws', async () => {
    vi.mocked(sendCoSpeakerAddedEmail).mockRejectedValue(new Error('smtp down'))

    const result = await createAdminCaller().proposal.addCoSpeakerProfile({
      proposalId: 'proposal-1',
      name: 'Nina Co-Speaker',
      email: 'nina@example.com',
    })

    expect(result.notified).toBe(false)
    expect(result.notificationSkipped).toBe(false)
    // The profile was still written and committed.
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
  })

  it('refuses a proposal belonging to another organization', async () => {
    vi.mocked(requireDocumentInCurrentOrg).mockRejectedValue(
      new TRPCError({
        code: 'NOT_FOUND',
        message: 'No talk with that id for this request',
      }),
    )

    await expect(
      createAdminCaller().proposal.addCoSpeakerProfile({
        proposalId: 'foreign-proposal',
        name: 'Nina Co-Speaker',
        email: 'nina@example.com',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // GUARD BEFORE FETCH: the foreign proposal never loads, and nothing is written.
    expect(getProposal).not.toHaveBeenCalled()
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('refuses an address already on the proposal', async () => {
    await expect(
      createAdminCaller().proposal.addCoSpeakerProfile({
        proposalId: 'proposal-1',
        name: 'Primary Again',
        email: 'PRIMARY@test.com',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('already a speaker'),
    })

    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('refuses an address this org already has a profile for, naming it', async () => {
    mockReads({
      existingSpeakers: [{ name: 'Nina Existing', inCurrentOrg: true }],
    })

    await expect(
      createAdminCaller().proposal.addCoSpeakerProfile({
        proposalId: 'proposal-1',
        name: 'Nina Co-Speaker',
        email: 'nina@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('Nina Existing'),
    })

    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  /**
   * THE CROSS-TENANT CASE. A speaker document at ANOTHER org, with no
   * membership or participation here, still wins the login race
   * (`findSpeakerByProvider` short-circuits before any email matching), so a
   * placeholder created beside it could never be claimed — the notification
   * would promise something the login path cannot deliver.
   */
  it('refuses an address held by a speaker this org cannot see', async () => {
    // The probe found a match the caller has NO standing over, so the helper
    // strips the name before it ever reaches the router.
    mockReads({ existingSpeakers: [{ name: null, inCurrentOrg: false }] })

    const call = createAdminCaller().proposal.addCoSpeakerProfile({
      proposalId: 'proposal-1',
      name: 'Nina Co-Speaker',
      email: 'nina@example.com',
    })

    await expect(call).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(clientWrite.transaction).not.toHaveBeenCalled()

    // ONE BIT AND NO MORE. The refusal must not disclose the other tenant's
    // roster — asserted on the VALUE of the message, against every identifier
    // the probe could have carried.
    const message = await call.catch((e: Error) => e.message)
    expect(message).toContain('already exists for this email address')
    for (const leak of [
      'Nina Existing',
      'speaker-9',
      'org-other',
      'Other Conf',
      'nina-existing',
    ]) {
      expect(message).not.toContain(leak)
    }
  })

  it('cancels a now-moot pending invitation to the same address, atomically', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: {
        ...PROPOSAL,
        coSpeakerInvitations: [
          { _id: 'inv-1', invitedEmail: 'Nina@Example.com', status: 'pending' },
          {
            _id: 'inv-2',
            invitedEmail: 'other@example.com',
            status: 'pending',
          },
          // A DIFFERENT address: a declined invitation to the address being
          // created now refuses the whole mutation (see the "PLAIN create
          // path" case), so it cannot appear here.
          {
            _id: 'inv-3',
            invitedEmail: 'someone.else@example.com',
            status: 'declined',
          },
        ],
      } as never,
      proposalError: null as never,
    })

    const result = await createAdminCaller().proposal.addCoSpeakerProfile({
      proposalId: 'proposal-1',
      name: 'Nina Co-Speaker',
      email: 'nina@example.com',
    })

    expect(result.supersededInvitationIds).toEqual(['inv-1'])
    // Same transaction as the create + append: the proposal patch plus exactly
    // one invitation patch, and one commit.
    expect(mockTransaction.patch).toHaveBeenCalledWith(
      'inv-1',
      expect.any(Function),
    )
    expect(mockTransaction.patch).toHaveBeenCalledTimes(2)
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)

    const builder = mockTransaction.patch.mock.calls[1][1] as (
      p: unknown,
    ) => unknown
    const patch = { set: vi.fn().mockReturnThis() }
    builder(patch)
    expect(patch.set).toHaveBeenCalledWith({ status: 'canceled' })
  })

  /**
   * The invitation array arrives EFFECTIVE-STATUS-MAPPED (a lapsed `pending`
   * reads `expired`; see `withEffectiveInvitationStatus`), so a supersede that
   * matched the literal `'pending'` would skip exactly the invitations most
   * likely to be stale — leaving an `expired` row standing against someone who
   * is now a speaker. The test is "unresolved", not "which string is stored".
   */
  it('cancels a LAPSED invitation to the same address too', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: {
        ...PROPOSAL,
        coSpeakerInvitations: [
          {
            _id: 'inv-lapsed',
            invitedEmail: 'nina@example.com',
            status: 'expired',
          },
          {
            _id: 'inv-open',
            invitedEmail: 'nina@example.com',
            status: 'pending',
          },
          {
            _id: 'inv-done',
            invitedEmail: 'nina@example.com',
            status: 'accepted',
          },
          {
            _id: 'inv-gone',
            invitedEmail: 'nina@example.com',
            status: 'canceled',
          },
        ],
      } as never,
      proposalError: null as never,
    })

    const result = await createAdminCaller().proposal.addCoSpeakerProfile({
      proposalId: 'proposal-1',
      name: 'Nina Co-Speaker',
      email: 'nina@example.com',
    })

    // The lapsed one is superseded alongside the open one; the already-resolved
    // ones are left exactly as they are.
    expect(result.supersededInvitationIds).toEqual(['inv-lapsed', 'inv-open'])
    expect(mockTransaction.patch).toHaveBeenCalledWith(
      'inv-lapsed',
      expect.any(Function),
    )
    expect(mockTransaction.patch).not.toHaveBeenCalledWith(
      'inv-done',
      expect.anything(),
    )
    expect(mockTransaction.patch).not.toHaveBeenCalledWith(
      'inv-gone',
      expect.anything(),
    )
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
  })

  it('refuses an address whose NFKC form differs — it would be unclaimable', async () => {
    await expect(
      createAdminCaller().proposal.addCoSpeakerProfile({
        proposalId: 'proposal-1',
        name: 'Nina Co-Speaker',
        // U+FB03 "ffi" ligature: `normalizeEmail` folds it to `office@…`, the
        // stored `canonicalEmail` does not — so login would never find this
        // document and the "claimable" promise would be false.
        email: 'oﬃce@example.com',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('refuses to grow a proposal past the global speaker ceiling', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: {
        ...PROPOSAL,
        speakers: Array.from({ length: 20 }, (_, i) => ({
          _id: `speaker-${i}`,
          name: `Speaker ${i}`,
          email: `s${i}@test.com`,
        })),
      } as never,
      proposalError: null as never,
    })

    await expect(
      createAdminCaller().proposal.addCoSpeakerProfile({
        proposalId: 'proposal-1',
        name: 'One Too Many',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('maximum of 20'),
    })

    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('refuses a non-organizer — a speaker cannot fabricate a co-speaker', async () => {
    // A REAL non-organizer from the fixture — named explicitly, because
    // `createAuthenticatedCaller` silently falls back to speakers[0] for an id
    // it does not know, which would make this test prove nothing about who it
    // signed in as.
    const nonOrganizer = speakers.find((s) => !s.organizerOrgIds?.length)!
    expect(nonOrganizer.organizerOrgIds ?? []).toEqual([])

    await expect(
      createAuthenticatedCaller(nonOrganizer._id).proposal.addCoSpeakerProfile({
        proposalId: 'proposal-1',
        name: 'Nina Co-Speaker',
        email: 'nina@example.com',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect(requireDocumentInCurrentOrg).not.toHaveBeenCalled()
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('refuses unknown input fields (the schema is strict)', async () => {
    await expect(
      createAdminCaller().proposal.addCoSpeakerProfile({
        proposalId: 'proposal-1',
        name: 'Nina Co-Speaker',
        knownEmails: ['nina@example.com'],
      } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })
})

/**
 * UPGRADING AN INVITATION into a profile — the quick path for a co-speaker who
 * will not act on theirs. `fromInvitationId` adds no new write: the supersede
 * that already cancels an unresolved invitation to the same address does that
 * work. What it adds is a REFUSAL, and that refusal is the point of this block.
 *
 * A DECLINED invitation is an explicit "no". Hiding the row action is
 * affordance; the control is here, so every case below asserts that NOTHING
 * was written — `clientWrite.transaction` was never even opened.
 */
describe('proposal.addCoSpeakerProfile — upgrading an invitation', () => {
  const withInvitations = (
    invitations: { _id: string; invitedEmail: string; status: string }[],
  ) =>
    vi.mocked(getProposal).mockResolvedValue({
      proposal: { ...PROPOSAL, coSpeakerInvitations: invitations } as never,
      proposalError: null as never,
    })

  const upgrade = (fromInvitationId: string, email = 'nina@example.com') =>
    createAdminCaller().proposal.addCoSpeakerProfile({
      proposalId: 'proposal-1',
      name: 'Nina Co-Speaker',
      email,
      fromInvitationId,
    })

  beforeEach(() => {
    vi.clearAllMocks()
    mockReads()
    vi.mocked(sendCoSpeakerAddedEmail).mockResolvedValue(true)
    vi.mocked(requireDocumentInCurrentOrg).mockResolvedValue('org-test')
    withInvitations([
      { _id: 'inv-open', invitedEmail: 'nina@example.com', status: 'pending' },
    ])
  })

  it('upgrades an OPEN invitation and leaves no stale row behind', async () => {
    const result = await upgrade('inv-open')

    expect(result.speaker.email).toBe('nina@example.com')
    expect(result.notified).toBe(true)
    // The supersede did the cancel; there is no second write path.
    expect(result.supersededInvitationIds).toEqual(['inv-open'])
    expect(mockTransaction.patch).toHaveBeenCalledWith(
      'inv-open',
      expect.any(Function),
    )
    // The proposal append plus exactly ONE invitation patch: a second cancel
    // keyed on `fromInvitationId` would show up as a third.
    expect(mockTransaction.patch).toHaveBeenCalledTimes(2)
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
  })

  it('upgrades a LAPSED invitation — an expired one is still unanswered', async () => {
    withInvitations([
      {
        _id: 'inv-lapsed',
        invitedEmail: 'nina@example.com',
        status: 'expired',
      },
    ])

    const result = await upgrade('inv-lapsed')

    expect(result.supersededInvitationIds).toEqual(['inv-lapsed'])
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
  })

  /**
   * THE LOAD-BEARING ONE, and the reason the declined rule is keyed on the
   * ADDRESS rather than on `fromInvitationId`: an operator who simply TYPES a
   * declined invitee's address into the plain "create the profile yourself"
   * step arrives here with no invitation id at all. A rule that only inspected
   * `fromInvitationId` would have enforced nothing against that route — and
   * once the person is a speaker, `ProposalCoSpeaker` renders their speaker row
   * instead of the invitation, so the declined answer would disappear from the
   * page while the document stood in Sanity.
   */
  it('REFUSES the PLAIN create path when that address declined — no invitation id', async () => {
    withInvitations([
      {
        _id: 'inv-declined',
        invitedEmail: 'Nina@Example.com',
        status: 'declined',
      },
    ])

    const call = createAdminCaller().proposal.addCoSpeakerProfile({
      proposalId: 'proposal-1',
      name: 'Nina Co-Speaker',
      email: 'nina@example.com',
      // NO fromInvitationId: this is the typed-in route.
    })
    await expect(call).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    const message = await call.catch((e: Error) => e.message)
    expect(message).toContain('declined an invitation')
    expect(message).toContain('override that answer')

    expect(clientWrite.transaction).not.toHaveBeenCalled()
    expect(sendCoSpeakerAddedEmail).not.toHaveBeenCalled()
  })

  /** THE LOAD-BEARING ONE. */
  it('REFUSES a declined invitation, saying why, and writes nothing', async () => {
    withInvitations([
      {
        _id: 'inv-declined',
        invitedEmail: 'nina@example.com',
        status: 'declined',
      },
    ])

    const call = upgrade('inv-declined')
    await expect(call).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    // On the VALUE of the message, not merely on a refusal: the duplicate
    // probe, the format ceiling and the tenancy guard all refuse with
    // BAD_REQUEST too, and none of them says this.
    const message = await call.catch((e: Error) => e.message)
    expect(message).toContain('declined an invitation')
    expect(message).toContain('override that answer')

    expect(clientWrite.transaction).not.toHaveBeenCalled()
    expect(sendCoSpeakerAddedEmail).not.toHaveBeenCalled()
  })

  it('refuses an accepted or canceled invitation too', async () => {
    withInvitations([
      { _id: 'inv-done', invitedEmail: 'nina@example.com', status: 'accepted' },
      { _id: 'inv-gone', invitedEmail: 'nina@example.com', status: 'canceled' },
    ])

    await expect(upgrade('inv-done')).rejects.toMatchObject({
      message: expect.stringContaining('already accepted'),
    })
    await expect(upgrade('inv-gone')).rejects.toMatchObject({
      message: expect.stringContaining('already canceled'),
    })
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('refuses an invitation that is not on this proposal', async () => {
    await expect(upgrade('inv-elsewhere')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('not on this proposal'),
    })
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  /**
   * The supersede is keyed on the EMAIL, so an edited address would create a
   * profile for somebody else and leave the invitation standing. Refuse rather
   * than grow a second cancel path.
   */
  it('refuses an address that does not match the invitation', async () => {
    await expect(
      upgrade('inv-open', 'someone.else@example.com'),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('must match the invitation'),
    })
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('refuses a non-organizer naming an invitation', async () => {
    const nonOrganizer = speakers.find((s) => !s.organizerOrgIds?.length)!
    expect(nonOrganizer.organizerOrgIds ?? []).toEqual([])

    await expect(
      createAuthenticatedCaller(nonOrganizer._id).proposal.addCoSpeakerProfile({
        proposalId: 'proposal-1',
        name: 'Nina Co-Speaker',
        email: 'nina@example.com',
        fromInvitationId: 'inv-open',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })
})
