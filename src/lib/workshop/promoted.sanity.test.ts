/**
 * @vitest-environment node
 *
 * The promotion emails (#1357): owed by the write that promotes (see
 * `seats.sanity.test.ts`), paid by `deliverPromotionEmails`, at most once per
 * promotion, whoever runs it and however many times. Asserted on the STORED
 * DOCUMENTS and on the email boundary.
 *
 * REAL: the module under test and the writes (the real client's serialized
 * patches applied by `@sanity/mutator`). MODELLED: the refusal of an
 * `ifRevisionID` mismatch (a 409), and a reply lost after a commit landed
 * (`afterNextCommit` throwing). See `__tests__/helpers/versionedSanityStore.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store ??= createVersionedSanityStore()
  return h.store.clients
})
const email = vi.hoisted(() => ({
  sendBasicWorkshopConfirmation: vi.fn<
    (request: { userEmail: string }) => Promise<{ data: { emailId: string } }>
  >(async () => ({ data: { emailId: 'e-1' } })),
}))
vi.mock('@/lib/email/workshop', () => email)
// The pause between two sends (Resend's rate limit): recorded, not waited.
const pacing = vi.hoisted(() => ({
  delay: vi.fn<(ms: number) => Promise<void>>(async () => {}),
}))
vi.mock('@/lib/email/config', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  delay: pacing.delay,
}))

import { deliverDuePromotionEmails, deliverPromotionEmails } from './promoted'
import { EMAIL_CONFIG } from '@/lib/email/config'
import { changeCapacity, confirmSignups, freeSeat } from './seats'

const store = () => h.store!
const CONF = 'conf-a'
const WORKSHOP = 'talk-k8s'
const ref = (id: string) => ({ _type: 'reference', _ref: id })

const conference = (id = CONF, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  _type: 'conference',
  _rev: 'r0',
  title: `Conference ${id}`,
  organizer: `Org of ${id}`,
  contactEmail: `hello@${id}.example`,
  domains: [`${id}.example`],
  organization: ref(`org-of-${id}`),
  ...overrides,
})
const workshop = (overrides: Record<string, unknown> = {}) => ({
  _id: WORKSHOP,
  _type: 'talk',
  _rev: 'r0',
  conference: ref(CONF),
  title: 'Kubernetes hands-on',
  capacity: 1,
  status: 'confirmed',
  format: 'workshop_120',
  ...overrides,
})
function signup(
  n: number,
  status: 'confirmed' | 'waitlist',
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: `signup-${n}`,
    _type: 'workshopSignup',
    _rev: 'r0',
    _createdAt: `2026-10-01T10:00:0${n}Z`,
    userWorkOSId: `user_${n}`,
    userEmail: `person${n}@example.com`,
    userName: `Person ${n}`,
    workshop: ref(WORKSHOP),
    conference: ref(CONF),
    status,
    ...overrides,
  }
}
/** The addresses emailed, in order. */
const emailed = () =>
  email.sendBasicWorkshopConfirmation.mock.calls.map(([to]) => to.userEmail)
/** A promotion of sign-ups 2 and 3 into a workshop with one seat taken. */
async function promoteTwo() {
  store().reset([
    conference(),
    workshop(),
    signup(1, 'confirmed'),
    signup(2, 'waitlist'),
    signup(3, 'waitlist'),
  ])
  const outcome = await changeCapacity(WORKSHOP, CONF, 3)
  expect(outcome).toEqual({ promoted: ['signup-2', 'signup-3'] })
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await promoteTwo()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a promotion whose emails are owed', () => {
  it('emails each promoted sign-up once, in the name of its own conference, and the stored sign-up owes no more', async () => {
    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(emailed()).toEqual(['person2@example.com', 'person3@example.com'])
    expect(email.sendBasicWorkshopConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: 'Person 2',
        status: 'confirmed',
        workshopTitle: 'Kubernetes hands-on',
        conference: expect.objectContaining({
          _id: CONF,
          contactEmail: 'hello@conf-a.example',
          organization: ref('org-of-conf-a'),
        }),
      }),
    )
    for (const id of ['signup-2', 'signup-3']) {
      const doc = store().doc(id)!
      expect(doc.status).toBe('confirmed')
      expect(doc).not.toHaveProperty('promotionEmailDue')
      expect(doc.promotionEmailClaim).toEqual(expect.any(String))
    }
  })

  it('a second run over the same sign-ups (the inline send, then the cron) emails nobody again', async () => {
    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])
    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(emailed()).toEqual(['person2@example.com', 'person3@example.com'])
  })

  it('two runs at once (the inline send and the cron racing): each sign-up is emailed once', async () => {
    await Promise.all([
      deliverPromotionEmails(CONF, ['signup-2', 'signup-3']),
      deliverPromotionEmails(CONF, ['signup-3', 'signup-2']),
    ])

    expect([...emailed()].sort()).toEqual([
      'person2@example.com',
      'person3@example.com',
    ])
  })

  it('the reply to the claim lost (the claim landed): the sign-up is still emailed, once', async () => {
    // The first commit of the run is the claim of signup-2: applied, then
    // the connection drops.
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })

    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])
    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(emailed()).toEqual(['person2@example.com', 'person3@example.com'])
    expect(store().doc('signup-2')).not.toHaveProperty('promotionEmailDue')
  })

  it('the reply to the claim lost, and the sign-up moved back to the waitlist before the re-read: not emailed', async () => {
    // The claim lands, then a free lands, then the connection drop is
    // noticed: the re-read shows this run's token on a waiting sign-up.
    store().afterNextCommit(async () => {
      await freeSeat('signup-2', 'waitlist')
      throw new Error('socket hang up')
    })

    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(emailed()).toEqual(['person3@example.com'])
    expect(store().doc('signup-2')).toMatchObject({ status: 'waitlist' })
  })

  it('the reply to the claim lost, and the re-read failing too: not emailed, and logged as uncertain with the id', async () => {
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    vi.spyOn(
      store().clients.clientWrite as { getDocument: () => unknown },
      'getDocument',
    ).mockRejectedValueOnce(new Error('503'))

    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(emailed()).toEqual(['person3@example.com'])
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('uncertain'),
      ['signup-2'],
      expect.anything(),
    )
  })

  it('a claim refused for another reason, and the re-read showing another claim: not emailed by this run', async () => {
    // A claim that fails before it lands, and lands as someone else's.
    store().afterNextCommit(() => {
      store().put({
        ...store().doc('signup-2')!,
        promotionEmailClaim: 'theirs',
      })
      throw new Error('socket hang up')
    })

    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(emailed()).toEqual(['person3@example.com'])
  })
})

describe('what is not emailed', () => {
  it('a promoted sign-up moved back to the waitlist before the email went out: not emailed, and owes nothing', async () => {
    await freeSeat('signup-2', 'waitlist')

    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(emailed()).toEqual(['person3@example.com'])
    expect(store().doc('signup-2')).toMatchObject({ status: 'waitlist' })
    expect(store().doc('signup-2')).not.toHaveProperty('promotionEmailClaim')
  })

  it('one deleted before the email went out: not emailed, and the rest are', async () => {
    await freeSeat('signup-2', 'delete')

    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(emailed()).toEqual(['person3@example.com'])
  })

  it('one still owed but no longer confirmed (edited outside the app): the debt is settled, no email', async () => {
    store().put({ ...store().doc('signup-2')!, status: 'waitlist' })

    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(emailed()).toEqual(['person3@example.com'])
    expect(store().doc('signup-2')).not.toHaveProperty('promotionEmailDue')
  })

  it('a sign-up that owes no email (confirmed, never promoted) is not emailed, whatever ids it is called with', async () => {
    await deliverPromotionEmails(CONF, ['signup-1', 'signup-2'])

    expect(emailed()).toEqual(['person2@example.com'])
  })

  it("another conference's sign-up is not emailed in this conference's name, and still owes its own", async () => {
    store().put(
      signup(9, 'confirmed', {
        conference: ref('conf-b'),
        promotionEmailDue: true,
      }),
    )

    await deliverPromotionEmails(CONF, ['signup-9', 'signup-2'])

    expect(emailed()).toEqual(['person2@example.com'])
    expect(store().doc('signup-9')?.promotionEmailDue).toBe(true)
  })

  it('no ids: no read, no write, no email', async () => {
    const reads = store().reads.length
    await deliverPromotionEmails(CONF, [])
    expect(store().reads).toHaveLength(reads)
    expect(emailed()).toEqual([])
  })
})

describe('what fails', () => {
  it('a conference that cannot be read: nothing is claimed (the debt stays for the next run), and the ids are logged', async () => {
    store().remove(CONF)

    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(emailed()).toEqual([])
    expect(store().doc('signup-2')?.promotionEmailDue).toBe(true)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('promotion emails not sent'),
      ['signup-2', 'signup-3'],
      expect.anything(),
    )
  })

  it('a failed send is logged with the sign-up it was for, and only that one; the debt is settled (sent by hand)', async () => {
    email.sendBasicWorkshopConfirmation
      .mockResolvedValueOnce({ data: { emailId: 'e-1' } })
      .mockResolvedValueOnce({
        error: { message: 'provider down' },
      } as never)

    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('promotion emails not sent'),
      ['signup-3'],
      [{ message: 'provider down' }],
    )
    expect(store().doc('signup-3')).not.toHaveProperty('promotionEmailDue')
  })

  it('never throws into the caller: a client that fails every read is logged, not raised', async () => {
    store().failReadsThat(() => true)
    vi.spyOn(
      store().clients.clientWrite as { getDocuments: () => unknown },
      'getDocuments',
    ).mockRejectedValue(new Error('503'))

    await expect(
      deliverPromotionEmails(CONF, ['signup-2']),
    ).resolves.toBeDefined()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('promotion emails not sent'),
      ['signup-2'],
      expect.anything(),
    )
  })
})

describe('the hourly backstop (the cron), over every conference', () => {
  it('a capacity change whose reply was lost after the write landed: every promoted sign-up is still emailed, once', async () => {
    store().reset([
      conference(),
      workshop(),
      signup(1, 'confirmed'),
      signup(2, 'waitlist'),
      signup(3, 'waitlist'),
    ])
    // The write lands; the connection drops before the reply. The request
    // fails, and its own send never runs.
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    await expect(changeCapacity(WORKSHOP, CONF, 3)).rejects.toThrow(
      'socket hang up',
    )
    expect(store().doc('signup-2')).toMatchObject({
      status: 'confirmed',
      promotionEmailDue: true,
    })
    expect(emailed()).toEqual([])

    const first = await deliverDuePromotionEmails()
    const second = await deliverDuePromotionEmails()

    expect(first).toMatchObject({ found: 2, emailed: 2 })
    expect(second).toMatchObject({ found: 0, emailed: 0 })
    expect(emailed()).toEqual(['person2@example.com', 'person3@example.com'])
    expect(store().doc('signup-2')).not.toHaveProperty('promotionEmailDue')
    expect(store().doc('signup-3')).not.toHaveProperty('promotionEmailDue')
  })

  it("emails each sign-up in its OWN conference's name, over every conference at once", async () => {
    store().put(conference('conf-b'))
    store().put(
      workshop({ _id: 'talk-b', conference: ref('conf-b'), title: 'B-shop' }),
    )
    store().put(
      signup(9, 'confirmed', {
        workshop: ref('talk-b'),
        conference: ref('conf-b'),
        promotionEmailDue: true,
      }),
    )

    const outcome = await deliverDuePromotionEmails()

    expect(outcome).toMatchObject({ found: 3, emailed: 3, conferences: 2 })
    const calls = email.sendBasicWorkshopConfirmation.mock.calls.map(
      ([req]) => [
        req.userEmail,
        (req as { conference?: { _id: string } }).conference?._id,
        (req as { workshopTitle?: string }).workshopTitle,
      ],
    )
    expect(calls).toContainEqual(['person9@example.com', 'conf-b', 'B-shop'])
    expect(calls).toContainEqual([
      'person2@example.com',
      CONF,
      'Kubernetes hands-on',
    ])
  })

  it('pays at most `limit` per run; the rest wait for the next', async () => {
    expect(await deliverDuePromotionEmails({ limit: 1 })).toMatchObject({
      found: 1,
      emailed: 1,
    })
    expect(emailed()).toHaveLength(1)

    expect(await deliverDuePromotionEmails({ limit: 1 })).toMatchObject({
      found: 1,
      emailed: 1,
    })
    expect(emailed()).toHaveLength(2)
  })

  it('leaves a sign-up with no conference out of the sweep, so it cannot hold a place in the window every hour', async () => {
    store().put(
      signup(8, 'confirmed', {
        conference: undefined,
        promotionEmailDue: true,
      }),
    )

    expect(await deliverDuePromotionEmails()).toMatchObject({ found: 2 })
  })

  it('leaves a sign-up whose conference reference dangles out of the sweep, so it cannot hold a place in the window every hour', async () => {
    store().put(
      signup(8, 'confirmed', {
        conference: ref('conf-gone'),
        promotionEmailDue: true,
      }),
    )

    expect(await deliverDuePromotionEmails()).toMatchObject({ found: 2 })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('does not pay a draft (Studio) of a sign-up', async () => {
    store().put(
      signup(7, 'confirmed', {
        _id: 'drafts.signup-7',
        promotionEmailDue: true,
      }),
    )

    const outcome = await deliverDuePromotionEmails()

    expect(outcome).toMatchObject({ found: 2 })
    expect(emailed()).not.toContain('person7@example.com')
  })
})

describe('a promoted sign-up moved back in Studio, then confirmed by an organizer', () => {
  const movedBackInStudio = () =>
    store().put({ ...store().doc('signup-2')!, status: 'waitlist' })

  it('within the guard’s memory (the confirm reports it as not newly confirmed, so the router tells no one): the cron emails it, once', async () => {
    movedBackInStudio()
    const outcome = await confirmSignups(WORKSHOP, CONF, ['signup-2'])
    expect(outcome).toMatchObject({ newlyConfirmed: [] })

    await deliverDuePromotionEmails()
    await deliverDuePromotionEmails()

    expect(emailed().filter((e) => e === 'person2@example.com')).toHaveLength(1)
  })

  it('after the guard has forgotten it (the confirm reports it newly confirmed, and the router tells it): the cron sends nothing for it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T09:16:00Z'))
    movedBackInStudio()
    const outcome = await confirmSignups(WORKSHOP, CONF, ['signup-2'])
    expect(outcome).toMatchObject({ newlyConfirmed: ['signup-2'] })

    await deliverDuePromotionEmails()

    expect(emailed()).not.toContain('person2@example.com')
  })
})

describe('the pace of the sends (Resend allows about two requests a second)', () => {
  it('sends one at a time: the next send does not start before the previous one has resolved, with the rate-limit pause between them', async () => {
    const events: string[] = []
    let release: () => void = () => {}
    email.sendBasicWorkshopConfirmation.mockImplementation(async (req) => {
      events.push(`start ${req.userEmail}`)
      if (req.userEmail === 'person2@example.com') {
        await new Promise<void>((r) => (release = r))
      }
      events.push(`end ${req.userEmail}`)
      return { data: { emailId: 'e' } }
    })
    const run = deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])
    await new Promise((r) => setTimeout(r, 20))
    expect(events).toEqual(['start person2@example.com'])
    release()
    await run

    expect(events).toEqual([
      'start person2@example.com',
      'end person2@example.com',
      'start person3@example.com',
      'end person3@example.com',
    ])
    expect(pacing.delay).toHaveBeenCalledTimes(1)
    expect(pacing.delay).toHaveBeenCalledWith(EMAIL_CONFIG.RATE_LIMIT_DELAY)
  })

  it('claims each sign-up right before its own send: while one is being sent, the ones after it are still owed (a run that stops there loses nothing)', async () => {
    const dueDuringSend: Record<string, unknown> = {}
    email.sendBasicWorkshopConfirmation.mockImplementation(async (req) => {
      if (req.userEmail === 'person2@example.com') {
        dueDuringSend.signup3 = store().doc('signup-3')?.promotionEmailDue
      }
      return { data: { emailId: 'e' } }
    })

    await deliverPromotionEmails(CONF, ['signup-2', 'signup-3'])

    expect(dueDuringSend).toEqual({ signup3: true })
    expect(emailed()).toEqual(['person2@example.com', 'person3@example.com'])
  })
})
