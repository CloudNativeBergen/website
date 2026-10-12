/**
 * @vitest-environment node
 *
 * A sale of a not-set ticket type raises the not-set notice (#1335, spec §8).
 *
 * WHAT RUNS FOR REAL: the route, the HMAC check, the credential resolver, the
 * workshop feature gate, the rule, the memo, the bus, the real handler
 * registry, the bus handler and the notification writer. The dataset is in
 * memory (`__tests__/helpers/sanityStore.ts`): queries are executed, writes are
 * built by the real client and applied by `@sanity/mutator`.
 *
 * WHAT IS REPLACED: the two conference lookups by Checkin event id, the
 * organization document, the email sender, and `runAfterResponse`, which here
 * holds each task until `afterResponse()` so a test can look at the webhook's
 * answer before the write has run, and can let several deliveries arrive first.
 */
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { stubPlatformTicketingAccount } from '../../helpers/ticketingSecrets'
import type { SanityStore } from '../../helpers/sanityStore'

const h = vi.hoisted(() => ({
  store: null as unknown as SanityStore,
  tasks: [] as (() => Promise<void>)[],
  getConference: vi.fn(),
  getTenant: vi.fn(),
  getOrganizationById: vi.fn(),
  sendWorkshop: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createSanityStore } = await import('../../helpers/sanityStore')
  h.store = createSanityStore()
  return h.store.clients
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceByCheckinEventId: h.getConference,
  getConferenceTenantByCheckinEventId: h.getTenant,
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: h.getOrganizationById,
  getOrganizationRefForCurrentConference: () => null,
}))
vi.mock('@/lib/email/workshop', () => ({
  sendWorkshopSignupInstructions: h.sendWorkshop,
}))
vi.mock('@/server/runAfterResponse', () => ({
  runAfterResponse: (task: () => Promise<void>) => {
    h.tasks.push(task)
  },
}))

import { POST } from '@/app/api/webhooks/checkin/ticket-sold/route'
import {
  MAX_TYPES_PER_CALL,
  MAX_TYPES_PER_CONFERENCE,
  MEMO_LIFETIME_MS,
  __resetNotSetNoticeMemo,
} from '@/lib/workshop/not-set-notice'

/** Run everything that was left for after the response. */
async function afterResponse() {
  while (h.tasks.length > 0) {
    await h.tasks.shift()!()
  }
}

const SECRET = 'checkin-webhook-test-secret'
const ref = (id: string) => ({ _type: 'reference', _ref: id, _key: id })
const MARKED = [
  { _key: 'r1', typeName: 'Workshop day', grantsWorkshop: true },
  { _key: 'r2', typeName: 'Student', grantsWorkshop: false },
]

/** Checkin event id → the conference that owns it. */
const CONFERENCES: Record<number, Record<string, unknown> & { _id: string }> = {
  42: {
    _id: 'conf-a',
    _type: 'conference',
    title: 'CNDN',
    organization: { _type: 'reference', _ref: 'org-platform' },
    organizers: [ref('sp-anna'), ref('sp-arne')],
    ticketTypeRoles: MARKED,
  },
  // An earlier edition of the same organization, with its own organizers.
  41: {
    _id: 'conf-a-2025',
    _type: 'conference',
    title: 'CNDN 2025',
    organization: { _type: 'reference', _ref: 'org-platform' },
    organizers: [ref('sp-anna'), ref('sp-former')],
    ticketTypeRoles: MARKED,
  },
  // Exists only as a draft: the webhook still resolves it and acts on it.
  44: {
    _id: 'drafts.conf-d',
    _type: 'conference',
    title: 'Draft',
    organization: { _type: 'reference', _ref: 'org-platform' },
    organizers: [ref('sp-dora')],
    ticketTypeRoles: MARKED,
  },
  // Has marked nothing: the built-in list applies.
  43: {
    _id: 'conf-unmarked',
    _type: 'conference',
    title: 'Unmarked',
    organization: { _type: 'reference', _ref: 'org-platform' },
    organizers: [ref('sp-una')],
  },
}

function buyer(ticketName: string, email = 'ada@example.com') {
  return {
    id: 1,
    crm: {
      id: 2,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: { email },
    },
    ticket: { id: 3, name: ticketName, type: 'regular' },
    isPaid: true,
  }
}

/** A signed order-created delivery for `eventId` with one ticket per name. */
function sale(ticketNames: string[], eventId = 42, secret = SECRET) {
  const data = {
    id: 1,
    eventId,
    users: ticketNames.map((name) => buyer(name)),
    orderContact: {
      crm: {
        id: 9,
        firstName: 'Order',
        lastName: 'Contact',
        email: { email: 'order@example.com' },
      },
    },
  }
  const signature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(data))
    .digest('hex')
  return POST(
    new NextRequest('http://localhost:3000/api/webhooks/checkin/ticket-sold', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'checkin-signature': signature,
      },
      body: JSON.stringify({
        payloadId: 'p-1',
        event: 'event-order-created',
        dataType: 'order',
        data,
      }),
    }),
  )
}

const notifications = () => h.store.ofType('notification')
const summary = () =>
  notifications().map((doc) => ({
    recipient: (doc.recipient as { _ref: string })._ref,
    conference: (doc.conference as { _ref: string })._ref,
    type: doc.notificationType,
    title: doc.title,
    link: doc.link,
  }))

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
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  h.tasks.length = 0
  h.store.reset(Object.values(CONFERENCES))
  __resetNotSetNoticeMemo()

  vi.stubEnv('CHECKIN_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
  stubPlatformTicketingAccount()
  h.getOrganizationById.mockResolvedValue({
    _id: 'org-platform',
    name: 'Platform',
    slug: 'platform-org',
    plan: 'pro',
  })
  h.getTenant.mockImplementation(async (eventId: number) => {
    const conference = CONFERENCES[eventId]
    return conference
      ? {
          tenant: {
            _id: conference._id,
            organization: conference.organization,
            ticketingProvider: null,
          },
          error: null,
        }
      : { tenant: null, error: null }
  })
  h.getConference.mockImplementation(async (eventId: number) => ({
    conference: CONFERENCES[eventId] ?? null,
    error: null,
  }))
  h.sendWorkshop.mockResolvedValue({ data: { emailId: 'em-1' }, error: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('a sale of a not-set ticket type', () => {
  it('writes one notification per organizer, naming the type and linking to the workshops page', async () => {
    const response = await sale(['Early Bird'])
    await afterResponse()

    expect(response.status).toBe(200)
    expect(summary()).toEqual([
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

  it('writes none for a second sale of the same type', async () => {
    await sale(['Early Bird'])
    await afterResponse()
    await sale(['Early Bird', 'early bird '])
    await afterResponse()

    expect(h.store.commits).toHaveLength(1)
    expect(notifications()).toHaveLength(2)
  })

  it('raises a burst for one type once: one task, one read, one write', async () => {
    // Three deliveries arrive before any after-response work has run.
    await sale(['Early Bird'])
    await sale(['Early Bird'])
    await sale(['Early Bird'])
    expect(h.tasks).toHaveLength(1)

    await afterResponse()

    expect(h.store.queries).toHaveLength(1)
    expect(h.store.commits).toHaveLength(1)
    expect(notifications()).toHaveLength(2)
  })

  it('writes its own for a different not-set type, in the same order or a later one', async () => {
    await sale(['Early Bird', 'Late Bird'])
    await afterResponse()
    await sale(['Group'])
    await afterResponse()

    expect(notifications().map((doc) => doc.title)).toEqual([
      '“Early Bird” needs a workshop decision',
      '“Early Bird” needs a workshop decision',
      '“Late Bird” needs a workshop decision',
      '“Late Bird” needs a workshop decision',
      '“Group” needs a workshop decision',
      '“Group” needs a workshop decision',
    ])
  })

  it('writes none when a restarted process sees the same type sold again', async () => {
    await sale(['Early Bird'])
    await afterResponse()
    const before = structuredClone(notifications())

    __resetNotSetNoticeMemo()
    await sale(['Early Bird'])
    await afterResponse()

    // The restarted process did try: the document ids are what stopped it.
    expect(h.store.commits).toHaveLength(2)
    expect(notifications()).toEqual(before)
  })

  it('reads the organizers once and writes once, however many sales follow', async () => {
    for (let delivery = 0; delivery < 4; delivery++) {
      await sale(['Early Bird'])
      await afterResponse()
    }

    expect(h.store.queries).toHaveLength(1)
    expect(h.store.commits).toHaveLength(1)
  })

  it('says in the log what it raised, for which conference and from where', async () => {
    await sale(['Early Bird', 'Late Bird'])
    await afterResponse()

    expect(console.info).toHaveBeenCalledWith(
      'workshop.ticket-type.not-set: raised',
      {
        conferenceId: 'conf-a',
        typeNames: ['Early Bird', 'Late Bird'],
        source: 'ticket-sold',
      },
    )
  })

  it('sends nothing to organizers of another conference', async () => {
    await sale(['Early Bird'])
    await afterResponse()

    const recipients = summary().map((item) => item.recipient)
    expect(recipients).toEqual(['sp-anna', 'sp-arne'])
    // `sp-former` organizes an earlier edition, `sp-una` another conference.
    expect(recipients).not.toContain('sp-former')
    expect(recipients).not.toContain('sp-una')

    // And the same type name sold for the earlier edition is that edition's.
    await sale(['Early Bird'], 41)
    await afterResponse()
    expect(
      summary()
        .filter((item) => item.conference === 'conf-a-2025')
        .map((item) => item.recipient),
    ).toEqual(['sp-anna', 'sp-former'])
  })
})

describe('how much one delivery can cost', () => {
  const types = (count: number, from = 0) =>
    Array.from({ length: count }, (_, index) => `Type ${from + index}`)
  const typesWritten = () => [
    ...new Set(
      notifications().map((doc) =>
        String(doc.title).replace(/^“(.*)” needs a workshop decision$/, '$1'),
      ),
    ),
  ]

  it('reads the organizers once and writes once for several types in one delivery', async () => {
    await sale(types(4))
    await afterResponse()

    expect(h.store.queries).toHaveLength(1)
    expect(h.store.commits).toHaveLength(1)
    expect(typesWritten()).toEqual(types(4))
    expect(notifications()).toHaveLength(4 * 2)
  })

  it('writes exactly the cap from a delivery that names more, and leaves the rest for a later one', async () => {
    expect(MAX_TYPES_PER_CALL).toBe(10)

    await sale(types(25))
    await afterResponse()

    expect(h.store.queries).toHaveLength(1)
    expect(h.store.commits).toHaveLength(1)
    expect(typesWritten()).toEqual(types(10))

    // The same order again: the next ten, then the last five.
    await sale(types(25))
    await afterResponse()
    expect(typesWritten()).toEqual(types(20))

    await sale(types(25))
    await afterResponse()
    expect(typesWritten()).toEqual(types(25))
    expect(h.store.commits).toHaveLength(3)
  })

  it('stops raising for a conference at its limit, says so once, and still raises for another', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(MAX_TYPES_PER_CONFERENCE).toBe(100)

    // 2,000 distinct names, signed, in deliveries of 200.
    for (let delivery = 0; delivery < 10; delivery++) {
      await sale(types(200, delivery * 200))
      await afterResponse()
    }

    // Ten deliveries raised ten types each, and that is all this process
    // spends on the conference: ten reads, ten transactions, 100 types.
    expect(h.store.queries).toHaveLength(10)
    expect(h.store.commits).toHaveLength(10)
    expect(typesWritten()).toHaveLength(100)

    await sale(types(200, 5_000))
    await afterResponse()
    expect(h.store.commits).toHaveLength(10)
    expect(
      vi
        .mocked(console.warn)
        .mock.calls.filter(([line]) => String(line).includes('raises no more')),
    ).toEqual([
      [
        'workshop.ticket-type.not-set: 100 types raised for one conference; this process raises no more for it until they expire',
        { conferenceId: 'conf-a' },
      ],
    ])

    // The earlier edition is another conference with its own room.
    await sale(['Early Bird'], 41)
    await afterResponse()
    expect(h.store.commits).toHaveLength(11)
  })

  it('has room for a conference again once its claims have expired', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const T0 = new Date('2026-10-12T08:00:00Z').getTime()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)

    for (let delivery = 0; delivery < 10; delivery++) {
      await sale(types(10, delivery * 10))
      await afterResponse()
    }
    expect(h.store.commits).toHaveLength(10)

    // Full: nothing more, a moment before the first claims expire.
    vi.setSystemTime(T0 + MEMO_LIFETIME_MS - 1)
    await sale(types(10, 5_000))
    expect(h.tasks).toEqual([])

    vi.setSystemTime(T0 + MEMO_LIFETIME_MS)
    await sale(types(10, 5_000))
    await afterResponse()
    expect(h.store.commits).toHaveLength(11)
    expect(typesWritten().slice(-10)).toEqual(types(10, 5_000))
  })
})

describe('a sale that raises nothing', () => {
  it('raises nothing for a conference that exists only as a draft, and still sends the email', async () => {
    const response = await sale(['Workshop day', 'Early Bird'], 44)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      message: 'Processed 2 ticket(s), sent 1 email(s)',
      results: [{ email: 'ada@example.com', success: true, emailId: 'em-1' }],
    })
    expect(h.tasks).toEqual([])
  })

  it('writes none for a type that grants access or one that was answered no', async () => {
    await sale(['Workshop day', 'Student'])
    await afterResponse()

    expect(h.tasks).toEqual([])
    expect(notifications()).toEqual([])
  })

  it('writes none on a conference that has marked nothing', async () => {
    const response = await sale(['Early Bird'], 43)
    await afterResponse()

    expect(response.status).toBe(200)
    expect(notifications()).toEqual([])
    expect(h.store.queries).toEqual([])
  })

  it('raises nothing when the conference does not have workshops', async () => {
    h.getOrganizationById.mockResolvedValue({
      _id: 'org-platform',
      name: 'Platform',
      slug: 'platform-org',
      plan: 'free',
    })

    const response = await sale(['Early Bird'])

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      message:
        'Processed 1 ticket(s), sent 0 email(s) (workshops not enabled for this organization)',
      results: [],
    })
    expect(h.tasks).toEqual([])
    expect(h.store.queries).toEqual([])
  })

  it('raises nothing for a delivery whose signature does not verify', async () => {
    const response = await sale(['Early Bird'], 42, 'not-the-secret')

    expect(response.status).toBe(401)
    expect(h.tasks).toEqual([])
    expect(h.store.queries).toEqual([])
  })
})

describe('the answer to Checkin', () => {
  const ANSWER = {
    success: true,
    message: 'Processed 2 ticket(s), sent 1 email(s)',
    results: [{ email: 'ada@example.com', success: true, emailId: 'em-1' }],
  }

  it('is given before the notification is written', async () => {
    const response = await sale(['Workshop day', 'Early Bird'])

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(ANSWER)
    expect(h.store.commits).toEqual([])
    expect(h.tasks).toHaveLength(1)
  })

  it('is the same when the notification cannot be written', async () => {
    h.store.failWrites()

    const response = await sale(['Workshop day', 'Early Bird'])
    await afterResponse()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(ANSWER)
    expect(h.sendWorkshop).toHaveBeenCalledTimes(1)
    // The write was attempted, and it failed.
    expect(console.error).toHaveBeenCalledWith(
      'Failed to create once-only notifications:',
      {
        conferenceId: 'conf-a',
        typeNames: ['Early Bird'],
        source: 'ticket-sold',
      },
      expect.any(Error),
    )

    // And so is the next delivery's.
    const next = await sale(['Workshop day', 'Early Bird'])
    expect(next.status).toBe(200)
    expect(await next.json()).toEqual(ANSWER)
  })

  it('is the same when the organizers cannot be read, and nothing is written', async () => {
    const response = await sale(['Workshop day', 'Early Bird'])
    // Only the read made after the response fails.
    const failure = new Error('sanity is down')
    h.store.failReads(failure)
    await afterResponse()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(ANSWER)
    // The read was attempted, it failed, and it went no further.
    expect(console.error).toHaveBeenCalledWith(
      'workshop.ticket-type.not-set: failed',
      {
        conferenceId: 'conf-a',
        typeNames: ['Early Bird'],
        source: 'ticket-sold',
      },
      failure,
    )
    expect(h.store.commits).toEqual([])
  })
})
