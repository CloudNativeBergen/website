/**
 * @vitest-environment node
 *
 * ORGANIZER INVITE BY EMAIL (platform#49) — the router.
 *
 * Three properties are worth more than the rest of this file, and each has a
 * test that fails on the ACTION SUCCEEDING rather than on an absence:
 *
 *  1. CROSS-ORG. An organizer of org B cannot invite into org A's conference,
 *     revoke A's invitation, or read A's list. Paired with a same-org success so
 *     the refusal cannot be coming from something unrelated.
 *  2. OWNERSHIP BEFORE EXPIRY. A stranger holding a forwarded token gets the
 *     ownership refusal and NO WRITE happens — they neither learn the invitation
 *     lapsed nor burn it. The paired invitee test shows the expiry branch does
 *     fire for the right person, so the ordering test is not passing vacuously.
 *  3. THE PROOF IS THE MAILBOX. Neither the token, nor an OAuth session on the
 *     same address, nor a matching display email is accepted — only a
 *     `providers[]` entry proving a magic link to the invited address was
 *     redeemed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import {
  getOrganizerInvitationById,
  getSpeakerProviders,
  getConferenceOrganizerIds,
  hasPendingOrganizerInvitation,
  isEmailAlreadyOrganizer,
} from '@/lib/organizer-invite/sanity'
import {
  createOrganizerInvitation,
  sendOrganizerInvitationEmail,
} from '@/lib/organizer-invite/server'
import { mintOrganizerInviteToken } from '@/lib/organizer-invite/token'

const ORG_A = 'org-test'
const ORG_B = 'org-other'
const CONF_A = 'conf-a'

const { mockPatchChain, mockTransaction } = vi.hoisted(() => {
  const mockPatchChain = {
    set: vi.fn().mockReturnThis(),
    setIfMissing: vi.fn().mockReturnThis(),
    append: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue({}),
  }
  const mockTransaction = {
    // The real `transaction.patch(id, fn)` INVOKES `fn` with a patch builder.
    // A bare `mockReturnThis()` would swallow the callback, and every assertion
    // about what the transaction actually writes would pass vacuously.
    patch: vi.fn(function (this: unknown, _id: string, fn?: unknown) {
      if (typeof fn === 'function') {
        ;(fn as (p: typeof mockPatchChain) => unknown)(mockPatchChain)
      }
      return this
    }),
    commit: vi.fn().mockResolvedValue({}),
  }
  return { mockPatchChain, mockTransaction }
})

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: vi.fn(() => mockPatchChain),
    transaction: vi.fn(() => mockTransaction),
    create: vi.fn().mockResolvedValue({ _id: 'inv-new' }),
    delete: vi.fn().mockResolvedValue({}),
  },
  clientReadUncached: { fetch: vi.fn() },
  clientRead: { fetch: vi.fn() },
}))
vi.mock('@/lib/organizer-invite/sanity')
vi.mock('@/lib/organizer-invite/server')
// `vi.mock` factories are hoisted above every import and const, so the ids are
// inlined here rather than referenced from the constants above.
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn().mockResolvedValue({
    conference: {
      _id: 'conf-a',
      title: 'Test Conf',
      organization: { _ref: 'org-test' },
    },
    domain: 'test.example',
  }),
}))

/**
 * The tenancy guard's document store. `requireDocumentInCurrentOrg` reads a
 * client-supplied id through `getDocumentTenant`, which is the ONLY thing
 * standing between a crafted id and `clientWrite.patch`.
 */
const documents = new Map<string, Record<string, unknown>>()

/**
 * The Sanity read client's `fetch` is typed with a dozen overloads that a plain
 * `vi.mocked(...)` cannot satisfy; the tests only ever need query + params, so
 * the mock is reached through one narrow alias rather than a cast at each site.
 */
const fetchMock = clientReadUncached.fetch as unknown as ReturnType<
  typeof vi.fn<
    (query: string, params?: Record<string, unknown>) => Promise<unknown>
  >
>

beforeEach(() => {
  vi.clearAllMocks()
  documents.clear()
  documents.set('inv-1', {
    _type: 'organizerInvitation',
    conferenceId: CONF_A,
    conferenceOrgId: ORG_A,
    orgId: null,
    memberOrgIds: [],
  })

  fetchMock.mockImplementation(async () => null)

  vi.mocked(isEmailAlreadyOrganizer).mockResolvedValue(false)
  vi.mocked(hasPendingOrganizerInvitation).mockResolvedValue(false)
  vi.mocked(getConferenceOrganizerIds).mockResolvedValue(['founder-1'])
  vi.mocked(sendOrganizerInvitationEmail).mockResolvedValue(true)
})

/** `getDocumentTenant` binds the id in params, so the mock dispatches on it. */
function wireDocumentTenant() {
  fetchMock.mockImplementation(async (query, params) => {
    if (!String(query).includes('"memberOrgIds"')) return null
    const doc = documents.get(params?.id as string)
    if (!doc) return null
    return {
      _type: doc._type,
      orgId: doc.orgId ?? null,
      conferenceId: doc.conferenceId ?? null,
      conferenceOrgId: doc.conferenceOrgId ?? null,
      memberOrgIds: doc.memberOrgIds ?? [],
    }
  })
}

const founder = {
  _id: 'founder-1',
  name: 'Hanna Sørensen',
  email: 'hanna@test.example',
  isOrganizer: true,
  organizerOrgIds: [ORG_A],
}

const foreignOrganizer = {
  _id: 'organizer-b',
  name: 'Bea Other',
  email: 'bea@other.example',
  // Deliberately TRUE: the deprecated global flag must not grant anything.
  isOrganizer: true,
  organizerOrgIds: [ORG_B],
}

const invitee = {
  _id: 'invitee-1',
  name: 'Ada Lovelace',
  // A DIFFERENT display address from the invited one, on purpose: the grant
  // must key on proven mailbox control, not on the display email.
  email: 'ada.personal@example.com',
  organizerOrgIds: [] as string[],
}

function callerFor(
  speaker: Record<string, unknown>,
  opts: { provider?: string } = {},
) {
  const ctx = {
    session: {
      user: { email: speaker.email },
      speaker,
      ...(opts.provider
        ? { account: { provider: opts.provider, type: 'oauth' } }
        : {}),
    },
    speaker,
    user: { email: speaker.email },
  }
  return appRouter.createCaller(ctx as never)
}

const INVITED = 'ada@example.com'

function pendingInvitation(overrides: Record<string, unknown> = {}) {
  const expiresAt = new Date(Date.now() + 86_400_000)
  const base = {
    _id: 'inv-1',
    invitedEmail: INVITED,
    invitedName: 'Ada Lovelace',
    status: 'pending' as const,
    expiresAt: expiresAt.toISOString(),
    conferenceId: CONF_A,
    invitedById: founder._id,
    invitedByName: founder.name,
    ...overrides,
  }
  return {
    ...base,
    token: mintOrganizerInviteToken({
      docId: base._id as string,
      invitedEmail: base.invitedEmail as string,
      expiresAt: new Date(base.expiresAt as string).getTime(),
    }),
  }
}

// ───────────────────────────────────────────────────────────── invite ────────

describe('organizerInvite.invite', () => {
  beforeEach(() => {
    vi.mocked(createOrganizerInvitation).mockImplementation(
      async ({ invitedEmail }) => ({
        _id: 'inv-new',
        invitedEmail: invitedEmail.trim().toLowerCase(),
        status: 'pending',
        token: 'the-secret-bearer-token',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        createdAt: new Date().toISOString(),
        conferenceId: CONF_A,
        invitedById: founder._id,
      }),
    )
  })

  it('CROSS-ORG: an organizer of another org cannot invite into this conference', async () => {
    await expect(
      callerFor(foreignOrganizer).organizerInvite.invite({
        email: 'mallory@example.com',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    // The action must not have happened — not merely "an error was thrown".
    expect(createOrganizerInvitation).not.toHaveBeenCalled()
    expect(sendOrganizerInvitationEmail).not.toHaveBeenCalled()
  })

  it('a same-org organizer succeeds (so the refusal above is the ORG check)', async () => {
    const result = await callerFor(founder).organizerInvite.invite({
      email: 'Ada@Example.com',
      name: 'Ada Lovelace',
    })
    expect(result.invitedEmail).toBe(INVITED)
    expect(createOrganizerInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        conferenceId: CONF_A,
        invitedBySpeakerId: founder._id,
        // As TYPED — canonicalization is the creator's job, so the mailbox the
        // token is mailed to is never a folded rewrite of what was entered.
        invitedEmail: 'Ada@Example.com',
      }),
    )
  })

  it('never returns the bearer token to the inviter (regression)', async () => {
    const result = await callerFor(founder).organizerInvite.invite({
      email: INVITED,
    })
    expect(result).not.toHaveProperty('token')
    expect(JSON.stringify(result)).not.toContain('the-secret-bearer-token')
  })

  it('refuses an address whose NFKC-folded form differs from what would be mailed', async () => {
    // `oﬃce@example.com` folds to `office@example.com`. Mailing one and granting
    // against the other would let a different mailbox claim the invitation.
    await expect(
      callerFor(founder).organizerInvite.invite({
        email: 'oﬃce@example.com',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(createOrganizerInvitation).not.toHaveBeenCalled()
  })

  it('refuses an implausible address', async () => {
    await expect(
      callerFor(founder).organizerInvite.invite({ email: 'not-an-address' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(createOrganizerInvitation).not.toHaveBeenCalled()
  })

  it('refuses the caller inviting themselves', async () => {
    await expect(
      callerFor(founder).organizerInvite.invite({
        email: 'HANNA@test.example',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(createOrganizerInvitation).not.toHaveBeenCalled()
  })

  it('refuses someone who already organizes this conference', async () => {
    vi.mocked(isEmailAlreadyOrganizer).mockResolvedValue(true)
    await expect(
      callerFor(founder).organizerInvite.invite({ email: INVITED }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(createOrganizerInvitation).not.toHaveBeenCalled()
  })

  it('refuses a duplicate live invitation for the same address', async () => {
    vi.mocked(hasPendingOrganizerInvitation).mockResolvedValue(true)
    await expect(
      callerFor(founder).organizerInvite.invite({ email: INVITED }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(createOrganizerInvitation).not.toHaveBeenCalled()
  })

  it('deletes the orphan when the invitation email cannot be sent', async () => {
    // A pending invitation nobody was told about occupies the duplicate slot and
    // shows as live in the admin list — worse than no invitation at all.
    vi.mocked(sendOrganizerInvitationEmail).mockResolvedValue(false)
    await expect(
      callerFor(founder).organizerInvite.invite({ email: INVITED }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    expect(clientWrite.delete).toHaveBeenCalledWith('inv-new')
  })

  it('requires a session at all', async () => {
    const anon = appRouter.createCaller({
      session: null,
      speaker: undefined,
      user: undefined,
    } as never)
    await expect(
      anon.organizerInvite.invite({ email: INVITED }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(createOrganizerInvitation).not.toHaveBeenCalled()
  })
})

// ───────────────────────────────────────────────────────────── revoke ────────

describe('organizerInvite.revoke', () => {
  beforeEach(() => {
    wireDocumentTenant()
    vi.mocked(getOrganizerInvitationById).mockResolvedValue(pendingInvitation())
  })

  it('revokes a pending invitation', async () => {
    const result = await callerFor(founder).organizerInvite.revoke({
      invitationId: 'inv-1',
    })
    expect(result).toEqual({ _id: 'inv-1', status: 'revoked' })
    expect(mockPatchChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'revoked' }),
    )
  })

  it('CROSS-ORG: an organizer of another org cannot revoke this org’s invitation', async () => {
    await expect(
      callerFor(foreignOrganizer).organizerInvite.revoke({
        invitationId: 'inv-1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(clientWrite.patch).not.toHaveBeenCalled()
  })

  it('TYPE CONFUSION: refuses an id that is not an organizerInvitation', async () => {
    // Sanity will patch ANY document in the shared dataset; without the type
    // guard this call would set `status: 'revoked'` on a review.
    documents.set('rev-1', {
      _type: 'review',
      conferenceId: CONF_A,
      conferenceOrgId: ORG_A,
    })
    await expect(
      callerFor(founder).organizerInvite.revoke({ invitationId: 'rev-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(clientWrite.patch).not.toHaveBeenCalled()
  })

  it('refuses an invitation belonging to another organization', async () => {
    documents.set('inv-foreign', {
      _type: 'organizerInvitation',
      conferenceId: 'conf-b',
      conferenceOrgId: ORG_B,
    })
    await expect(
      callerFor(founder).organizerInvite.revoke({
        invitationId: 'inv-foreign',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(clientWrite.patch).not.toHaveBeenCalled()
  })

  it('fails closed when the ownership probe cannot read the document', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))
    await expect(
      callerFor(founder).organizerInvite.revoke({ invitationId: 'inv-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(clientWrite.patch).not.toHaveBeenCalled()
  })

  it('refuses an invitation that is no longer pending', async () => {
    vi.mocked(getOrganizerInvitationById).mockResolvedValue(
      pendingInvitation({ status: 'accepted' }),
    )
    await expect(
      callerFor(founder).organizerInvite.revoke({ invitationId: 'inv-1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(clientWrite.patch).not.toHaveBeenCalled()
  })
})

// ───────────────────────────────────────────────────────────── accept ────────

/** The `providers[]` entry that proves a magic link to `INVITED` was redeemed. */
const PROOF = `email-link:${INVITED}`

describe('organizerInvite.accept', () => {
  it('grants the organizer role to the person who proved the mailbox', async () => {
    const invitation = pendingInvitation()
    vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)
    vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])

    const result = await callerFor(invitee, {
      provider: 'email-link',
    }).organizerInvite.accept({ token: invitation.token })

    expect(result).toEqual({ _id: 'inv-1', status: 'accepted' })
    // One transaction: the grant and the status change cannot diverge.
    expect(clientWrite.transaction).toHaveBeenCalledTimes(1)
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
    expect(mockTransaction.patch).toHaveBeenCalledWith(
      CONF_A,
      expect.any(Function),
    )
    expect(mockPatchChain.append).toHaveBeenCalledWith('organizers', [
      expect.objectContaining({ _type: 'reference', _ref: invitee._id }),
    ])
    // Sanity array items must carry a `_key`.
    const appended = mockPatchChain.append.mock.calls[0][1][0]
    expect(appended._key).toEqual(expect.any(String))
    expect(appended._key.length).toBeGreaterThan(0)
  })

  it('NEVER writes to the speaker document (the #49 identity invariant)', async () => {
    // "Accepting an invite must never become a new way to attach to, or write
    // identity fields on, an existing speaker document." The only two ids this
    // mutation may touch are the conference and the invitation.
    const invitation = pendingInvitation()
    vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)
    vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])

    await callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept(
      { token: invitation.token },
    )

    const touched = [
      ...vi.mocked(clientWrite.patch).mock.calls.map(([id]) => id),
      ...mockTransaction.patch.mock.calls.map(([id]) => id),
    ]
    expect(touched).not.toContain(invitee._id)
    expect(new Set(touched)).toEqual(new Set([CONF_A, 'inv-1']))
    expect(clientWrite.create).not.toHaveBeenCalled()
    expect(clientWrite.delete).not.toHaveBeenCalled()
  })

  it('appends rather than replaces, so `organizers[]` can never be emptied here', async () => {
    const invitation = pendingInvitation()
    vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)
    vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])

    await callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept(
      { token: invitation.token },
    )
    // A full-array `set` on organizers would be the only way to drop a sitting
    // organizer or breach the schema's min(1). There is none.
    const setCalls = mockPatchChain.set.mock.calls.map(([arg]) => arg)
    expect(
      setCalls.filter(
        (arg) => arg && typeof arg === 'object' && 'organizers' in arg,
      ),
    ).toEqual([])
  })

  it('is idempotent for someone who already organizes the conference', async () => {
    const invitation = pendingInvitation()
    vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)
    vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])
    vi.mocked(getConferenceOrganizerIds).mockResolvedValue([
      'founder-1',
      invitee._id,
    ])

    await callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept(
      { token: invitation.token },
    )
    expect(mockPatchChain.append).not.toHaveBeenCalled()
    // The invitation is still closed out, so the link cannot be reused.
    expect(mockTransaction.patch).toHaveBeenCalledWith(
      'inv-1',
      expect.any(Function),
    )
  })

  describe('the ownership proof', () => {
    it('REFUSES a bearer of the token who cannot prove the mailbox', async () => {
      const invitation = pendingInvitation()
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)
      // A perfectly valid token, a real session — and no proof of the address.
      vi.mocked(getSpeakerProviders).mockResolvedValue([
        'email-link:someone.else@example.com',
      ])

      await expect(
        callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept({
          token: invitation.token,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(clientWrite.transaction).not.toHaveBeenCalled()
      expect(clientWrite.patch).not.toHaveBeenCalled()
    })

    it('REFUSES an OAuth session even when the address is the invited one', async () => {
      // v1 accepts email-link sessions only (platform#49 phase 3 defers this,
      // gated on #808): the OAuth path matches addresses through the wider,
      // more weakly written `knownEmails` set.
      const invitation = pendingInvitation()
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)
      vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])

      await expect(
        callerFor(
          { ...invitee, email: INVITED },
          {
            provider: 'github',
          },
        ).organizerInvite.accept({ token: invitation.token }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(clientWrite.transaction).not.toHaveBeenCalled()
      // The proof is never even consulted — the session kind decides first.
      expect(getSpeakerProviders).not.toHaveBeenCalled()
    })

    it('REFUSES a session with no account at all', async () => {
      const invitation = pendingInvitation()
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)
      vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])

      await expect(
        callerFor(invitee).organizerInvite.accept({ token: invitation.token }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('FAILS CLOSED when the providers probe cannot be read', async () => {
      const invitation = pendingInvitation()
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)
      vi.mocked(getSpeakerProviders).mockResolvedValue(null)

      await expect(
        callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept({
          token: invitation.token,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('gives every ownership refusal the SAME message, so none is an oracle', async () => {
      const invitation = pendingInvitation()
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)

      const messages: string[] = []
      for (const [providers, provider] of [
        [['email-link:other@example.com'], 'email-link'],
        [null, 'email-link'],
        [[PROOF], 'github'],
      ] as const) {
        vi.mocked(getSpeakerProviders).mockResolvedValue(
          providers as string[] | null,
        )
        await callerFor(invitee, { provider })
          .organizerInvite.accept({ token: invitation.token })
          .catch((e) => messages.push(String(e.message)))
      }
      expect(messages).toHaveLength(3)
      expect(new Set(messages).size).toBe(1)
    })
  })

  describe('the ownership/expiry ORDER', () => {
    it('a non-invitee gets the ownership refusal and triggers NO expiry write', async () => {
      // THE ORDERING TEST. If expiry were checked first, a stranger holding a
      // forwarded token would (a) learn the invitation exists and has lapsed,
      // from a different error, and (b) burn it by triggering the expired write.
      const expired = pendingInvitation({
        expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      })
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(expired)
      vi.mocked(getSpeakerProviders).mockResolvedValue([
        'email-link:someone.else@example.com',
      ])

      await expect(
        callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept({
          token: expired.token,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(clientWrite.patch).not.toHaveBeenCalled()
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('the INVITEE does reach the expiry branch (the test above is not vacuous)', async () => {
      const expired = pendingInvitation({
        expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      })
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(expired)
      vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])

      await expect(
        callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept({
          token: expired.token,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(clientWrite.patch).toHaveBeenCalledWith('inv-1')
      expect(mockPatchChain.set).toHaveBeenCalledWith({ status: 'expired' })
      // Expiry never grants.
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })
  })

  describe('the token', () => {
    it('GUARD BEFORE FETCH: a forged token never reaches Sanity', async () => {
      await expect(
        callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept({
          token: 'ZmFrZQ.ZmFrZQ',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(getOrganizerInvitationById).not.toHaveBeenCalled()
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('refuses a signed token whose stored counterpart no longer matches', async () => {
      // Rotation / revocation-by-token: the payload verifies but the document
      // holds a different string.
      const invitation = pendingInvitation()
      vi.mocked(getOrganizerInvitationById).mockResolvedValue({
        ...invitation,
        token: 'a-different-token-of-the-same-length'.padEnd(
          invitation.token.length,
          'x',
        ),
      })
      vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])

      await expect(
        callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept({
          token: invitation.token,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('CROSS-TENANT: a token for another tenant’s invitation does not resolve here', async () => {
      // The lookup is conference-scoped on the SERVER-RESOLVED conference, so an
      // invitation minted for another tenant is simply absent — and the refusal
      // is the same NOT_FOUND as a bad token, revealing nothing.
      const invitation = pendingInvitation()
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(null)
      vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])

      await expect(
        callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept({
          token: invitation.token,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(getOrganizerInvitationById).toHaveBeenCalledWith(CONF_A, 'inv-1')
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('refuses a revoked invitation', async () => {
      const invitation = pendingInvitation({ status: 'revoked' })
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)
      vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])

      await expect(
        callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept({
          token: invitation.token,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('refuses an already-accepted invitation (no replay)', async () => {
      const invitation = pendingInvitation({ status: 'accepted' })
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(invitation)
      vi.mocked(getSpeakerProviders).mockResolvedValue([PROOF])

      await expect(
        callerFor(invitee, { provider: 'email-link' }).organizerInvite.accept({
          token: invitation.token,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })
  })

  it('requires a session', async () => {
    const invitation = pendingInvitation()
    const anon = appRouter.createCaller({
      session: null,
      speaker: undefined,
      user: undefined,
    } as never)
    await expect(
      anon.organizerInvite.accept({ token: invitation.token }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(getOrganizerInvitationById).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────── list ────────

describe('organizerInvite.list', () => {
  it('CROSS-ORG: an organizer of another org cannot read this conference’s invitations', async () => {
    await expect(
      callerFor(foreignOrganizer).organizerInvite.list(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
