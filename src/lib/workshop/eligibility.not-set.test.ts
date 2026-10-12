/**
 * @vitest-environment node
 *
 * The portal refusal raises the not-set notice (#1335, spec §8).
 *
 * WHAT RUNS FOR REAL: `checkWorkshopEligibility`, the rule, the memo, the bus,
 * the real handler registry, the bus handler and the notification writer. The
 * dataset is in memory (`__tests__/helpers/sanityStore.ts`): every query is
 * executed, every write is built by the real client and applied by
 * `@sanity/mutator`.
 *
 * WHAT IS REPLACED: the ticketing provider, and `runAfterResponse`, which here
 * holds each task until `afterResponse()` so a test can look at the answer
 * before the write has run, and can let several requests arrive first.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import type { EventTicket } from '@/lib/tickets/types'
import type { SanityStore } from '../../../__tests__/helpers/sanityStore'

const h = vi.hoisted(() => ({
  store: null as unknown as SanityStore,
  tasks: [] as (() => Promise<void>)[],
  resolveTicketingProvider: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createSanityStore } =
    await import('../../../__tests__/helpers/sanityStore')
  h.store = createSanityStore()
  return h.store.clients
})
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingProvider: h.resolveTicketingProvider,
}))
vi.mock('@/lib/email/from', () => ({
  platformFallbackContact: () => 'fallback@example.test',
}))
vi.mock('@/server/runAfterResponse', () => ({
  runAfterResponse: (task: () => Promise<void>) => {
    h.tasks.push(task)
  },
}))

import { checkWorkshopEligibility } from './eligibility'
import { __resetNotSetNoticeMemo } from './not-set-notice'
import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'

/** Run everything that was left for after the response. */
async function afterResponse() {
  while (h.tasks.length > 0) {
    await h.tasks.shift()!()
  }
}

const ref = (id: string) => ({ _type: 'reference', _ref: id, _key: id })
const MARKED = [
  { _key: 'r1', typeName: 'Workshop day', grantsWorkshop: true },
  { _key: 'r2', typeName: 'Student', grantsWorkshop: false },
]

const DATASET = [
  {
    _id: 'conf-a',
    _type: 'conference',
    organization: { _type: 'reference', _ref: 'org-a' },
    organizers: [ref('sp-anna'), ref('sp-arne')],
    ticketTypeRoles: MARKED,
  },
  {
    // Has marked nothing: the built-in list applies.
    _id: 'conf-b',
    _type: 'conference',
    organization: { _type: 'reference', _ref: 'org-b' },
    organizers: [ref('sp-bea')],
  },
]

const conference = (id: 'conf-a' | 'conf-b') => ({
  _id: id,
  checkinCustomerId: 42,
  checkinEventId: id === 'conf-a' ? 7 : 8,
  organization: { _ref: id === 'conf-a' ? 'org-a' : 'org-b' },
})

function holding(...tickets: [email: string, category: string][]) {
  h.resolveTicketingProvider.mockResolvedValue({
    configured: true,
    provider: {
      fetchEventTickets: vi
        .fn()
        .mockResolvedValue(
          tickets.map(
            ([email, category]) =>
              ({ category, crm: { email } }) as unknown as EventTicket,
          ),
        ),
    },
    eventRef: { customerId: 42, eventId: 7 },
  })
}

const refuse = (email: string, id: 'conf-a' | 'conf-b' = 'conf-a') =>
  checkWorkshopEligibility({
    userEmail: email,
    conference: conference(id),
    contactEmail: 'help@x.test',
  })

const notifications = () => h.store.ofType('notification')
/** Reads other than the gate's own re-read of the roles, which predates this. */
const readsBeyondTheGate = () =>
  h.store.queries.filter((query) => !query.includes('{ ticketTypeRoles }'))

const NOT_SET_REFUSAL =
  'Your ticket type “Early Bird” has not been set up for workshop access yet. This is a configuration gap on our side, not a problem with your ticket — please contact us at help@x.test so an organizer can mark which ticket types include workshop access.'
const UPGRADE_REFUSAL =
  'No valid workshop ticket found. Please upgrade your ticket to include workshop access, or contact us at help@x.test if you believe this is an error.'

// The first raise imports the handler registry, inside the deferred task. It
// is every handler in the application, so it is loaded once here and not on
// the first test's clock.
beforeAll(async () => {
  await import('@/lib/events/registry')
}, 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  h.tasks.length = 0
  h.store.reset(DATASET)
  __resetNotSetNoticeMemo()
  __resetRedeemedCache()
})

describe('a refusal for a not-set type', () => {
  it('writes one notification per organizer, naming the type and linking to the workshops page', async () => {
    holding(['ada@x.test', 'Early Bird'])

    const result = await refuse('ada@x.test')
    await afterResponse()

    expect(result.isEligible).toBe(false)
    expect(
      notifications().map((doc) => ({
        recipient: (doc.recipient as { _ref: string })._ref,
        conference: (doc.conference as { _ref: string })._ref,
        type: doc.notificationType,
        title: doc.title,
        link: doc.link,
      })),
    ).toEqual([
      {
        recipient: 'sp-anna',
        conference: 'conf-a',
        type: 'workshop_ticket_type_not_set',
        title: '“Early Bird” needs a workshop decision',
        link: '/admin/workshops#workshop-tickets',
      },
      {
        recipient: 'sp-arne',
        conference: 'conf-a',
        type: 'workshop_ticket_type_not_set',
        title: '“Early Bird” needs a workshop decision',
        link: '/admin/workshops#workshop-tickets',
      },
    ])
    expect(h.store.commits).toHaveLength(1)
  })

  it('answers the attendee before the notification is written', async () => {
    holding(['ada@x.test', 'Early Bird'])

    const result = await refuse('ada@x.test')

    expect(result.reason).toBe(NOT_SET_REFUSAL)
    expect(h.store.commits).toEqual([])
    expect(h.tasks).toHaveLength(1)
  })

  it('writes none for a second refusal of the same type, by the same attendee or another', async () => {
    holding(['ada@x.test', 'Early Bird'], ['bo@x.test', 'early bird '])

    await refuse('ada@x.test')
    await afterResponse()
    await refuse('ada@x.test')
    await refuse('bo@x.test')
    await afterResponse()

    expect(h.store.commits).toHaveLength(1)
    expect(notifications()).toHaveLength(2)
  })

  it('raises a burst for one type once: one task, one read, one write', async () => {
    holding(['ada@x.test', 'Early Bird'], ['bo@x.test', 'Early Bird'])

    // Three refused requests arrive before any after-response work has run.
    await refuse('ada@x.test')
    await refuse('bo@x.test')
    await refuse('ada@x.test')
    expect(h.tasks).toHaveLength(1)

    await afterResponse()

    expect(readsBeyondTheGate()).toHaveLength(1)
    expect(h.store.commits).toHaveLength(1)
    expect(notifications()).toHaveLength(2)
  })

  it('writes its own for a different not-set type', async () => {
    holding(['ada@x.test', 'Early Bird'], ['bo@x.test', 'Late Bird'])

    await refuse('ada@x.test')
    await refuse('bo@x.test')
    await afterResponse()

    expect(notifications().map((doc) => doc.title)).toEqual([
      '“Early Bird” needs a workshop decision',
      '“Early Bird” needs a workshop decision',
      '“Late Bird” needs a workshop decision',
      '“Late Bird” needs a workshop decision',
    ])
  })

  it('writes none when a restarted process refuses the same type again', async () => {
    holding(['ada@x.test', 'Early Bird'])
    await refuse('ada@x.test')
    await afterResponse()
    const before = structuredClone(notifications())

    __resetNotSetNoticeMemo()
    await refuse('ada@x.test')
    await afterResponse()

    // The restarted process did try: the document ids are what stopped it.
    expect(h.store.commits).toHaveLength(2)
    expect(notifications()).toEqual(before)
  })

  it('makes one read beyond the gate for any number of refused requests', async () => {
    holding(['ada@x.test', 'Early Bird'])

    await refuse('ada@x.test')
    await afterResponse()
    expect(readsBeyondTheGate()).toHaveLength(1)

    for (let request = 0; request < 5; request++) {
      await refuse('ada@x.test')
      await afterResponse()
    }

    // Six refused requests: the gate's own roles re-read each time, as before
    // this change, and the organizers read once.
    expect(h.store.queries).toHaveLength(6 + 1)
    expect(readsBeyondTheGate()).toHaveLength(1)
    expect(h.store.commits).toHaveLength(1)
  })
})

describe('a refusal that is not about a missing decision', () => {
  it('writes none for a type that was answered no', async () => {
    holding(['ada@x.test', 'Student'])

    const result = await refuse('ada@x.test')
    await afterResponse()

    expect(result.reason).toBe(UPGRADE_REFUSAL)
    expect(h.tasks).toEqual([])
    expect(notifications()).toEqual([])
    expect(readsBeyondTheGate()).toEqual([])
  })

  it('writes none on a conference that has marked nothing', async () => {
    holding(['ada@x.test', 'Early Bird'])

    const result = await refuse('ada@x.test', 'conf-b')
    await afterResponse()

    expect(result.reason).toBe(UPGRADE_REFUSAL)
    expect(notifications()).toEqual([])
    expect(readsBeyondTheGate()).toEqual([])
  })

  it('writes none for a holder who is let in, whatever else they hold', async () => {
    holding(['ada@x.test', 'Workshop day'], ['ada@x.test', 'Early Bird'])

    const result = await refuse('ada@x.test')
    await afterResponse()

    expect(result.isEligible).toBe(true)
    expect(notifications()).toEqual([])
  })

  it('raises nothing for someone with no ticket', async () => {
    holding(['ada@x.test', 'Early Bird'])

    const result = await refuse('nobody@x.test')

    expect(result.reason).toContain('No ticket found for nobody@x.test')
    expect(h.tasks).toEqual([])
    expect(h.store.queries).toEqual([])
  })
})

describe('when the notification cannot be written', () => {
  it('gives the attendee the same refusal', async () => {
    holding(['ada@x.test', 'Early Bird'])
    h.store.failWrites()

    const result = await refuse('ada@x.test')
    await afterResponse()

    expect(result).toMatchObject({
      isEligible: false,
      eligibleTickets: [],
      reason: NOT_SET_REFUSAL,
    })
    expect(result.tickets).toHaveLength(1)
    // The write was attempted, and it failed.
    expect(console.error).toHaveBeenCalledWith(
      'Failed to create once-only notifications:',
      {
        conferenceId: 'conf-a',
        typeNames: ['Early Bird'],
        source: 'portal-refusal',
      },
      expect.any(Error),
    )

    // And the next request is refused the same way.
    expect((await refuse('ada@x.test')).reason).toBe(NOT_SET_REFUSAL)
  })

  it('is left to the next process: this one does not try again', async () => {
    holding(['ada@x.test', 'Early Bird'])
    h.store.failWrites()

    for (let request = 0; request < 4; request++) {
      await refuse('ada@x.test')
      await afterResponse()
    }
    // Four refused requests, one attempt: the organizers were read once.
    expect(readsBeyondTheGate()).toHaveLength(1)

    // Sanity is back and a process that never met the type refuses it.
    h.store.reset(DATASET)
    __resetNotSetNoticeMemo()
    await refuse('ada@x.test')
    await afterResponse()

    expect(notifications()).toHaveLength(2)
  })
})
