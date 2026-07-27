/**
 * @vitest-environment node
 *
 * Budget router tests. Authorization runs the ORG-SCOPED waist FOR REAL:
 * fixtures are modern tokens (`organizerOrgIds`) and the domain conference
 * carries an `organization` ref, so `adminProcedure` grants via org
 * membership — not the sunset legacy-token bridge (which has its own unit
 * suite in src/lib/authz/organizer.test.ts). Only EXTERNAL boundaries are
 * mocked: `next/headers` (request host), `next/cache` (cache API) and the
 * Sanity clients — conference-by-domain resolution and budget data access
 * run for real on top of them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

// --- next/headers: drives the domain-conference resolution ------------------
const hostMock = vi.fn<() => string | null>(() => 'cloudnativebergen.no')
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => (key === 'host' ? hostMock() : null),
  }),
}))

// --- next/cache: `use cache` helpers used by the conference resolver --------
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

// --- Sanity clients: conference-by-domain read (clientWrite.fetch), budget
// --- doc reads (clientReadUncached.fetch) + create/patch writes -------------
const conferenceFetchMock = vi.fn()
const uncachedFetchMock = vi.fn()
const createMock = vi.fn()
const commitMock = vi.fn()
let lastPatchId: string | undefined
let lastSet: Record<string, unknown> | undefined

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (...args: unknown[]) => conferenceFetchMock(...args),
    createIfNotExists: (...args: unknown[]) => createMock(...args),
    patch: (id: string) => {
      lastPatchId = id
      const builder = {
        set: (obj: Record<string, unknown>) => {
          lastSet = obj
          return builder
        },
        commit: () => commitMock(),
      }
      return builder
    },
  },
  clientReadUncached: {
    fetch: (...args: unknown[]) => uncachedFetchMock(...args),
  },
}))

import { budgetRouter } from './budget'

const CONFERENCE_ID = 'conf-1'
const ORG_ID = 'org-1'
const BUDGET_ID = 'budget-1'

// The domain conference resolved by getConferenceForDomain: carries the
// organization ref the authz waist gates on.
const conferenceDoc = {
  _id: CONFERENCE_ID,
  organization: { _ref: ORG_ID },
  domains: ['cloudnativebergen.no'],
}

function makeCaller(
  speaker: { _id: string; name: string; organizerOrgIds: string[] } | null,
) {
  const ctx = {
    session: speaker ? { speaker, user: { name: speaker.name } } : null,
    speaker: speaker ?? undefined,
  } as unknown as Context
  return budgetRouter.createCaller(ctx)
}

/** Modern org-scoped token: organizer of the request domain's org. */
const orgOrganizer = { _id: 'sp-1', name: 'Org', organizerOrgIds: [ORG_ID] }
/** Modern token, organizer of a DIFFERENT org (cross-tenant). */
const crossOrgOrganizer = {
  _id: 'sp-2',
  name: 'Other',
  organizerOrgIds: ['org-other'],
}
/** Modern token, organizer of no org at all. */
const nonOrganizer = { _id: 'sp-3', name: 'Speaker', organizerOrgIds: [] }

const existingBudget = { _id: BUDGET_ID, conference: { _ref: CONFERENCE_ID } }

const expensesInput = {
  variableCosts: [
    {
      _key: 'vc-1',
      name: 'Lunch',
      category: 'catering' as const,
      amountPerPerson: 300,
      basis: 'conference' as const,
    },
  ],
  fixedCosts: [
    {
      _key: 'fc-1',
      name: 'Venue',
      category: 'venue' as const,
      amount: 100000,
      optional: false,
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  lastPatchId = undefined
  lastSet = undefined
  hostMock.mockReturnValue('cloudnativebergen.no')
  conferenceFetchMock.mockResolvedValue(conferenceDoc)
  uncachedFetchMock.mockResolvedValue(existingBudget)
  commitMock.mockResolvedValue(existingBudget)
  createMock.mockResolvedValue(existingBudget)
})

describe('budget router — authorization (org-scoped waist)', () => {
  it('rejects a speaker who organizes no org (FORBIDDEN)', async () => {
    await expect(
      makeCaller(nonOrganizer).updateExpenses(expensesInput),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a cross-tenant organizer of another org (FORBIDDEN)', async () => {
    await expect(
      makeCaller(crossOrgOrganizer).updateExpenses(expensesInput),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller (UNAUTHORIZED)', async () => {
    await expect(makeCaller(null).get()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await expect(
      makeCaller(null).updateExpenses(expensesInput),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('allows an organizer of the request org', async () => {
    const result = await makeCaller(orgOrganizer).updateExpenses(expensesInput)
    expect(result?.success).toBe(true)
    expect(lastPatchId).toBe(BUDGET_ID)
    // The org was resolved from the DOMAIN conference (host header), not
    // from anything the client sent.
    expect(conferenceFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('$domain in domains'),
      expect.objectContaining({ domain: 'cloudnativebergen.no' }),
    )
  })
})

describe('budget router — conference scoping', () => {
  it('resolves the budget by the domain conference, never client input', async () => {
    await makeCaller(orgOrganizer).get()
    expect(uncachedFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('conference._ref == $conferenceId'),
      { conferenceId: CONFERENCE_ID },
    )
  })

  it('fails CLOSED (FORBIDDEN) when the domain has no conference', async () => {
    // Unresolvable org: the waist denies before any budget read (the
    // org-unresolvable bridge is gone — fail closed, post-044-backfill).
    conferenceFetchMock.mockResolvedValue(null)
    await expect(makeCaller(orgOrganizer).get()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(uncachedFetchMock).not.toHaveBeenCalled()
  })
})

describe('budget router — create', () => {
  it('returns the existing budget without creating a duplicate', async () => {
    const result = await makeCaller(orgOrganizer).create()
    expect(result?.budget?._id).toBe(BUDGET_ID)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('seeds a new budget bound to the resolved conference (atomic id)', async () => {
    // First read: no budget yet; read-after-create returns the document.
    uncachedFetchMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingBudget)
    const result = await makeCaller(orgOrganizer).create()
    expect(createMock).toHaveBeenCalledTimes(1)
    const doc = createMock.mock.calls[0][0] as Record<string, unknown>
    expect(doc._type).toBe('conferenceBudget')
    // Deterministic id makes createIfNotExists idempotent - no duplicate
    // budgets under concurrent creates.
    expect(doc._id).toBe(`conferenceBudget-${CONFERENCE_ID}`)
    expect(doc.conference).toEqual({
      _type: 'reference',
      _ref: CONFERENCE_ID,
    })
    expect(Array.isArray(doc.scenarios)).toBe(true)
    expect(result?.budget?._id).toBe(BUDGET_ID)
  })
})

describe('budget router — mutations', () => {
  it('patches expense arrays with unique keys', async () => {
    await makeCaller(orgOrganizer).updateExpenses({
      variableCosts: expensesInput.variableCosts,
      // Duplicate client-supplied keys must be deduplicated server-side.
      fixedCosts: [
        { ...expensesInput.fixedCosts[0], _key: 'dup' },
        {
          name: 'Photography',
          category: 'production' as const,
          amount: 60000,
          optional: true,
          _key: 'dup',
        },
      ],
    })
    expect(lastPatchId).toBe(BUDGET_ID)
    const fixed = lastSet?.fixedCosts as { _key: string }[]
    expect(fixed).toHaveLength(2)
    expect(new Set(fixed.map((f) => f._key)).size).toBe(2)
  })

  it('fails NOT_FOUND when updating expenses before a budget exists', async () => {
    uncachedFetchMock.mockResolvedValue(null)
    await expect(
      makeCaller(orgOrganizer).updateExpenses(expensesInput),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects invalid expense input (negative amount)', async () => {
    await expect(
      makeCaller(orgOrganizer).updateExpenses({
        variableCosts: [],
        fixedCosts: [
          {
            name: 'Venue',
            category: 'venue' as const,
            amount: -1,
            optional: false,
          },
        ],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects more than one sponsor-included ticket type', async () => {
    await expect(
      makeCaller(orgOrganizer).updateTicketTypes({
        ticketTypes: [
          {
            name: 'A',
            priceInclVat: 0,
            attendsConference: true,
            attendsWorkshop: false,
            workshopCrew: false,
            sponsorIncluded: true,
          },
          {
            name: 'B',
            priceInclVat: 0,
            attendsConference: true,
            attendsWorkshop: false,
            workshopCrew: false,
            sponsorIncluded: true,
          },
        ],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a ticket type that is both workshop attendee and crew', async () => {
    await expect(
      makeCaller(orgOrganizer).updateTicketTypes({
        ticketTypes: [
          {
            name: 'Speaker',
            priceInclVat: 0,
            attendsConference: true,
            attendsWorkshop: true,
            workshopCrew: true,
          },
        ],
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('saves ticket types including manual actual counts', async () => {
    const result = await makeCaller(orgOrganizer).updateTicketTypes({
      ticketTypes: [
        {
          _key: 'standard',
          name: 'Standard',
          priceInclVat: 3125,
          attendsConference: true,
          attendsWorkshop: false,
          workshopCrew: false,
          sponsorIncluded: false,
          actualCount: 42,
        },
      ],
    })
    expect(result?.success).toBe(true)
    const tickets = lastSet?.ticketTypes as { actualCount?: number | null }[]
    expect(tickets[0].actualCount).toBe(42)
  })
})
