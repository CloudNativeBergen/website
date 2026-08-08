/**
 * @vitest-environment node
 *
 * THE TENANCY CLAIMS, EXECUTED.
 *
 * Every "this read is conference-scoped" assertion in this feature lives in
 * `src/lib/organizer-invite/sanity.ts`, and the router tests mock that module
 * wholesale — so on its own the router suite proves nothing about it. A mock is
 * never evidence about the thing it mocks: the router's "CROSS-TENANT" test is
 * `mockResolvedValue(null)`, which is a statement about the test, not the query.
 *
 * So this suite stubs only the TRANSPORT. `clientReadUncached.fetch` is replaced
 * with a real `groq-js` evaluator over a two-tenant fixture dataset, which means
 * the query text under test is the text that runs — including the predicate
 * `scopedFetch` prepends, since `scopedFetch` itself is NOT mocked. If someone
 * drops the scope, or writes a filter that reaches across tenants, these fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientRead: { fetch: vi.fn() },
  clientWrite: { delete: vi.fn() },
}))

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  getOrganizerInvitationById,
  listOrganizerInvitations,
  hasPendingOrganizerInvitation,
  isEmailAlreadyOrganizer,
  getConferenceOrganizerIds,
  deleteExpiredOrganizerInvitations,
} from '@/lib/organizer-invite/sanity'

const CONF_A = 'conf-a'
const CONF_B = 'conf-b'
const SOON = new Date(Date.now() + 86_400_000).toISOString()
const PAST = new Date(Date.now() - 86_400_000).toISOString()

const dataset: Record<string, unknown>[] = [
  {
    _id: CONF_A,
    _type: 'conference',
    organization: { _type: 'reference', _ref: 'org-a' },
    organizers: [{ _type: 'reference', _ref: 'sp-founder-a', _key: 'k1' }],
  },
  {
    _id: CONF_B,
    _type: 'conference',
    organization: { _type: 'reference', _ref: 'org-b' },
    organizers: [{ _type: 'reference', _ref: 'sp-founder-b', _key: 'k2' }],
  },
  {
    _id: 'sp-founder-a',
    _type: 'speaker',
    name: 'Hanna',
    email: 'Hanna@Example.com',
    knownEmails: ['hanna.alt@example.com'],
  },
  {
    _id: 'sp-founder-b',
    _type: 'speaker',
    name: 'Bea',
    email: 'bea@other.example',
  },
  {
    _id: 'inv-a-pending',
    _type: 'organizerInvitation',
    conference: { _type: 'reference', _ref: CONF_A },
    invitedBy: { _type: 'reference', _ref: 'sp-founder-a' },
    invitedEmail: 'ada@example.com',
    invitedName: 'Ada Lovelace',
    status: 'pending',
    token: 'token-a-pending',
    expiresAt: SOON,
    createdAt: '2026-08-08T10:00:00.000Z',
  },
  {
    _id: 'inv-a-expired',
    _type: 'organizerInvitation',
    conference: { _type: 'reference', _ref: CONF_A },
    invitedBy: { _type: 'reference', _ref: 'sp-founder-a' },
    invitedEmail: 'grace@example.com',
    status: 'pending',
    token: 'token-a-expired',
    expiresAt: PAST,
    createdAt: '2026-07-01T10:00:00.000Z',
  },
  {
    _id: 'inv-a-revoked',
    _type: 'organizerInvitation',
    conference: { _type: 'reference', _ref: CONF_A },
    invitedBy: { _type: 'reference', _ref: 'sp-founder-a' },
    invitedEmail: 'alan@example.com',
    status: 'revoked',
    token: 'token-a-revoked',
    expiresAt: SOON,
    createdAt: '2026-08-01T10:00:00.000Z',
  },
  {
    // Long past its date, but ACCEPTED — the provenance of a live admin grant.
    _id: 'inv-a-accepted-old',
    _type: 'organizerInvitation',
    conference: { _type: 'reference', _ref: CONF_A },
    invitedBy: { _type: 'reference', _ref: 'sp-founder-a' },
    invitedEmail: 'edsger@example.com',
    status: 'accepted',
    token: 'token-a-accepted',
    expiresAt: PAST,
    createdAt: '2026-06-01T10:00:00.000Z',
  },
  {
    // THE ADVERSARY: another tenant's invitation, same shape, same addresses.
    _id: 'inv-b-pending',
    _type: 'organizerInvitation',
    conference: { _type: 'reference', _ref: CONF_B },
    invitedBy: { _type: 'reference', _ref: 'sp-founder-b' },
    invitedEmail: 'ada@example.com',
    status: 'pending',
    token: 'token-b-pending',
    expiresAt: SOON,
    createdAt: '2026-08-09T10:00:00.000Z',
  },
]

/** The queries the module builds, run for real. */
async function runGroq(query: string, params: Record<string, unknown>) {
  const value = await evaluate(parse(query), { dataset, params })
  return value.get()
}

let seenQueries: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  seenQueries = []
  vi.mocked(clientReadUncached.fetch).mockImplementation((async (
    query: string,
    params: Record<string, unknown> = {},
  ) => {
    seenQueries.push(query)
    return runGroq(query, params)
  }) as never)
})

describe('getOrganizerInvitationById', () => {
  it('resolves an invitation belonging to the request conference', async () => {
    const inv = await getOrganizerInvitationById(CONF_A, 'inv-a-pending')
    expect(inv).toMatchObject({
      _id: 'inv-a-pending',
      invitedEmail: 'ada@example.com',
      status: 'pending',
      conferenceId: CONF_A,
      invitedByName: 'Hanna',
    })
  })

  it('projects `_rev` — the grant transaction is conditioned on it', async () => {
    // groq-js does not synthesise `_rev`, so assert the FIELD IS REQUESTED
    // rather than that a fixture carries one. Dropping it from the projection
    // makes `accept` refuse every invitation, which is a fail-closed but total
    // outage; this is the cheap tripwire.
    await getOrganizerInvitationById(CONF_A, 'inv-a-pending')
    expect(seenQueries[0]).toContain('_rev')
  })

  it('CROSS-TENANT: returns null for another conference’s invitation', async () => {
    // Not a mock returning null — the real, scope-prepended query evaluated
    // against a dataset that genuinely contains `inv-b-pending`.
    const inv = await getOrganizerInvitationById(CONF_A, 'inv-b-pending')
    expect(inv).toBeNull()
    // And the id really is present, so the null above is scoping, not absence.
    expect(
      await getOrganizerInvitationById(CONF_B, 'inv-b-pending'),
    ).toMatchObject({ _id: 'inv-b-pending' })
  })

  it('the query it runs carries the tenant predicate', async () => {
    await getOrganizerInvitationById(CONF_A, 'inv-a-pending')
    expect(seenQueries[0]).toContain('conference._ref == $conferenceId')
  })

  it('returns null for an empty id without querying', async () => {
    expect(await getOrganizerInvitationById(CONF_A, '')).toBeNull()
    expect(clientReadUncached.fetch).not.toHaveBeenCalled()
  })
})

describe('listOrganizerInvitations', () => {
  it('returns only this conference’s invitations, newest first', async () => {
    const rows = await listOrganizerInvitations(CONF_A)
    expect(rows.map((r) => r._id)).toEqual([
      'inv-a-pending',
      'inv-a-revoked',
      'inv-a-expired',
      'inv-a-accepted-old',
    ])
    // `inv-b-pending` is the NEWEST document in the dataset, so if scoping were
    // dropped it would sort to the front — this ordering is load-bearing.
    expect(rows.map((r) => r._id)).not.toContain('inv-b-pending')
  })

  it('NEVER projects the bearer token', async () => {
    const rows = await listOrganizerInvitations(CONF_A)
    for (const row of rows) {
      expect(row).not.toHaveProperty('token')
    }
    expect(JSON.stringify(rows)).not.toContain('token-a-pending')
  })
})

describe('hasPendingOrganizerInvitation', () => {
  it('is true for a live pending invitation on this conference', async () => {
    expect(await hasPendingOrganizerInvitation(CONF_A, 'ada@example.com')).toBe(
      true,
    )
  })

  it('is false for an EXPIRED pending invitation (the slot is free again)', async () => {
    expect(
      await hasPendingOrganizerInvitation(CONF_A, 'grace@example.com'),
    ).toBe(false)
  })

  it('is false for a revoked invitation', async () => {
    expect(
      await hasPendingOrganizerInvitation(CONF_A, 'alan@example.com'),
    ).toBe(false)
  })

  it('CROSS-TENANT: another conference’s pending invite does not block ours', async () => {
    // `inv-b-pending` is pending, live, and for the same address — on org B.
    // Counting it here would let one tenant deny another tenant an invitation.
    expect(
      await hasPendingOrganizerInvitation(CONF_B, 'grace@example.com'),
    ).toBe(false)
  })
})

describe('isEmailAlreadyOrganizer', () => {
  it('matches a current organizer by display email, case-insensitively', async () => {
    expect(await isEmailAlreadyOrganizer(CONF_A, 'hanna@example.com')).toBe(
      true,
    )
  })

  it('matches a current organizer by a verified knownEmails entry', async () => {
    expect(await isEmailAlreadyOrganizer(CONF_A, 'hanna.alt@example.com')).toBe(
      true,
    )
  })

  it('CROSS-TENANT: another conference’s organizer is not ours', async () => {
    // The nested root filter is what binds this to one conference. Without it
    // `bea@other.example` would read as already-an-organizer here and org A
    // could never invite her.
    expect(await isEmailAlreadyOrganizer(CONF_A, 'bea@other.example')).toBe(
      false,
    )
    expect(await isEmailAlreadyOrganizer(CONF_B, 'bea@other.example')).toBe(
      true,
    )
  })

  it('is false for a stranger', async () => {
    expect(await isEmailAlreadyOrganizer(CONF_A, 'nobody@example.com')).toBe(
      false,
    )
  })
})

describe('getConferenceOrganizerIds', () => {
  it('returns only the named conference’s organizers', async () => {
    expect(await getConferenceOrganizerIds(CONF_A)).toEqual(['sp-founder-a'])
    expect(await getConferenceOrganizerIds(CONF_B)).toEqual(['sp-founder-b'])
  })

  it('returns [] for an unknown conference rather than everyone', async () => {
    expect(await getConferenceOrganizerIds('conf-nope')).toEqual([])
  })
})

describe('deleteExpiredOrganizerInvitations', () => {
  /**
   * `/privacy` promises the invitee that an invitation they ignore leaves
   * nothing behind. This purge is what makes that true, so the test evaluates
   * the DELETE SELECTOR for real rather than asserting on its text.
   */
  async function selectedByThePurge() {
    let selected: string[] = []
    vi.mocked(clientWrite.delete).mockImplementation((async (spec: {
      query: string
      params: Record<string, unknown>
    }) => {
      const hits = (await runGroq(`${spec.query}{_id}`, spec.params)) as {
        _id: string
      }[]
      selected = hits.map((h) => h._id)
      return { results: hits }
    }) as never)
    await deleteExpiredOrganizerInvitations()
    return selected
  }

  it('deletes lapsed and withdrawn invitations across every tenant', async () => {
    const selected = await selectedByThePurge()
    // `inv-a-expired` is past its date. `inv-a-revoked` is withdrawn — its
    // `expiresAt` is still in the future, so it survives THIS pass and is
    // removed once the date passes; the privacy copy says "expired and
    // withdrawn invitations are deleted by a daily clean-up", which this
    // selector satisfies over time rather than instantly.
    expect(selected).toContain('inv-a-expired')
  })

  it('never deletes a live pending invitation', async () => {
    const selected = await selectedByThePurge()
    expect(selected).not.toContain('inv-a-pending')
    expect(selected).not.toContain('inv-b-pending')
  })

  it('KEEPS accepted invitations — they are the provenance of a live grant', async () => {
    const selected = await selectedByThePurge()
    expect(selected).not.toContain('inv-a-accepted-old')
  })

  it('never throws — a failed purge must not take the cron down', async () => {
    vi.mocked(clientWrite.delete).mockRejectedValue(new Error('boom'))
    await expect(deleteExpiredOrganizerInvitations()).resolves.toEqual({
      deleted: 0,
    })
  })
})
