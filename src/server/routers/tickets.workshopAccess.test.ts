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
  /** Commits ATTEMPTED, landed or not. */
  attempts: 0,
  /**
   * Runs once, between the procedure's read and its commit: another writer
   * getting in first. It changes the dataset however it likes.
   */
  beforeCommit: null as null | (() => void),
  /**
   * Thrown by the next commit AFTER the patch has been applied: the write
   * landed and the answer was lost on the way back.
   */
  failAfterApplying: null as null | Error,
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
          h.attempts += 1
          const interleaved = h.beforeCommit
          h.beforeCommit = null
          interleaved?.()
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
          const lost = h.failAfterApplying
          h.failAfterApplying = null
          if (lost) throw lost
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
import {
  checkWorkshopEligibility,
  workshopAccessOf,
} from '@/lib/workshop/eligibility'
import { marksWorkshopAccess } from '@/lib/tickets/classification'
import { workshopAnswersVersion } from '@/lib/workshop/ticket-list'
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
  /** Absent only where a case is about an entry written without one. */
  _key?: string
  typeName: string
  admits?: boolean
  grantsWorkshop?: boolean
}

function seed(roles: Role[] | undefined) {
  h.commits = 0
  h.attempts = 0
  h.beforeCommit = null
  h.failAfterApplying = null
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
  /**
   * The orphan the section lists for a renamed type stored under two
   * spellings (`buildWorkshopTicketList`): the first answers only the seating
   * question, the second holds the grant that keeps the conference off the
   * built-in list. The removal has to reach that second spelling.
   */
  it('clears a grant held by a later spelling of the name', async () => {
    seed([
      { _key: 'a', typeName: 'Workshop 2025', admits: true },
      { _key: 'b', typeName: 'workshop 2025 ', grantsWorkshop: true },
      { _key: 'c', typeName: 'Workshop 2026', grantsWorkshop: false },
    ])
    const marked = () =>
      marksWorkshopAccess(
        h.dataset.find((d) => d._id === CONF_A)!.ticketTypeRoles as Role[],
      )
    expect(marked()).toBe(true)

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Workshop 2025', grantsWorkshop: null }],
      allowBuiltInList: true,
    })

    expect(stored()).toEqual([
      { typeName: 'Workshop 2026', grantsWorkshop: false },
      { typeName: 'Workshop 2025', admits: true },
    ])
    expect(marked()).toBe(false)
  })

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
 * A COMMIT THAT FAILS DOES NOT SAY WHY. Two different things come back as an
 * error from `patch.commit()`:
 *
 *  - a REVISION CONFLICT (409): the document moved between the read and the
 *    write, and Sanity did NOT apply the patch. Reading again and deciding
 *    again is right, and "nothing was saved" is true if that decides no.
 *  - ANYTHING ELSE (a timeout, a dropped connection, a 5xx): the patch may
 *    have been applied and the answer lost on the way back. Retrying then
 *    re-reads the roles this very save just stored, finds they are not the
 *    ones the page was showing (`basedOn`), and answers "This list changed
 *    since you opened it. Nothing was saved." It was saved.
 *
 * So only a definite conflict is retried. Anything else is answered at once
 * with a code of its own, and the answer claims neither outcome.
 */
describe('a commit that fails', () => {
  const ROLES = [
    { _key: 'a', typeName: 'Two-day pass', grantsWorkshop: true },
    { _key: 'b', typeName: 'Day pass', admits: true },
  ]
  const conference = () =>
    h.dataset.find((d) => d._id === CONF_A) as Record<string, unknown>
  const version = () =>
    workshopAnswersVersion(conference().ticketTypeRoles as Role[])
  /** Another writer, between this save's read and its commit. */
  const meanwhile = (change: (doc: Record<string, unknown>) => void) => {
    h.beforeCommit = () => {
      change(conference())
      conference()._rev = 'rev-other'
    }
  }
  const UNCONFIRMED = {
    code: 'BAD_GATEWAY',
    message:
      'The save could not be confirmed. It may or may not have been stored. Reload the page and check before trying again.',
  }

  it('is not retried, and claims neither outcome, when the write may have landed', async () => {
    seed(ROLES)
    h.failAfterApplying = new Error('socket hang up')

    const save = tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Day pass', grantsWorkshop: true }],
      basedOn: version(),
    })

    // Not "This list changed since you opened it. Nothing was saved."
    await expect(save).rejects.toMatchObject(UNCONFIRMED)
    // One attempt: a second would have read back its own write.
    expect(h.attempts).toBe(1)
    // And the write did land.
    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: true },
      { typeName: 'Day pass', admits: true, grantsWorkshop: true },
    ])
  })

  it('is retried after a revision conflict, and then refused when the answers changed', async () => {
    seed(ROLES)
    const basedOn = version()
    meanwhile((doc) => {
      doc.ticketTypeRoles = [
        { _key: 'a', typeName: 'Two-day pass', grantsWorkshop: false },
        { _key: 'b', typeName: 'Day pass', admits: true },
      ]
    })

    await expect(
      tickets().admin.setWorkshopAccess({
        updates: [{ typeName: 'Day pass', grantsWorkshop: true }],
        basedOn,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This list changed since you opened it. Nothing was saved.',
    })

    // The one commit that was tried did not apply; the second pass read the
    // other writer's answers and refused before writing. Nothing of ours is
    // stored, exactly as the answer says.
    expect(h.attempts).toBe(1)
    expect(h.commits).toBe(0)
    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: false },
      { typeName: 'Day pass', admits: true },
    ])
  })

  it('is retried after a revision conflict, and lands once, when only another field moved', async () => {
    seed(ROLES)
    const basedOn = version()
    meanwhile((doc) => {
      doc.title = 'Renamed in Studio'
    })

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Day pass', grantsWorkshop: true }],
      basedOn,
    })

    expect(h.attempts).toBe(2)
    expect(h.commits).toBe(1)
    expect(conference().title).toBe('Renamed in Studio')
    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: true },
      { typeName: 'Day pass', admits: true, grantsWorkshop: true },
    ])
  })

  it('says the type changed while saving after two revision conflicts in a row', async () => {
    seed(ROLES)
    // Somebody keeps getting in first.
    meanwhile((doc) => {
      doc.title = 'First'
      h.beforeCommit = () => {
        doc.title = 'Second'
        conference()._rev = 'rev-other-2'
      }
    })

    await expect(
      tickets().admin.setWorkshopAccess({
        updates: [{ typeName: 'Day pass', grantsWorkshop: true }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'This ticket type changed while you were saving it. Reload the page and try again.',
    })

    // Neither attempt applied, so "changed while you were saving" is all that
    // happened to it.
    expect(h.attempts).toBe(2)
    expect(h.commits).toBe(0)
    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: true },
      { typeName: 'Day pass', admits: true },
    ])
  })

  it('is not retried for the seating answer either', async () => {
    seed(ROLES)
    h.failAfterApplying = new Error('fetch failed')

    await expect(
      tickets().admin.setTicketTypeRole({
        typeName: 'Day pass',
        admits: false,
      }),
    ).rejects.toMatchObject(UNCONFIRMED)

    expect(h.attempts).toBe(1)
    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: true },
      { typeName: 'Day pass', admits: false },
    ])
  })

  it('retries the seating answer after a revision conflict', async () => {
    seed(ROLES)
    meanwhile((doc) => {
      doc.title = 'Renamed in Studio'
    })

    await tickets().admin.setTicketTypeRole({
      typeName: 'Day pass',
      admits: false,
    })

    expect(h.attempts).toBe(2)
    expect(h.commits).toBe(1)
    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: true },
      { typeName: 'Day pass', admits: false },
    ])
  })
})

/**
 * WHAT A SAVE WAS BASED ON. The page sends the version of the workshop answers
 * it rendered from; the save is refused when they are no longer the stored
 * ones, before anything is written.
 */
describe('a save that says which answers it was based on', () => {
  const ROLES = [
    { _key: 'a', typeName: 'Two-day pass', grantsWorkshop: true },
    { _key: 'b', typeName: 'Day pass', admits: true },
  ]
  const version = () =>
    workshopAnswersVersion(
      h.dataset.find((d) => d._id === CONF_A)!.ticketTypeRoles as Role[],
    )

  it('is written when they are still the stored ones', async () => {
    seed(ROLES)

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Day pass', grantsWorkshop: true }],
      basedOn: version(),
    })

    expect(h.commits).toBe(1)
  })

  it('is refused, and writes nothing, when a workshop answer changed since', async () => {
    seed(ROLES)
    const stale = version()
    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Day pass', grantsWorkshop: true }],
    })

    await expect(
      tickets().admin.setWorkshopAccess({
        updates: [{ typeName: 'Two-day pass', grantsWorkshop: false }],
        basedOn: stale,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This list changed since you opened it. Nothing was saved.',
    })

    expect(h.commits).toBe(1)
    expect(stored()).toEqual([
      { typeName: 'Two-day pass', grantsWorkshop: true },
      { typeName: 'Day pass', admits: true, grantsWorkshop: true },
    ])
  })

  it('is not disturbed by a seating answer saved in between', async () => {
    seed(ROLES)
    const before = version()

    await tickets().admin.setTicketTypeRole({
      typeName: 'Two-day pass',
      admits: false,
    })

    // The workshop answers are the same ones, so the page is not stale.
    expect(version()).toBe(before)
    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Day pass', grantsWorkshop: true }],
      basedOn: before,
    })
    expect(h.commits).toBe(2)
  })

  it('tells apart every change that changes what the rule reads', () => {
    const v = (roles: Omit<Role, '_key'>[]) => workshopAnswersVersion(roles)
    const base = [
      { typeName: 'A', grantsWorkshop: true },
      { typeName: 'B', grantsWorkshop: false },
    ]

    const versions = [
      v(base),
      v([base[0], { typeName: 'B', grantsWorkshop: true }]),
      v([base[0], { typeName: 'B' }]),
      v([base[0]]),
      // Order matters: the rule reads the first entry for a name.
      v([base[1], base[0]]),
      v([{ typeName: 'C', grantsWorkshop: true }, base[1]]),
    ]
    expect(new Set(versions).size).toBe(versions.length)
    // Spelling and the seating answer do not.
    expect(
      v([
        { typeName: ' a ', admits: false, grantsWorkshop: true },
        { typeName: 'b', grantsWorkshop: false },
      ]),
    ).toBe(v(base))
  })
})

/**
 * A NAME WITH A CONTROL CHARACTER IN IT. The name reaches a patch PATH, escaped
 * with `JSON.stringify`, and Sanity's path parser reads the character after a
 * backslash literally: `"Speake\r ticket"` is written `Speake\\r ticket` and
 * read back as `Speaker ticket`. So the unset removed an entry the guard had
 * not counted (it compared the name as sent), and the last grant went with no
 * confirmation. Such a name is refused before anything is read.
 */
describe('a ticket type name with a control character', () => {
  const GRANT = [
    {
      _key: 'a',
      typeName: 'Speaker ticket',
      admits: true,
      grantsWorkshop: true,
    },
  ]

  it('cannot remove the last grant behind the confirmation', async () => {
    seed(GRANT)

    await expect(
      tickets().admin.setWorkshopAccess({
        updates: [{ typeName: 'Speake\r ticket', grantsWorkshop: false }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(stored()).toEqual([
      { typeName: 'Speaker ticket', admits: true, grantsWorkshop: true },
    ])
    expect(h.commits).toBe(0)
  })

  it.each(['\n', '\t', '\r', '\u0001', '\u007f', '\ud800'])(
    'is refused by both saves (%j)',
    async (character) => {
      seed(GRANT)
      const typeName = `Work${character}shop`

      await expect(
        tickets().admin.setWorkshopAccess({
          updates: [{ typeName, grantsWorkshop: true }],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
        tickets().admin.setTicketTypeRole({ typeName, admits: false }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect(h.commits).toBe(0)
    },
  )

  it('still takes a name with quotes, brackets, a backslash and other scripts', async () => {
    seed(GRANT)
    const typeName = 'Ærlig "pass" [2 dager] \\ 工作坊'

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName, grantsWorkshop: false }],
    })
    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName, grantsWorkshop: true }],
    })

    // Replaced, not duplicated: the path matched the entry it had written.
    expect(stored()).toEqual([
      { typeName: 'Speaker ticket', admits: true, grantsWorkshop: true },
      { typeName, grantsWorkshop: true },
    ])
  })
})

/**
 * A SEATING ANSWER NEVER CHANGES WORKSHOP ACCESS.
 *
 * The seating save used to replace the type's whole entry, and every other
 * spelling of its name with it. Studio can hold one type under several
 * spellings, and the rule reads only the FIRST entry that matches a name, even
 * when that entry holds no workshop answer. So rebuilding the entry from "the
 * answers" could do two things on a seating toggle: carry an answer the rule
 * was not reading into the entry it does read (the type gains or loses
 * access), or drop the conference's only grant (the built-in list comes back
 * for every type, with no question asked).
 *
 * The seating save now sets `admits` on the entry the seating rule reads and
 * touches nothing else. Asserted on what the REAL rule answers for every type
 * before and after, from the stored document, with the expected answers
 * written out by hand.
 */
describe('a seating answer never changes workshop access', () => {
  const A = 'Two-day pass'
  const TYPES = [A, 'Day pass', 'Speaker ticket', 'Student']
  /** `ticketTypeRoles` as stored, keys included. */
  const roles = () =>
    (h.dataset.find((d) => d._id === CONF_A)!.ticketTypeRoles ?? []) as Role[]
  const access = () =>
    Object.fromEntries(
      TYPES.map((type) => [type, workshopAccessOf(type, roles())]),
    )

  const cases: [string, Role[], Record<string, string>][] = [
    [
      'a seating-only entry ahead of a spelling that grants',
      [
        { _key: 'a', typeName: A, admits: true },
        { _key: 'b', typeName: 'two-day pass ', grantsWorkshop: true },
      ],
      // The rule reads the first entry: nobody has answered for this type.
      // The other spelling still keeps the conference off the built-in list.
      {
        [A]: 'unclassified',
        'Day pass': 'unclassified',
        'Speaker ticket': 'unclassified',
        Student: 'unclassified',
      },
    ],
    [
      'a seating-only entry ahead of a spelling that says no',
      [
        { _key: 'a', typeName: A, admits: true },
        { _key: 'b', typeName: 'two-day pass ', grantsWorkshop: false },
        { _key: 'c', typeName: 'Day pass', grantsWorkshop: true },
      ],
      {
        [A]: 'unclassified',
        'Day pass': 'granted',
        'Speaker ticket': 'unclassified',
        Student: 'unclassified',
      },
    ],
    [
      'a no ahead of the spelling that is the only grant',
      [
        { _key: 'a', typeName: A, grantsWorkshop: false },
        { _key: 'b', typeName: 'two-day pass ', grantsWorkshop: true },
      ],
      // Losing the second spelling would bring the built-in list back, and
      // "Speaker ticket" would be granted by it.
      {
        [A]: 'denied',
        'Day pass': 'unclassified',
        'Speaker ticket': 'unclassified',
        Student: 'unclassified',
      },
    ],
    [
      'three spellings: seating, no, grant',
      [
        { _key: 'a', typeName: A, admits: true },
        { _key: 'b', typeName: 'two-day pass ', grantsWorkshop: false },
        { _key: 'c', typeName: ' TWO-DAY PASS', grantsWorkshop: true },
      ],
      {
        [A]: 'unclassified',
        'Day pass': 'unclassified',
        'Speaker ticket': 'unclassified',
        Student: 'unclassified',
      },
    ],
    [
      // Addressed by position: an entry may have been written without a key.
      'entries written without a key',
      [
        { typeName: 'Day pass', grantsWorkshop: false },
        { typeName: A, admits: true },
        { typeName: 'two-day pass ', grantsWorkshop: true },
      ],
      {
        [A]: 'unclassified',
        'Day pass': 'denied',
        'Speaker ticket': 'unclassified',
        Student: 'unclassified',
      },
    ],
    [
      'no entry for the type at all',
      [{ _key: 'c', typeName: 'Day pass', grantsWorkshop: true }],
      {
        [A]: 'unclassified',
        'Day pass': 'granted',
        'Speaker ticket': 'unclassified',
        Student: 'unclassified',
      },
    ],
    [
      'nothing marked, so the built-in list decides',
      [{ _key: 'a', typeName: 'Speaker ticket', grantsWorkshop: false }],
      {
        [A]: 'denied',
        'Day pass': 'denied',
        'Speaker ticket': 'granted',
        Student: 'denied',
      },
    ],
  ]

  it.each(cases)('%s', async (_name, seeded, expected) => {
    seed(seeded)
    expect(access()).toEqual(expected)

    for (const admits of [false, true]) {
      await tickets().admin.setTicketTypeRole({ typeName: A, admits })

      // The answer was saved, on the entry the seating rule reads...
      expect(
        roles().find((r) => r.typeName.trim().toLowerCase() === 'two-day pass')!
          .admits,
      ).toBe(admits)
      // ...and nobody's workshop access moved.
      expect(access()).toEqual(expected)
    }
  })

  it('touches no other entry, no other field, and no order', async () => {
    seed([
      { _key: 'a', typeName: A, admits: true },
      { _key: 'b', typeName: 'two-day pass ', grantsWorkshop: false },
      {
        _key: 'c',
        typeName: ' TWO-DAY PASS',
        admits: true,
        grantsWorkshop: true,
      },
      { _key: 'd', typeName: 'Day pass', grantsWorkshop: false },
    ])

    await tickets().admin.setTicketTypeRole({ typeName: A, admits: false })

    expect(roles()).toEqual([
      { _key: 'a', typeName: A, admits: false },
      { _key: 'b', typeName: 'two-day pass ', grantsWorkshop: false },
      {
        _key: 'c',
        typeName: ' TWO-DAY PASS',
        admits: true,
        grantsWorkshop: true,
      },
      { _key: 'd', typeName: 'Day pass', grantsWorkshop: false },
    ])
  })

  /**
   * TWO ENTRIES CAN SHARE A KEY (a copy made in Studio, a script). A path by
   * key would then set the answer on both; the entry is addressed by its
   * position, which the revision condition makes exact.
   */
  it('sets it on one entry when two share a key', async () => {
    seed([
      { _key: 'same', typeName: 'Day pass', grantsWorkshop: true },
      { _key: 'same', typeName: A, grantsWorkshop: false },
    ])

    await tickets().admin.setTicketTypeRole({ typeName: A, admits: false })

    expect(roles()).toEqual([
      { _key: 'same', typeName: 'Day pass', grantsWorkshop: true },
      { _key: 'same', typeName: A, admits: false, grantsWorkshop: false },
    ])
  })

  it('adds an entry that answers only the seating question when the type has none', async () => {
    seed([{ _key: 'c', typeName: 'Day pass', grantsWorkshop: true }])

    await tickets().admin.setTicketTypeRole({ typeName: A, admits: false })

    expect(stored()).toEqual([
      { typeName: 'Day pass', grantsWorkshop: true },
      { typeName: A, admits: false },
    ])
  })
})

/**
 * THE WORKSHOP SAVE CARRIES WHAT THE RULES READ: the first entry for the name.
 * It replaces every spelling with one entry, so the seating answer it keeps is
 * the one `classifyTicket` was reading, and the confirmation still guards the
 * last grant when that grant sits in another spelling.
 */
describe('a workshop answer for a type stored under two spellings', () => {
  it('carries the seating answer the seating rule was reading, and no other', async () => {
    // The first entry answers no seating question, so `classifyTicket` reads
    // "undeclared" for this type, whatever the second spelling says.
    seed([
      { _key: 'a', typeName: 'Two-day pass', grantsWorkshop: false },
      { _key: 'b', typeName: 'two-day pass ', admits: false },
      { _key: 'c', typeName: 'Day pass', grantsWorkshop: true },
    ])

    await tickets().admin.setWorkshopAccess({
      updates: [{ typeName: 'Two-day pass', grantsWorkshop: true }],
    })

    // Undeclared before, undeclared after: no seating answer is carried in
    // from a spelling the seating rule was not reading.
    expect(stored()).toEqual([
      { typeName: 'Day pass', grantsWorkshop: true },
      { typeName: 'Two-day pass', grantsWorkshop: true },
    ])
  })

  it('still asks before a no that removes a grant held by another spelling', async () => {
    seed([
      { _key: 'a', typeName: 'Two-day pass', admits: true },
      { _key: 'b', typeName: 'two-day pass ', grantsWorkshop: true },
    ])

    await expect(
      tickets().admin.setWorkshopAccess({
        updates: [{ typeName: 'Two-day pass', grantsWorkshop: false }],
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    expect(h.commits).toBe(0)
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

    // In place: the entry keeps its position and its workshop answer.
    expect(stored()).toEqual([
      { typeName: 'Two-day pass', admits: false, grantsWorkshop: true },
      { typeName: 'Day pass', grantsWorkshop: false },
    ])
  })
})
