/**
 * @vitest-environment node
 *
 * ORGANIZER-LINKED TICKET ADDRESSES — `speaker.admin.addTicketEmail` and its
 * revocation.
 *
 * A speaker who bought their ticket under an address we do not hold reads "Not
 * claimed" forever, because the claim status is a join on ADDRESSES. An
 * organizer can now link the address off the ticket, and the owner decision is
 * that the address becomes a FULL SIGN-IN IDENTITY: it joins `knownEmails`, on
 * the reasoning that an attendee registers under an address they control
 * because that is where the ticket is delivered.
 *
 * That makes this an identity-granting write, so what this file pins is the
 * four controls that make it defensible:
 *
 *  1. The address must be ATTESTED BY A TICKET for this event. An organizer
 *     cannot hand it an address of their own choosing.
 *  2. A CROSS-SPEAKER COLLISION is refused — the security-critical guard, since
 *     granting a second person's address merges two sign-in identities.
 *  3. An address whose NFKC form differs from itself is refused, the same rule
 *     email sign-in applies: the stored identity must be the mailbox the ticket
 *     reached.
 *  4. Removal REVOKES: the address leaves `knownEmails`, so the login-side
 *     lookup stops resolving this speaker.
 */

const h = vi.hoisted(() => ({
  patch: vi.fn(),
  set: vi.fn(),
  commit: vi.fn(),
  grantState: vi.fn(),
  findExisting: vi.fn(),
  candidates: vi.fn(),
  read: vi.fn(),
  redeemed: vi.fn(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: (...args: unknown[]) => {
      h.patch(...args)
      return {
        set: (patchObject: unknown) => {
          h.set(patchObject)
          return { commit: h.commit }
        },
      }
    },
  },
  clientReadUncached: { fetch: (...args: unknown[]) => h.read(...args) },
  clientReadCached: { fetch: vi.fn() },
}))

vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-A',
      title: 'Cloud Native Day 2026',
      organization: { _type: 'reference', _ref: 'org-A' },
    },
    domain: 'a.test',
    error: null,
    status: 'resolved',
  }),
}))

vi.mock('@/lib/organization/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOrganizationById: async () => ({ _id: 'org-A', plan: 'pro' }),
  getOrganizationRefForCurrentConference: async () => 'org-A',
}))

vi.mock('@/lib/speaker/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSpeakerTicketGrantState: h.grantState,
  findSpeakerByEmailForOrganizerCreate: h.findExisting,
}))

vi.mock('@/lib/tickets/speakerStatus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchEventTicketCandidates: h.candidates,
  fetchRedeemedSpeakerEmails: h.redeemed,
}))

/**
 * Ownership is pinned against a real dataset in `tenancy.writes.test.ts`. Here
 * it GRANTS, so a refusal below can only come from the guard under test — not
 * from an ownership check refusing with a similar shape.
 */
vi.mock('@/server/tenancy', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireSpeakerInCurrentOrg: vi.fn(async () => 'org-A'),
  requireCurrentOrgId: vi.fn(async () => 'org-A'),
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { speakerRouter } from './speaker'

const TICKET = {
  ticketId: 9001,
  name: 'Ada Lovelace',
  email: 'ada@work.example',
  registeredEmail: 'Ada@Work.Example',
  category: 'Speaker ticket',
}

function makeCaller() {
  const speaker = {
    _id: 'admin-1',
    name: 'Olav Organizer',
    isOrganizer: true,
    organizerOrgIds: ['org-A'],
  }
  return speakerRouter.createCaller({
    session: { speaker, user: { name: 'Olav Organizer' } },
    speaker,
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  h.grantState.mockResolvedValue({
    email: 'ada@home.example',
    knownEmails: ['ada@home.example'],
    grants: [],
  })
  h.findExisting.mockResolvedValue(null)
  h.candidates.mockResolvedValue([TICKET])
  h.commit.mockResolvedValue({})
})

describe('speaker.admin.addTicketEmail', () => {
  it('adds the address to knownEmails and records its provenance', async () => {
    const { grants } = await makeCaller().admin.addTicketEmail({
      id: 'speaker-1',
      email: 'Ada@Work.Example',
    })

    expect(h.patch).toHaveBeenCalledWith('speaker-1')
    const [patchObject] = h.set.mock.calls[0] as [Record<string, unknown>]
    expect(patchObject.knownEmails).toEqual([
      'ada@home.example',
      'ada@work.example',
    ])

    // The trail: who, when, and off which ticket. `registeredEmail` and
    // `ticketId` come from the provider record, never from the request.
    expect(grants).toHaveLength(1)
    expect(grants[0]).toMatchObject({
      email: 'ada@work.example',
      registeredEmail: 'Ada@Work.Example',
      ticketId: 9001,
      addedBy: 'admin-1',
      addedByName: 'Olav Organizer',
    })
    expect(grants[0].addedAt).toEqual(expect.any(String))
    // Identity and trail are written in ONE patch — a match-set entry with no
    // trail is the untraceable case this design exists to avoid.
    expect(patchObject.ticketEmailGrants).toEqual(grants)
  })

  /**
   * CONTROL 1. The organizer picks a ticket; they do not type an address. An
   * address with no ticket behind it is refused, so this cannot mint an
   * identity for an address the organizer happens to control.
   */
  it('refuses an address no ticket for this event was registered with', async () => {
    await expect(
      makeCaller().admin.addTicketEmail({
        id: 'speaker-1',
        email: 'attacker@evil.example',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('No ticket for this event'),
    })
    expect(h.patch).not.toHaveBeenCalled()
  })

  it('fails closed when the ticket list cannot be read', async () => {
    h.candidates.mockResolvedValue(null)
    await expect(
      makeCaller().admin.addTicketEmail({
        id: 'speaker-1',
        email: 'ada@work.example',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.patch).not.toHaveBeenCalled()
  })

  /**
   * CONTROL 2 — THE SECURITY-CRITICAL GUARD. Granting an address that already
   * signs somebody else in would merge two people's accounts. Asserted on the
   * MESSAGE, so it cannot pass on an unrelated refusal that shares a code.
   */
  it('refuses an address another account already signs in with', async () => {
    h.findExisting.mockResolvedValue({
      inCurrentOrg: true,
      name: 'Grace Hopper',
    })

    await expect(
      makeCaller().admin.addTicketEmail({
        id: 'speaker-1',
        email: 'ada@work.example',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        "Grace Hopper already signs in with ada@work.example. Linking it here would merge two people's accounts.",
    })

    // GUARD BEFORE WRITE.
    expect(h.patch).not.toHaveBeenCalled()
    expect(h.commit).not.toHaveBeenCalled()
  })

  it('refuses a collision at another tenant without naming anyone', async () => {
    h.findExisting.mockResolvedValue({ inCurrentOrg: false })
    await expect(
      makeCaller().admin.addTicketEmail({
        id: 'speaker-1',
        email: 'ada@work.example',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('Another account already signs in'),
    })
    expect(h.patch).not.toHaveBeenCalled()
  })

  it('fails closed when the collision probe cannot be read', async () => {
    h.findExisting.mockRejectedValue(new Error('sanity down'))
    await expect(
      makeCaller().admin.addTicketEmail({
        id: 'speaker-1',
        email: 'ada@work.example',
      }),
    ).rejects.toThrow()
    expect(h.patch).not.toHaveBeenCalled()
  })

  /**
   * CONTROL 3. `normalizeEmail` NFKC-folds; `canonicalEmail` does not. An
   * address where the two differ would be STORED in its folded form while the
   * ticket went to the unfolded mailbox — an identity nobody can use, granted
   * off an attestation that does not cover it.
   */
  it('refuses an address whose NFKC form differs from itself', async () => {
    // U+FB03 LATIN SMALL LIGATURE FFI folds to "ffi".
    const ligature = 'oﬃce@work.example'
    h.candidates.mockResolvedValue([
      { ...TICKET, email: 'office@work.example', registeredEmail: ligature },
    ])
    await expect(
      makeCaller().admin.addTicketEmail({ id: 'speaker-1', email: ligature }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('normalized form differs'),
    })
    expect(h.patch).not.toHaveBeenCalled()
  })

  it('is idempotent for an address the speaker already holds', async () => {
    h.grantState.mockResolvedValue({
      email: 'ada@home.example',
      knownEmails: ['ada@home.example', 'ada@work.example'],
      grants: [{ _key: 'k1', email: 'ada@work.example' }],
    })
    const { grants } = await makeCaller().admin.addTicketEmail({
      id: 'speaker-1',
      email: 'ada@work.example',
    })
    expect(grants).toHaveLength(1)
    expect(h.patch).not.toHaveBeenCalled()
    // And it never reaches the collision probe, which would otherwise report
    // the speaker as colliding with themselves.
    expect(h.findExisting).not.toHaveBeenCalled()
  })
})

describe('speaker.admin.removeTicketEmail', () => {
  beforeEach(() => {
    h.grantState.mockResolvedValue({
      email: 'ada@home.example',
      knownEmails: ['ada@home.example', 'ada@work.example'],
      grants: [
        { _key: 'k1', email: 'ada@work.example', ticketId: 9001 },
        { _key: 'k2', email: 'ada@other.example' },
      ],
    })
  })

  it('REVOKES: the address leaves knownEmails and the grant list', async () => {
    const { grants } = await makeCaller().admin.removeTicketEmail({
      id: 'speaker-1',
      email: 'Ada@Work.Example',
    })
    const [patchObject] = h.set.mock.calls[0] as [Record<string, unknown>]
    expect(patchObject.knownEmails).toEqual(['ada@home.example'])
    expect(grants.map((grant) => grant.email)).toEqual(['ada@other.example'])
  })

  /**
   * Without this check the endpoint would strip a LOGIN-VERIFIED address out of
   * somebody's match-set — locking a person out of their own account through an
   * endpoint whose job is undoing an organizer's mistake.
   */
  it('refuses to remove an address that was never granted from a ticket', async () => {
    await expect(
      makeCaller().admin.removeTicketEmail({
        id: 'speaker-1',
        email: 'ada@home.example',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('was not granted from a ticket'),
    })
    expect(h.patch).not.toHaveBeenCalled()
  })
})
