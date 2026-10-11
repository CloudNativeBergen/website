/**
 * @vitest-environment node
 *
 * An attendee's cancel REMOVES the sign-up; an organizer's "Move to waitlist"
 * keeps it and frees the seat (#1331, `docs/WORKSHOP_TICKETS_SPEC.md` §6).
 *
 * NOTHING IS MOCKED BETWEEN THE CALLER AND THE STORED DOCUMENT. The real router
 * calls the real `@/lib/workshop/sanity`; its reads run `groq-js` over a
 * dataset and its writes change that dataset (patches through Sanity's own
 * `@sanity/mutator`). So the assertions are on what Sanity would hold
 * afterwards: whether the document exists, its stored `status`, and the
 * workshop's confirmed count as `checkWorkshopCapacity` reads it.
 *
 * The guards (who may cancel what) are covered with mocks in
 * `workshop.test.ts` and `tenancy.writes.more.test.ts`. They are repeated here
 * against stored data because a refusal only matters if nothing was written.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stubPlatformTicketingAccount } from '../../helpers/ticketingSecrets'
import { createWorkshopCaller, createAdminCaller } from '../../helpers/trpc'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  /** Every write the data layer issued, in order: `delete:<id>`, `patch:<id>`, `create:<id>`. */
  writes: [] as string[],
  created: 0,
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
    await (await evaluate(parse(query), { dataset: h.dataset, params })).get()

  return {
    // The live conference document (ticket-type roles): none, so the built-in
    // list decides who holds a workshop ticket.
    clientReadUncached: { fetch: async () => null },
    clientWrite: {
      fetch,
      delete: async (id: string) => {
        h.writes.push(`delete:${id}`)
        const index = h.dataset.findIndex((d) => d._id === id)
        if (index !== -1) h.dataset.splice(index, 1)
        return { results: [] }
      },
      patch: (id: string) => {
        const patch = client.patch(id)
        patch.commit = (async () => {
          h.writes.push(`patch:${id}`)
          const index = h.dataset.findIndex((d) => d._id === id)
          if (index === -1) throw new Error(`no such document: ${id}`)
          const next = new Mutation({
            mutations: [{ patch: patch.serialize() }],
          }).apply(structuredClone(h.dataset[index]))
          if (next) h.dataset[index] = next
          return {}
        }) as typeof patch.commit
        return patch
      },
      transaction: () => {
        const queued: Record<string, unknown>[] = []
        return {
          create(doc: Record<string, unknown>) {
            queued.push(doc)
            return this
          },
          async commit() {
            const documentIds = queued.map((doc) => {
              h.created += 1
              const _id = `signup-new-${h.created}`
              // One minute apart, in the order they were written: the
              // promotion sorts on this.
              const at = new Date(
                Date.UTC(2026, 8, 1, 12, h.created),
              ).toISOString()
              h.dataset.push({ ...doc, _id, _createdAt: at, _updatedAt: at })
              h.writes.push(`create:${_id}`)
              return _id
            })
            return { documentIds }
          },
        }
      },
    },
  }
})

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () => ({
    conference: {
      _id: 'conf-1',
      title: 'CNDN',
      organization: { _type: 'reference', _ref: 'org-test' },
      workshopRegistrationStart: null,
      workshopRegistrationEnd: null,
    },
    domain: 'cndn.no',
    error: null,
  })),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: vi.fn(async () => ({
    _id: 'org-test',
    name: 'Platform',
    slug: 'platform-org',
    plan: 'pro',
  })),
  getOrganizationRefForCurrentConference: vi.fn(async () => 'org-test'),
}))

const ticketing = vi.hoisted(() => ({
  fetchEventTickets: vi.fn(),
  resolve: vi.fn(),
}))

vi.mock('@/lib/tickets/provider', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tickets/provider')>()),
  resolveTicketingProvider: ticketing.resolve,
}))

const email = vi.hoisted(() => ({
  sendBasicWorkshopConfirmation: vi.fn(async (_: { userEmail: string }) => {}),
}))

vi.mock('@/lib/email/workshop', () => ({
  sendBasicWorkshopConfirmation: email.sendBasicWorkshopConfirmation,
}))

import { checkWorkshopCapacity } from '@/lib/workshop/sanity'
import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'

const WORKSHOP = 'ws-1'
const FOREIGN_WORKSHOP = 'ws-foreign'

const ADA = { id: 'workos-ada', email: 'ada@example.com', name: 'Ada' }
const BOB = { id: 'workos-bob', email: 'bob@example.com', name: 'Bob' }
const CY = { id: 'workos-cy', email: 'cy@example.com', name: 'Cy' }

const signupInput = {
  experienceLevel: 'beginner' as const,
  operatingSystem: 'linux' as const,
  workshop: { _type: 'reference' as const, _ref: WORKSHOP },
}

const ref = (_ref: string) => ({ _type: 'reference', _ref })

function seed(capacity: number) {
  h.dataset.length = 0
  h.dataset.push(
    { _id: 'conf-1', _type: 'conference', name: 'CNDN' },
    { _id: 'conf-2', _type: 'conference', name: 'Another tenant' },
    {
      _id: WORKSHOP,
      _type: 'talk',
      title: 'Kubernetes 101',
      format: 'workshop_120',
      capacity,
      conference: ref('conf-1'),
    },
    {
      _id: FOREIGN_WORKSHOP,
      _type: 'talk',
      title: 'Their workshop',
      format: 'workshop_120',
      capacity: 10,
      conference: ref('conf-2'),
    },
  )
}

/** A sign-up as stored, placed directly: for what no procedure of ours could write. */
function store(doc: Partial<Doc> & { _id: string }) {
  h.dataset.push({
    _type: 'workshopSignup',
    status: 'confirmed',
    workshop: ref(WORKSHOP),
    conference: ref('conf-1'),
    _createdAt: '2026-08-01T00:00:00.000Z',
    ...doc,
  })
}

const stored = (id: string) => h.dataset.find((d) => d._id === id) as Doc
const signupsOf = (user: { id: string }) =>
  h.dataset.filter(
    (d) => d._type === 'workshopSignup' && d.userWorkOSId === user.id,
  ) as Doc[]

async function signUp(user: typeof ADA) {
  const result = await createWorkshopCaller(user).workshop.signup(signupInput)
  return result.data._id
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetRedeemedCache()
  h.writes.length = 0
  h.created = 0
  seed(2)
  ticketing.fetchEventTickets.mockResolvedValue(
    [ADA, BOB, CY].map((user, i) => ({
      id: i + 1,
      order_id: i + 1,
      category: 'Workshop + Conference (2 days)',
      crm: { email: user.email },
    })),
  )
  ticketing.resolve.mockResolvedValue({
    configured: true,
    provider: { fetchEventTickets: ticketing.fetchEventTickets },
    eventRef: { customerId: 1, eventId: 2 },
  })
  vi.stubEnv('PLATFORM_ORG_ID', 'org-test')
  stubPlatformTicketingAccount()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('an attendee cancels a workshop seat', () => {
  it('removes the sign-up: the document is deleted, its status is never patched', async () => {
    const id = await signUp(ADA)
    expect(stored(id)).toMatchObject({ status: 'confirmed' })
    h.writes.length = 0

    const result = await createWorkshopCaller(ADA).workshop.cancelSignup({
      signupId: id,
    })

    expect(result.success).toBe(true)
    expect(h.writes).toEqual([`delete:${id}`])
    expect(stored(id)).toBeUndefined()
    expect(signupsOf(ADA)).toEqual([])
  })
})

describe('an attendee cancels a workshop seat: what is refused', () => {
  it('refuses a cancel of someone else’s sign-up, and deletes nothing', async () => {
    // In THIS conference and on a workshop of it, so only the ownership check
    // stands between Bob and Ada's seat.
    const id = await signUp(ADA)
    h.writes.length = 0

    await expect(
      createWorkshopCaller(BOB).workshop.cancelSignup({ signupId: id }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'You can only cancel your own workshop signup',
    })

    expect(h.writes).toEqual([])
    expect(stored(id)).toMatchObject({
      status: 'confirmed',
      userWorkOSId: ADA.id,
    })
  })

  it('refuses a cancel of a sign-up in another conference, and deletes nothing', async () => {
    // Ada's OWN sign-up, at another tenant: the ownership check would let it
    // through, so only the conference predicate stands in the way.
    store({
      _id: 'signup-elsewhere',
      userWorkOSId: ADA.id,
      userEmail: ADA.email,
      workshop: ref(FOREIGN_WORKSHOP),
      conference: ref('conf-2'),
    })

    await expect(
      createWorkshopCaller(ADA).workshop.cancelSignup({
        signupId: 'signup-elsewhere',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Signup not found' })

    expect(h.writes).toEqual([])
    expect(stored('signup-elsewhere')).toMatchObject({ status: 'confirmed' })
  })
})

describe('after an attendee’s cancel', () => {
  it('the attendee has no sign-up for the workshop: not confirmed, not waitlisted', async () => {
    const id = await signUp(ADA)
    await createWorkshopCaller(ADA).workshop.cancelSignup({ signupId: id })

    // What the portal draws "Your Workshops" from.
    const mine = await createWorkshopCaller(ADA).workshop.getMySignups()

    expect(mine.data).toEqual([])
  })

  it('the attendee can sign up again and gets the free seat', async () => {
    seed(1)
    const first = await signUp(ADA)
    await createWorkshopCaller(ADA).workshop.cancelSignup({ signupId: first })

    const again = await createWorkshopCaller(ADA).workshop.signup(signupInput)

    expect(again.success).toBe(true)
    expect(signupsOf(ADA)).toHaveLength(1)
    expect(signupsOf(ADA)[0]).toMatchObject({
      _id: again.data._id,
      status: 'confirmed',
    })
    expect(again.data._id).not.toBe(first)
  })

  it('a capacity increase confirms and emails the people waiting, not the one who cancelled', async () => {
    // Two seats, both taken; Ada was first in, Cy is waiting.
    const ada = await signUp(ADA)
    await signUp(BOB)
    const cy = await signUp(CY)
    expect(stored(cy)).toMatchObject({ status: 'waitlist' })
    await createWorkshopCaller(ADA).workshop.cancelSignup({ signupId: ada })
    email.sendBasicWorkshopConfirmation.mockClear()

    // Room for two more. Before #1331 Ada's cancel left her on the waitlist,
    // ahead of Cy, and this confirmed and emailed them both.
    const result = await createAdminCaller().workshop.admin.updateCapacity({
      workshopId: WORKSHOP,
      capacity: 4,
    })

    expect(
      email.sendBasicWorkshopConfirmation.mock.calls.map(
        ([to]) => to.userEmail,
      ),
    ).toEqual([CY.email])
    expect(result.promotedCount).toBe(1)
    expect(stored(cy)).toMatchObject({ status: 'confirmed' })
    expect(signupsOf(ADA)).toEqual([])
  })
})

describe('an organizer moves a confirmed sign-up to the waitlist', () => {
  it('stores `waitlist`, keeps the sign-up and frees the seat', async () => {
    const ada = await signUp(ADA)
    await signUp(BOB)
    expect(await checkWorkshopCapacity(WORKSHOP)).toMatchObject({
      confirmedSignups: 2,
      availableSpots: 0,
    })
    h.writes.length = 0

    const result = await createAdminCaller().workshop.admin.batchCancelSignups({
      signupIds: [ada],
    })

    expect(result.results).toEqual({ succeeded: 1, failed: 0, total: 1 })
    // The procedure's name says cancel; nothing it tells an organizer does.
    expect(result.message).toBe('Moved 1 signup to the waitlist')
    expect(h.writes).toEqual([`patch:${ada}`])
    expect(stored(ada)).toMatchObject({
      status: 'waitlist',
      userWorkOSId: ADA.id,
    })
    expect(await checkWorkshopCapacity(WORKSHOP)).toMatchObject({
      confirmedSignups: 1,
      availableSpots: 1,
    })
  })

  it('refuses a sign-up of another conference, which stays confirmed', async () => {
    store({
      _id: 'signup-elsewhere',
      userWorkOSId: 'workos-stranger',
      userEmail: 'stranger@example.com',
      workshop: ref(FOREIGN_WORKSHOP),
      conference: ref('conf-2'),
    })

    await expect(
      createAdminCaller().workshop.admin.batchCancelSignups({
        signupIds: ['signup-elsewhere'],
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'One or more signups do not belong to this conference',
    })

    expect(h.writes).toEqual([])
    expect(stored('signup-elsewhere')).toMatchObject({ status: 'confirmed' })
  })
})
