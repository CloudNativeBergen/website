/**
 * `proposal.admin.create` with `newSpeaker` — the organizer enters a proposal
 * AND its primary speaker at once, for a person the dataset does not hold yet.
 *
 * Two things are load-bearing here:
 *   1. THE SHAPE of the created speaker: `knownEmails` and `providers` must be
 *      ABSENT. `knownEmails` is the provider-VERIFIED match set (#808); an
 *      organizer typing an address is not proof that anyone owns that mailbox,
 *      and writing it there would auto-link whoever does own it into this
 *      document on their next login.
 *   2. ATOMICITY: the speaker and the proposal are created in ONE transaction,
 *      so a failed write leaves no orphan speaker on nobody's talk.
 *
 * `buildOrganizerCreatedSpeaker` and `buildProposalDocument` are deliberately
 * NOT mocked — mocking the things under assertion would prove nothing. Only
 * their Sanity reads are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAdminCaller } from '../../helpers/trpc'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { sendCoSpeakerAddedEmail } from '@/lib/cospeaker/server'
import { Audience, Format, Language, Level } from '@/lib/proposal/types'

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
    create: vi.fn().mockResolvedValue({ _id: 'talk-created' }),
    patch: vi.fn(),
    delete: vi.fn().mockResolvedValue({}),
  },
  clientReadUncached: { fetch: vi.fn() },
  clientReadCached: { fetch: vi.fn() },
}))
vi.mock('@/lib/cospeaker/server')
// The tenancy waist reads Sanity directly and has its own tests; this file is
// about what the mutation does after it passes.
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

const PROPOSAL_INPUT = {
  title: 'A keynote entered by an organizer',
  description: [
    { _type: 'block', children: [{ _type: 'span', text: 'Body' }] },
  ],
  format: Format.presentation_45,
  level: Level.intermediate,
  language: Language.english,
  audiences: [Audience.developer],
  topics: [{ _type: 'reference' as const, _ref: 'topic-1' }],
  tos: true,
}

/**
 * Route the two reads `buildOrganizerCreatedSpeaker` (slug uniqueness) and the
 * duplicate probe make off the single `clientReadUncached.fetch` mock.
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

/** The documents handed to `transaction.create`, in order. */
function createdDocuments() {
  return mockTransaction.create.mock.calls.map(
    (call) => call[0] as Record<string, unknown>,
  )
}

describe('proposal.admin.create with a new primary speaker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReads()
    vi.mocked(sendCoSpeakerAddedEmail).mockResolvedValue(true)
    mockTransaction.commit.mockResolvedValue({})
  })

  it('creates the speaker AND the proposal in one transaction', async () => {
    const proposal = await createAdminCaller().proposal.admin.create({
      ...PROPOSAL_INPUT,
      newSpeaker: {
        name: 'Nina Keynote',
        email: 'Nina@Example.COM',
        title: 'Principal Engineer',
      },
    })

    // ONE transaction, TWO creates, ONE commit — not two round-trips.
    expect(clientWrite.transaction).toHaveBeenCalledTimes(1)
    expect(mockTransaction.create).toHaveBeenCalledTimes(2)
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
    // Nothing is written outside it.
    expect(clientWrite.create).not.toHaveBeenCalled()

    const [speakerDoc, talkDoc] = createdDocuments()
    expect(speakerDoc._type).toBe('speaker')
    expect(speakerDoc.name).toBe('Nina Keynote')
    // Stored canonical (trim + lowercase), the same form the login path writes.
    expect(speakerDoc.email).toBe('nina@example.com')
    expect(speakerDoc.organizations).toEqual([
      expect.objectContaining({ _ref: 'org-test' }),
    ])

    expect(talkDoc._type).toBe('talk')
    expect(talkDoc.title).toBe('A keynote entered by an organizer')
    expect(talkDoc.conference).toMatchObject({ _ref: 'conf-1' })
    // The proposal points at the speaker created beside it.
    expect(talkDoc.speakers).toEqual([
      expect.objectContaining({ _ref: speakerDoc._id }),
    ])
    expect(proposal._id).toBe(talkDoc._id)
  })

  it('creates a CLAIMABLE PLACEHOLDER: no knownEmails, no providers', async () => {
    await createAdminCaller().proposal.admin.create({
      ...PROPOSAL_INPUT,
      newSpeaker: { name: 'Nina Keynote', email: 'nina@example.com' },
    })

    const [speakerDoc] = createdDocuments()
    // ABSENT, not empty: an empty verified match set is still a field other
    // code compares against.
    expect(speakerDoc).not.toHaveProperty('knownEmails')
    expect(speakerDoc).not.toHaveProperty('providers')
    // The display address IS written — it is what makes the profile claimable.
    expect(speakerDoc.email).toBe('nina@example.com')
  })

  it('puts the new speaker first, before existing ones added alongside', async () => {
    await createAdminCaller().proposal.admin.create({
      ...PROPOSAL_INPUT,
      speakers: ['speaker-existing'],
      newSpeaker: { name: 'Nina Keynote', email: 'nina@example.com' },
    })

    const [speakerDoc, talkDoc] = createdDocuments()
    expect(talkDoc.speakers).toEqual([
      expect.objectContaining({ _ref: speakerDoc._id }),
      expect.objectContaining({ _ref: 'speaker-existing' }),
    ])
  })

  it('refuses an address that already has a profile anywhere, and writes nothing', async () => {
    mockReads({
      existingSpeakers: [{ name: 'Nina Existing', inCurrentOrg: true }],
    })

    await expect(
      createAdminCaller().proposal.admin.create({
        ...PROPOSAL_INPUT,
        newSpeaker: { name: 'Nina Keynote', email: 'nina@example.com' },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('Nina Existing'),
    })

    expect(clientWrite.transaction).not.toHaveBeenCalled()
    expect(clientWrite.create).not.toHaveBeenCalled()
  })

  it('names nothing about a profile this org cannot see', async () => {
    mockReads({ existingSpeakers: [{ name: null, inCurrentOrg: false }] })

    await expect(
      createAdminCaller().proposal.admin.create({
        ...PROPOSAL_INPUT,
        newSpeaker: { name: 'Nina Keynote', email: 'nina@example.com' },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'A speaker profile already exists for this email address. Ask them to sign in with it — they will then appear in the speaker picker and can be added as an existing speaker.',
    })
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('refuses a missing email: no profile without someone to notify', async () => {
    await expect(
      createAdminCaller().proposal.admin.create({
        ...PROPOSAL_INPUT,
        newSpeaker: { name: 'Nina Keynote' } as never,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  /**
   * WHAT THIS PROVES, EXACTLY: the address is refused and nothing is written.
   * It does NOT isolate which guard refuses it. Zod's `.email()` rejects every
   * non-ASCII address on its own, and a NFKC-divergent address is necessarily
   * non-ASCII (both forms trim and lowercase; only NFKC folding can separate
   * them), so `.email()` and `isClaimableEmail` are each sufficient here —
   * removing either alone keeps this test green, removing both turns it red.
   * The refine is kept as the explicit statement of the rule, matching
   * `AddCoSpeakerProfileSchema`, and holds if the email validator is relaxed.
   */
  it('refuses an address whose NFKC form differs — the profile could never be claimed', async () => {
    await expect(
      createAdminCaller().proposal.admin.create({
        ...PROPOSAL_INPUT,
        // U+FB03 "ffi" ligature: `normalizeEmail` folds it to `office@…`, the
        // stored `canonicalEmail` does not — so login would never find this
        // document and the "claimable" promise would be false.
        newSpeaker: { name: 'Nina Keynote', email: 'oﬃce@example.com' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('refuses a proposal with no speaker at all', async () => {
    await expect(
      createAdminCaller().proposal.admin.create({
        ...PROPOSAL_INPUT,
        speakers: [],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(clientWrite.transaction).not.toHaveBeenCalled()
    expect(clientWrite.create).not.toHaveBeenCalled()
  })

  /**
   * THE DRAFTED SPEAKER COUNTS TOWARD THE CEILING, so this path cannot land 21
   * on a talk while `addCoSpeakerProfile` refuses the 21st. The pair matters:
   * 20 existing ids alone is accepted, and the same 20 plus a `newSpeaker` is
   * not — so the refusal is the ceiling and not the array length.
   */
  it('counts the new speaker toward the 20-speaker ceiling', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `speaker-${i}`)

    await expect(
      createAdminCaller().proposal.admin.create({
        ...PROPOSAL_INPUT,
        speakers: twenty,
      }),
    ).resolves.toBeTruthy()

    vi.clearAllMocks()
    mockReads()

    await expect(
      createAdminCaller().proposal.admin.create({
        ...PROPOSAL_INPUT,
        speakers: twenty,
        newSpeaker: { name: 'Nina Keynote', email: 'nina@example.com' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  /**
   * ATOMICITY, stated exactly. The two creates are one Sanity transaction, so a
   * failure is "nothing happened" — there is no second write for a speaker to
   * survive in. What is left behind on failure: nothing.
   */
  it('leaves no speaker behind when the write fails', async () => {
    mockTransaction.commit.mockRejectedValue(new Error('sanity is down'))

    await expect(
      createAdminCaller().proposal.admin.create({
        ...PROPOSAL_INPUT,
        newSpeaker: { name: 'Nina Keynote', email: 'nina@example.com' },
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })

    // The speaker was never written on its own, so there is nothing to strand.
    expect(clientWrite.create).not.toHaveBeenCalled()
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
    // And nobody is told about a talk that does not exist.
    expect(sendCoSpeakerAddedEmail).not.toHaveBeenCalled()
  })

  it('tells the person, as a SPEAKER and not a co-speaker', async () => {
    await createAdminCaller().proposal.admin.create({
      ...PROPOSAL_INPUT,
      newSpeaker: { name: 'Nina Keynote', email: 'nina@example.com' },
    })

    expect(sendCoSpeakerAddedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'nina@example.com',
        toName: 'Nina Keynote',
        proposalTitle: 'A keynote entered by an organizer',
        role: 'speaker',
      }),
    )
  })

  it('does not roll back the proposal when the email fails', async () => {
    vi.mocked(sendCoSpeakerAddedEmail).mockRejectedValue(new Error('smtp down'))

    const proposal = await createAdminCaller().proposal.admin.create({
      ...PROPOSAL_INPUT,
      newSpeaker: { name: 'Nina Keynote', email: 'nina@example.com' },
    })

    expect(proposal._id).toBeTruthy()
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
  })
})
