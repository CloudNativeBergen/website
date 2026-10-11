/**
 * @vitest-environment node
 *
 * WHAT A SAVE OF THE WORKSHOP-TICKET LIST LEAVES STORED, AND WHAT THE PORTAL
 * THEN DECIDES (#1332).
 *
 * Nothing between the procedure and the gate is a mock of our own code: the
 * procedure builds a real `@sanity/client` patch, Sanity's own
 * `@sanity/mutator` applies it to an in-memory conference, and the gate
 * (`checkWorkshopEligibility`, with the real `workshopAccessOf`) reads that
 * conference back through its live roles read. So the assertions are on the
 * stored value and on the gate's answer, never on which patch calls were made.
 * A patch mock cannot tell an entry that was replaced from one that was
 * duplicated or dropped; the mutator can.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  commits: 0,
  tickets: [] as { category: string; crm: { email: string } }[],
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const { parse, evaluate } = await import('groq-js')
  const { createRequire: req } = await import('node:module')
  const { Mutation } = req(req(import.meta.url).resolve('sanity/package.json'))(
    '@sanity/mutator',
  ) as {
    Mutation: new (o: { mutations: unknown[] }) => {
      apply: (d: unknown) => Record<string, unknown> | null
    }
  }
  const client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2024-01-01',
    useCdn: false,
  })
  const fetch = async (query: string, params: Record<string, unknown> = {}) =>
    (await evaluate(parse(query), { dataset: h.dataset, params })).get()

  return {
    clientReadUncached: { fetch },
    clientWrite: {
      fetch,
      patch: (id: string) => {
        const patch = client.patch(id)
        patch.commit = (async () => {
          const index = h.dataset.findIndex((d) => d._id === id)
          if (index === -1) throw new Error(`no such document: ${id}`)
          const serialized = patch.serialize() as { ifRevisionID?: string }
          // The condition Sanity enforces and the mutator does not.
          if (
            serialized.ifRevisionID &&
            serialized.ifRevisionID !== h.dataset[index]._rev
          ) {
            throw Object.assign(new Error('revision mismatch'), {
              statusCode: 409,
            })
          }
          h.commits += 1
          const next = new Mutation({
            mutations: [{ patch: serialized }],
          }).apply(structuredClone(h.dataset[index]))
          if (next) h.dataset[index] = { ...next, _rev: `rev-${h.commits}` }
          return { _id: id }
        }) as typeof patch.commit
        return patch
      },
    },
  }
})

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: CONFERENCE,
    domain: 'a.test',
    error: null,
  }),
}))
vi.mock('@/lib/tickets/summary', () => ({ buildTicketSummary: vi.fn() }))
vi.mock('@/lib/email/from', () => ({
  platformFallbackContact: () => 'help@a.test',
}))
// The ticketing provider is the one boundary stubbed for the gate: it answers
// with this event's tickets.
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingCredentials: vi.fn(),
  getTicketingProvider: vi.fn(),
  resolveTicketingProvider: async () => ({
    configured: true,
    provider: { fetchEventTickets: async () => h.tickets },
    eventRef: { customerId: 7, eventId: 4242 },
  }),
}))

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'
import { checkWorkshopEligibility } from '@/lib/workshop/eligibility'
import { ticketsRouter } from './tickets'

const ORG_A = 'org-A'
const CONF_A = 'conf-A'
const CONFERENCE = {
  _id: CONF_A,
  organization: { _ref: ORG_A },
  checkinEventId: 4242,
  checkinCustomerId: 7,
}

const t = initTRPC.context<Context>().create()
function tickets(orgId: string = ORG_A) {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [orgId],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(ticketsRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

type Role = {
  _key: string
  typeName: string
  admits?: boolean
  grantsWorkshop?: boolean
}

function seed(roles: Role[] | undefined) {
  h.commits = 0
  h.dataset = [
    { _id: ORG_A, _type: 'organization', name: 'A' },
    {
      _id: CONF_A,
      _type: 'conference',
      _rev: 'rev-0',
      organization: { _type: 'reference', _ref: ORG_A },
      ...(roles && { ticketTypeRoles: roles }),
    },
  ]
}

/** `ticketTypeRoles` as Sanity holds it now, without the generated keys. */
const stored = () =>
  (
    (h.dataset.find((d) => d._id === CONF_A)!.ticketTypeRoles ?? []) as Role[]
  ).map(({ _key, ...role }) => {
    void _key
    return role
  })

/** The portal's decision for the one holder of one ticket type. */
async function gate(category: string) {
  // The gate reads tickets through a 30-second memo; each call here is a new
  // state of the world.
  __resetRedeemedCache()
  h.tickets = [{ category, crm: { email: 'ada@x.test' } }]
  return checkWorkshopEligibility({
    userEmail: 'ada@x.test',
    conference: CONFERENCE,
    contactEmail: 'help@a.test',
  })
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a save changes what the portal decides', () => {
  it('admits a holder once their type is marked, and refuses them once it is unmarked', async () => {
    seed([{ _key: 'a', typeName: 'Two-day pass', grantsWorkshop: true }])

    const before = await gate('Workshop 2026')
    expect(before.isEligible).toBe(false)
    expect(before.reason).toContain('has not been set up for workshop access')

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Workshop 2026', grantsWorkshop: true }],
    })
    expect((await gate('Workshop 2026')).isEligible).toBe(true)

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Workshop 2026', grantsWorkshop: false }],
    })
    const after = await gate('Workshop 2026')
    expect(after.isEligible).toBe(false)
    expect(after.reason).toContain('Please upgrade your ticket')
  })
})

describe('removing a stored workshop answer', () => {
  it('keeps the seating answer of an entry that has one', async () => {
    seed([
      { _key: 'a', typeName: 'Two-day pass', grantsWorkshop: true },
      {
        _key: 'b',
        typeName: 'Workshop 2025',
        admits: false,
        grantsWorkshop: true,
      },
    ])

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Workshop 2025', grantsWorkshop: null }],
    })

    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: true },
      { typeName: 'Workshop 2025', admits: false },
    ])
  })

  it('removes the whole entry when the workshop answer was all it held', async () => {
    seed([
      { _key: 'a', typeName: 'Two-day pass', grantsWorkshop: true },
      { _key: 'b', typeName: 'Workshop 2025', grantsWorkshop: false },
    ])

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Workshop 2025', grantsWorkshop: null }],
    })

    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: true },
    ])
  })

  it('removes every stored spelling of the name', async () => {
    seed([
      { _key: 'a', typeName: 'Two-day pass', grantsWorkshop: true },
      { _key: 'b', typeName: ' workshop 2025 ', grantsWorkshop: false },
    ])

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Workshop 2025', grantsWorkshop: null }],
    })

    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: true },
    ])
  })
})

/**
 * THE CLIFF IN THE OTHER DIRECTION. The built-in list decides whenever no
 * entry grants, so the save that takes the last granting entry away changes
 * who gets in for every type at once. The page asks first; the procedure
 * refuses a save that was not asked about, because the page's view can be a
 * minute old: two organizers each unmarking one of two granting types would
 * each be shown a save that "leaves another".
 */
describe('a save that leaves no granting type', () => {
  const LAST = [
    { _key: 'a', typeName: 'Two-day pass', admits: true, grantsWorkshop: true },
    { _key: 'b', typeName: 'Day pass', grantsWorkshop: false },
  ]
  const unchanged = [
    { typeName: 'Two-day pass', admits: true, grantsWorkshop: true },
    { typeName: 'Day pass', grantsWorkshop: false },
  ]

  it('is refused, and writes nothing, when unmarking the last one unconfirmed', async () => {
    seed(LAST)

    await expect(
      tickets().admin.setWorkshopAccess({
        updates: [{ typeName: 'Two-day pass', grantsWorkshop: false }],
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })

    expect(stored()).toEqual(unchanged)
    expect(h.commits).toBe(0)
  })

  it('is refused, and writes nothing, when removing the last one unconfirmed', async () => {
    seed(LAST)

    await expect(
      tickets().admin.setWorkshopAccess({
        updates: [{ typeName: 'Two-day pass', grantsWorkshop: null }],
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })

    expect(stored()).toEqual(unchanged)
    expect(h.commits).toBe(0)
  })

  it('is written once the organizer has confirmed it', async () => {
    seed(LAST)

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Two-day pass', grantsWorkshop: false }],
      allowBuiltInList: true,
    })

    expect(stored()).toEqual([
      { typeName: 'Day pass', grantsWorkshop: false },
      { typeName: 'Two-day pass', admits: true, grantsWorkshop: false },
    ])
  })

  it('asks nothing of a save that leaves another granting type', async () => {
    seed([
      ...LAST,
      { _key: 'c', typeName: 'Speaker ticket', grantsWorkshop: true },
    ])

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Two-day pass', grantsWorkshop: false }],
    })

    expect(stored()).toEqual([
      { typeName: 'Day pass', grantsWorkshop: false },
      { typeName: 'Speaker ticket', grantsWorkshop: true },
      { typeName: 'Two-day pass', admits: true, grantsWorkshop: false },
    ])
  })

  it('asks nothing of a save that swaps the granting type in one batch', async () => {
    seed(LAST)

    await tickets().admin.setWorkshopAccess({
      updates: [
        { typeName: 'Two-day pass', grantsWorkshop: false },
        { typeName: 'Day pass', grantsWorkshop: true },
      ],
    })

    expect(stored()).toEqual([
      { typeName: 'Two-day pass', admits: true, grantsWorkshop: false },
      { typeName: 'Day pass', grantsWorkshop: true },
    ])
  })

  it('asks nothing while no type is marked: the built-in list already decides', async () => {
    seed([{ _key: 'b', typeName: 'Day pass', grantsWorkshop: false }])

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Two-day pass', grantsWorkshop: false }],
    })

    expect(stored()).toEqual([
      { typeName: 'Day pass', grantsWorkshop: false },
      { typeName: 'Two-day pass', grantsWorkshop: false },
    ])
  })

  it('never refuses the seating answer of the last granting type', async () => {
    seed(LAST)

    await tickets().admin.setTicketTypeRole({
      typeName: 'Two-day pass',
      admits: false,
    })

    expect(stored()).toEqual([
      { typeName: 'Day pass', grantsWorkshop: false },
      { typeName: 'Two-day pass', admits: false, grantsWorkshop: true },
    ])
  })
})
