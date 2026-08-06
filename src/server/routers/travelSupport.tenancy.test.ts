/**
 * @vitest-environment node
 *
 * CROSS-TENANT READ ISOLATION for travel support (#863, HIGH).
 *
 * `travelSupport.admin.getById` was a plain `adminProcedure` with no tenancy
 * guard while its SIX siblings in the same router all call
 * `authorizeTravelSupportOperation`. `adminProcedure` proves only that the
 * caller organizes SOME org, so an organizer of tenant A could hand us tenant
 * B's document id and receive that speaker's name, email, IBAN, SWIFT code and
 * full expense history — the most sensitive data in the system, and present on
 * all six production records.
 *
 * The org-scoped decision itself already had tests
 * (`src/lib/travel-support/auth.orgscope.test.ts`, B3/#642). What was missing was
 * anything asserting that THIS PROCEDURE reaches it. These cases run the REAL
 * guard and the REAL `isOrganizerForOrg` — only the data layer is mocked — so
 * removing the guard from the router makes them fail on the CALL SUCCEEDING and
 * on the returned banking VALUES, not on a changed error message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  getTravelSupportById: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))

// The whole data layer of the router is mocked; `@/lib/travel-support/auth` is
// NOT — it is the subject. `auth.ts` reads through this same module, so the one
// mock covers the guard's own lookup too, which is what lets the call-count
// assertion below distinguish "the guard fetched it" from "the handler did".
vi.mock('@/lib/travel-support/sanity', () => ({
  getTravelSupport: vi.fn(),
  getTravelSupportById: h.getTravelSupportById,
  getAllTravelSupport: vi.fn(),
  createTravelSupport: vi.fn(),
  updateBankingDetails: vi.fn(),
  submitTravelSupport: vi.fn(),
  updateTravelSupportStatus: vi.fn(),
  addTravelExpense: vi.fn(),
  updateTravelExpense: vi.fn(),
  updateExpenseStatus: vi.fn(),
  deleteTravelExpense: vi.fn(),
  deleteReceipt: vi.fn(),
  getSpeakersRequiringTravelSupport: vi.fn(),
  getTravelExpenseById: vi.fn(),
  getTravelExpenseRef: vi.fn(),
}))
vi.mock('@/lib/speaker/sanity', () => ({ getSpeaker: vi.fn() }))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn(),
  getOrganizerSpeakerIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/teams', () => ({
  resolveRoutedOrganizerIds: vi.fn().mockResolvedValue([]),
}))

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { travelSupportRouter } from './travelSupport'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'

/** Fake, but shaped like the real thing — this is what an unguarded read shipped. */
const FOREIGN_IBAN = 'NO9386011117947'
const FOREIGN_SWIFT = 'DNBANOKKXXX'

function ctx(): Context {
  const speaker = {
    _id: 'sp-admin-A',
    name: 'Admin A',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
  }
  const user = { email: 'a@example.com', name: 'Admin A', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const travelSupport = () => t.createCallerFactory(travelSupportRouter)(ctx())

/**
 * A complete travel-support record, banking details and all, owned by
 * `conferenceOrgId`. Nothing about it EXCEPT its org can make the read refuse:
 * it exists, it is submitted, it has a speaker and a conference. So a refusal
 * here is the ownership guard's and nothing else's.
 */
function record(conferenceOrgId: string, conferenceId: string) {
  return {
    _id: 'ts-1',
    status: 'submitted',
    speaker: {
      _id: 'sp-speaker',
      name: 'Foreign Speaker',
      email: 'speaker@other.test',
    },
    conference: { _id: conferenceId, name: 'Their Conference' },
    conferenceOrgId,
    bankingDetails: {
      beneficiaryName: 'Foreign Speaker',
      bankName: 'Their Bank',
      iban: FOREIGN_IBAN,
      accountNumber: '12345678903',
      swiftCode: FOREIGN_SWIFT,
      country: 'NO',
      preferredCurrency: 'NOK',
    },
    expenses: [
      {
        _id: 'exp-1',
        description: 'Flight',
        amount: 4200,
        currency: 'NOK',
        status: 'pending',
      },
    ],
  }
}

/** Resolve a call to either arm so the assertion can name what came back. */
async function settle<T>(
  promise: Promise<T>,
): Promise<{ value?: T; error?: unknown }> {
  try {
    return { value: await promise }
  } catch (error) {
    return { error }
  }
}

const getById = () => travelSupport().admin.getById({ id: 'ts-1' })

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: { _id: CONF_A, organization: { _ref: ORG_A } },
    domain: 'localhost',
    error: null,
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('travelSupport.admin.getById is org-scoped (#863)', () => {
  const DENIED = 'Access denied to this travel support request'

  it('refuses another tenant’s request and returns no banking details', async () => {
    h.getTravelSupportById.mockResolvedValue({
      travelSupport: record('org-B', 'conf-B'),
      error: null,
    })

    const outcome = await settle(getById())

    // Unguarded, `value` IS the foreign document — so this line fails on the
    // call succeeding, and prints the IBAN it handed over.
    expect(outcome.value).toBeUndefined()
    expect(outcome.error).toMatchObject({ code: 'FORBIDDEN', message: DENIED })
    expect(JSON.stringify(outcome.value ?? null)).not.toContain(FOREIGN_IBAN)
    expect(JSON.stringify(outcome.value ?? null)).not.toContain(FOREIGN_SWIFT)
  })

  it('refuses when the request’s conference resolves to no org at all', async () => {
    // FAIL CLOSED. An unresolvable domain must not read as "organizer of
    // everything" — the authz waist denies before the handler runs.
    h.getConference.mockResolvedValue({
      conference: null,
      domain: 'localhost',
      error: new Error('domain lookup failed'),
    })
    h.getTravelSupportById.mockResolvedValue({
      travelSupport: record(ORG_A, CONF_A),
      error: null,
    })

    const outcome = await settle(getById())

    expect(outcome.value).toBeUndefined()
    expect(outcome.error).toMatchObject({ code: 'FORBIDDEN' })
    expect(h.getTravelSupportById).not.toHaveBeenCalled()
  })

  it('refuses a document with NO resolvable owner', async () => {
    // A pre-044-backfill conference carries no `organization._ref`. Ownership
    // cannot be established, so it belongs to no tenant and no tenant may read
    // its banking details.
    h.getTravelSupportById.mockResolvedValue({
      travelSupport: { ...record(ORG_A, CONF_A), conferenceOrgId: null },
      error: null,
    })

    const outcome = await settle(getById())

    expect(outcome.value).toBeUndefined()
    expect(outcome.error).toMatchObject({ code: 'FORBIDDEN', message: DENIED })
  })

  it('still returns OUR OWN request in full — the guard is not a blanket deny', async () => {
    h.getTravelSupportById.mockResolvedValue({
      travelSupport: record(ORG_A, CONF_A),
      error: null,
    })

    const outcome = await settle(getById())

    expect(outcome.error).toBeUndefined()
    // The payout pane renders these; the fix must not have quietly emptied them.
    expect(outcome.value).toMatchObject({
      _id: 'ts-1',
      status: 'submitted',
      bankingDetails: { iban: FOREIGN_IBAN, swiftCode: FOREIGN_SWIFT },
      speaker: { email: 'speaker@other.test' },
    })
  })

  it('admits ANOTHER EDITION of our own org — the boundary here is the ORG', async () => {
    // Deliberate, and different from `volunteer.sendEmail` (#858), whose
    // boundary is the conference. Travel support's six guarded siblings all
    // decide on `conference->organization._ref`, so an organizer works across
    // their own editions; pinning it here means narrowing it later is a visible
    // decision rather than an accident.
    h.getTravelSupportById.mockResolvedValue({
      travelSupport: record(ORG_A, 'conf-A-2024'),
      error: null,
    })

    const outcome = await settle(getById())

    expect(outcome.error).toBeUndefined()
    expect(outcome.value).toMatchObject({ _id: 'ts-1' })
  })

  it('reads the document exactly once — the guard’s fetch IS the handler’s', async () => {
    // The guard cannot be moved after the fetch without this failing: an
    // unguarded document must never be read twice, and must never be read by
    // the handler ahead of the decision.
    h.getTravelSupportById.mockResolvedValue({
      travelSupport: record(ORG_A, CONF_A),
      error: null,
    })

    await getById()

    expect(h.getTravelSupportById).toHaveBeenCalledTimes(1)
    expect(h.getTravelSupportById).toHaveBeenCalledWith('ts-1')
  })
})
