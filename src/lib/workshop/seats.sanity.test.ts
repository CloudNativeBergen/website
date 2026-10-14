/**
 * @vitest-environment node
 *
 * Seats of a workshop (#1344): who is confirmed and who waits is decided in
 * the dataset, not in the memory of one server process. Asserted on the
 * STORED DOCUMENTS.
 *
 * REAL: the module under test, the query text (`groq-js`) and the writes (the
 * real client's serialized mutations applied by `@sanity/mutator`).
 * MODELLED: `ifRevisionID` and `create` of a stored id, both refused with a
 * 409 as Sanity does; see `__tests__/helpers/versionedSanityStore.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  // ONE dataset, however many times the module graph is loaded: a second
  // instance of the code under test (below) must share the data and nothing
  // else.
  h.store ??= createVersionedSanityStore()
  return h.store.clients
})

import {
  changeCapacity,
  confirmSignups,
  signUpForWorkshop,
  signupDocumentId,
} from './seats'

const store = () => h.store!
const CONF = 'conf-a'
const WORKSHOP = 'talk-k8s'
const ref = (id: string) => ({ _type: 'reference', _ref: id })

function workshop(overrides: Record<string, unknown> = {}) {
  return {
    _id: WORKSHOP,
    _type: 'talk',
    _rev: 'r0',
    conference: ref(CONF),
    capacity: 3,
    ...overrides,
  }
}

function signup(n: number, status: 'confirmed' | 'waitlist') {
  return {
    _id: `signup-${n}`,
    _type: 'workshopSignup',
    _rev: 'r0',
    _createdAt: `2026-10-01T10:00:0${n}Z`,
    userWorkOSId: `user_existing_${n}`,
    userEmail: `existing${n}@example.com`,
    userName: `Existing ${n}`,
    workshop: ref(WORKSHOP),
    conference: ref(CONF),
    status,
  }
}

const attendee = (n: number) => ({
  userWorkOSId: `user_${n}`,
  userEmail: `person${n}@example.com`,
  userName: `Person ${n}`,
  experienceLevel: 'beginner' as const,
  operatingSystem: 'linux' as const,
  workshopId: WORKSHOP,
  conferenceId: CONF,
})

const storedSignups = () =>
  store()
    .all()
    .filter((d) => d._type === 'workshopSignup' && d.workshop)
const withStatus = (status: string) =>
  storedSignups().filter((d) => d.status === status)

beforeEach(() => {
  store().reset([workshop(), signup(1, 'confirmed')])
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('sign-ups arriving together', () => {
  it('with 2 seats left and 5 arriving at once, exactly 2 are confirmed and 3 wait', async () => {
    const outcomes = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        signUpForWorkshop(attendee(n), { whenFull: 'waitlist' }),
      ),
    )

    // The race ran: every request read before the first one wrote.
    expect(store().events.slice(0, 6)).toEqual([
      'read',
      'read',
      'read',
      'read',
      'read',
      'commit',
    ])
    expect(outcomes.every((o) => 'signup' in o)).toBe(true)
    // The one confirmed before, and two of the five.
    expect(withStatus('confirmed')).toHaveLength(3)
    expect(withStatus('waitlist')).toHaveLength(3)
  })

  it('the same holds when each request is handled by a separate instance of the server code', async () => {
    // Five module graphs, as five server instances would load them: nothing
    // in memory is shared between the competing requests, only the dataset.
    const instances = []
    for (let i = 0; i < 5; i++) {
      vi.resetModules()
      instances.push(await import('./seats'))
    }
    expect(new Set(instances.map((m) => m.signUpForWorkshop)).size).toBe(5)

    await Promise.all(
      instances.map((m, i) =>
        m.signUpForWorkshop(attendee(i + 1), { whenFull: 'waitlist' }),
      ),
    )

    expect(store().events.slice(0, 6)).toEqual([
      'read',
      'read',
      'read',
      'read',
      'read',
      'commit',
    ])
    expect(withStatus('confirmed')).toHaveLength(3)
    expect(withStatus('waitlist')).toHaveLength(3)
  })

  it('with no seat left, all of them wait and none is confirmed', async () => {
    store().reset([workshop({ capacity: 1 }), signup(1, 'confirmed')])

    await Promise.all(
      [1, 2, 3].map((n) =>
        signUpForWorkshop(attendee(n), { whenFull: 'waitlist' }),
      ),
    )

    expect(withStatus('confirmed')).toHaveLength(1)
    expect(withStatus('waitlist')).toHaveLength(3)
  })
})

describe('one person, one sign-up per workshop', () => {
  it('the same sign-up sent twice at once ends with one sign-up, and the second is told so', async () => {
    const outcomes = await Promise.all([
      signUpForWorkshop(attendee(7), { whenFull: 'waitlist' }),
      signUpForWorkshop(attendee(7), { whenFull: 'waitlist' }),
    ])

    expect(store().events.slice(0, 3)).toEqual(['read', 'read', 'commit'])
    const mine = storedSignups().filter((d) => d.userWorkOSId === 'user_7')
    expect(mine).toHaveLength(1)
    expect(mine[0].status).toBe('confirmed')
    expect(outcomes).toContainEqual({ refused: 'already-signed-up' })
  })

  it('also when the workshop is full and both would wait', async () => {
    store().reset([workshop({ capacity: 1 }), signup(1, 'confirmed')])

    await Promise.all([
      signUpForWorkshop(attendee(7), { whenFull: 'waitlist' }),
      signUpForWorkshop(attendee(7), { whenFull: 'waitlist' }),
    ])

    const mine = storedSignups().filter((d) => d.userWorkOSId === 'user_7')
    expect(mine).toHaveLength(1)
    expect(mine[0].status).toBe('waitlist')
  })

  it('a sign-up stored before #1344, under a random id, is found', async () => {
    store().reset([
      workshop(),
      { ...signup(1, 'waitlist'), userWorkOSId: 'user_7' },
    ])

    expect(
      await signUpForWorkshop(attendee(7), { whenFull: 'waitlist' }),
    ).toEqual({ refused: 'already-signed-up' })
    expect(storedSignups()).toHaveLength(1)
  })

  it('a person who cancelled (the sign-up was deleted) can sign up again', async () => {
    const first = await signUpForWorkshop(attendee(7), { whenFull: 'waitlist' })
    const id = (first as { signup: { _id: string } }).signup._id
    // An attendee's cancel deletes the sign-up (#1331).
    store().reset(
      store()
        .all()
        .filter((d) => d._id !== id),
    )

    const again = await signUpForWorkshop(attendee(7), {
      whenFull: 'waitlist',
    })

    expect(again).toMatchObject({ signup: { _id: id, status: 'confirmed' } })
  })

  it('a workshop moved to another conference takes the same person again there, instead of answering busy', async () => {
    await signUpForWorkshop(attendee(9), { whenFull: 'waitlist' })
    store().put({ ...store().doc(WORKSHOP)!, conference: ref('conf-b') })

    const there = await signUpForWorkshop(
      { ...attendee(9), conferenceId: 'conf-b' },
      { whenFull: 'waitlist' },
    )

    expect(there).toMatchObject({ signup: { status: 'confirmed' } })
    expect(
      storedSignups().filter((d) => d.userWorkOSId === 'user_9'),
    ).toHaveLength(2)
  })
})

describe('what a request that cannot take a seat is told', () => {
  it('one that loses the race every time it tries is refused as busy, and writes nothing', async () => {
    // No pause between attempts: the test need not wait out the back-off.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    // Another seat changes hands between every read and its write.
    let rev = 0
    for (let i = 0; i < 100; i++) {
      store().beforeNextCommit(() => {
        store().put({
          _id: 'workshopSeats-conf-a-talk-k8s',
          _type: 'workshopSeats',
          conference: ref(CONF),
          _rev: `other-${++rev}`,
        })
      })
    }

    expect(
      await signUpForWorkshop(attendee(1), { whenFull: 'waitlist' }),
    ).toEqual({ refused: 'busy' })
    expect(storedSignups()).toHaveLength(1)
  })

  it('the organizer adding someone to a full workshop is refused as full, and nothing is written', async () => {
    store().reset([workshop({ capacity: 1 }), signup(1, 'confirmed')])

    expect(
      await signUpForWorkshop(attendee(1), { whenFull: 'refuse' }),
    ).toEqual({ refused: 'full' })
    expect(store().commits).toEqual([])
  })

  it('two organizers adding the last seat at once: one is added, the other is told it is full', async () => {
    store().reset([workshop({ capacity: 2 }), signup(1, 'confirmed')])

    const outcomes = await Promise.all([
      signUpForWorkshop(attendee(1), { whenFull: 'refuse' }),
      signUpForWorkshop(attendee(2), { whenFull: 'refuse' }),
    ])

    expect(outcomes).toContainEqual({ refused: 'full' })
    expect(withStatus('confirmed')).toHaveLength(2)
    expect(withStatus('waitlist')).toHaveLength(0)
  })

  it('a workshop of another conference is not found, by any of the three, and nothing is written', async () => {
    store().reset([
      workshop({ conference: ref('conf-b') }),
      { ...signup(1, 'waitlist'), conference: ref('conf-b') },
    ])

    expect(
      await signUpForWorkshop(attendee(1), { whenFull: 'waitlist' }),
    ).toEqual({ refused: 'not-found' })
    expect(await confirmSignups(WORKSHOP, CONF, ['signup-1'])).toEqual({
      refused: 'not-found',
    })
    expect(await changeCapacity(WORKSHOP, CONF, 50)).toEqual({
      refused: 'not-found',
    })
    expect(store().commits).toEqual([])
  })
})

describe('a sign-up of theirs that the read cannot see', () => {
  it('(a status or a reference edited in Studio) is answered as already signed up, not as busy', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    store().put({
      ...signup(10, 'confirmed'),
      _id: signupDocumentId(CONF, WORKSHOP, 'user_10'),
      userWorkOSId: 'user_10',
      status: 'cancelled',
    })

    expect(
      await signUpForWorkshop(attendee(10), { whenFull: 'waitlist' }),
    ).toEqual({ refused: 'already-signed-up' })
  })
})

describe('a sign-up removed right after it was saved', () => {
  it('is answered as removed, not as a failure, when it is gone before it is read back', async () => {
    store().afterNextCommit(() => {
      for (const d of storedSignups()) {
        if (d.userWorkOSId === 'user_8') store().remove(d._id)
      }
    })

    expect(
      await signUpForWorkshop(attendee(8), { whenFull: 'waitlist' }),
    ).toEqual({ refused: 'removed' })
  })
})

describe('what is stored', () => {
  it('records the sponsor of an early sign-up as a weak reference', async () => {
    const outcome = await signUpForWorkshop(
      { ...attendee(1), earlyAccessSponsorId: 'sfc-acme' },
      { whenFull: 'waitlist' },
    )

    const id = (outcome as { signup: { _id: string } }).signup._id
    expect(store().doc(id)).toMatchObject({
      status: 'confirmed',
      userWorkOSId: 'user_1',
      conference: ref(CONF),
      workshop: ref(WORKSHOP),
      earlyAccessSponsor: { _ref: 'sfc-acme', _weak: true },
    })
  })
})

describe("the organizer's confirm", () => {
  it('takes a free seat, and says it is within capacity', async () => {
    store().reset([workshop(), signup(1, 'confirmed'), signup(2, 'waitlist')])

    expect(await confirmSignups(WORKSHOP, CONF, ['signup-2'])).toEqual({
      confirmed: ['signup-2'],
      newlyConfirmed: ['signup-2'],
      seatsTaken: 2,
      capacity: 3,
    })
    expect(store().doc('signup-2')).toMatchObject({
      status: 'confirmed',
      confirmedAt: expect.any(String),
    })
  })

  it('past capacity is allowed, and the answer names it: 4 seats taken of 3', async () => {
    store().reset([
      workshop(),
      signup(1, 'confirmed'),
      signup(2, 'confirmed'),
      signup(3, 'confirmed'),
      signup(4, 'waitlist'),
    ])

    expect(await confirmSignups(WORKSHOP, CONF, ['signup-4'])).toEqual({
      confirmed: ['signup-4'],
      newlyConfirmed: ['signup-4'],
      seatsTaken: 4,
      capacity: 3,
    })
    expect(withStatus('confirmed')).toHaveLength(4)
  })

  // The last seat, wanted by an organizer's confirm and an attendee's
  // sign-up at once. Both read "1 of 2 taken"; the one that read first
  // commits first, and the other must read again rather than act on it.
  const lastSeat = () =>
    store().reset([
      workshop({ capacity: 2 }),
      signup(1, 'confirmed'),
      signup(2, 'waitlist'),
    ])
  const attendeeStatus = () =>
    storedSignups().find((d) => d.userWorkOSId === 'user_1')?.status

  it('confirm first: it takes the last seat, and the attendee waits', async () => {
    lastSeat()

    const [confirm] = await Promise.all([
      confirmSignups(WORKSHOP, CONF, ['signup-2']),
      signUpForWorkshop(attendee(1), { whenFull: 'waitlist' }),
    ])

    expect(store().events.slice(0, 3)).toEqual(['read', 'read', 'commit'])
    expect(confirm).toMatchObject({ seatsTaken: 2, capacity: 2 })
    expect(attendeeStatus()).toBe('waitlist')
    expect(withStatus('confirmed')).toHaveLength(2)
  })

  it('sign-up first: the attendee takes the last seat, and the confirm says it went beyond capacity', async () => {
    lastSeat()

    const [, confirm] = await Promise.all([
      signUpForWorkshop(attendee(1), { whenFull: 'waitlist' }),
      confirmSignups(WORKSHOP, CONF, ['signup-2']),
    ])

    expect(store().events.slice(0, 3)).toEqual(['read', 'read', 'commit'])
    expect(attendeeStatus()).toBe('confirmed')
    expect(confirm).toMatchObject({ seatsTaken: 3, capacity: 2 })
    expect(withStatus('confirmed')).toHaveLength(3)
  })

  it('a sign-up that is gone or belongs to another workshop is not confirmed, and the rest are', async () => {
    store().reset([
      workshop(),
      signup(1, 'waitlist'),
      { ...signup(2, 'waitlist'), workshop: ref('talk-other') },
    ])

    expect(
      await confirmSignups(WORKSHOP, CONF, ['signup-1', 'signup-2', 'gone']),
    ).toMatchObject({ confirmed: ['signup-1'] })
    expect(store().doc('signup-2')?.status).toBe('waitlist')
  })

  it('a sign-up deleted between the read and the write (the attendee cancelled) is not confirmed, and the answer says so instead of failing', async () => {
    store().reset([workshop(), signup(1, 'waitlist')])
    store().beforeNextCommit(() => {
      store().reset(
        store()
          .all()
          .filter((d) => d._id !== 'signup-1'),
      )
    })

    expect(await confirmSignups(WORKSHOP, CONF, ['signup-1'])).toEqual({
      confirmed: [],
      newlyConfirmed: [],
      seatsTaken: 0,
      capacity: 3,
    })
    expect(store().doc('signup-1')).toBeUndefined()
  })

  it('a write that fails for another reason than a race is reported at once, and not retried on', async () => {
    store().reset([workshop(), signup(1, 'waitlist')])
    store().failWrites(new Error('503: dataset unavailable'))

    await expect(confirmSignups(WORKSHOP, CONF, ['signup-1'])).rejects.toThrow(
      '503: dataset unavailable',
    )
    expect(store().events).toEqual(['read'])
    expect(store().doc('signup-1')?.status).toBe('waitlist')
  })

  it('a sign-up that is already confirmed counts as confirmed, is not newly confirmed, and is not written', async () => {
    store().reset([workshop(), signup(1, 'confirmed')])

    expect(await confirmSignups(WORKSHOP, CONF, ['signup-1'])).toEqual({
      confirmed: ['signup-1'],
      newlyConfirmed: [],
      seatsTaken: 1,
      capacity: 3,
    })
    expect(store().commits).toEqual([])
  })
})

describe('changing the capacity', () => {
  const waiting = (n: number) => signup(n, 'waitlist')

  it('promotes the longest-waiting into the seats that are free, oldest first', async () => {
    store().reset([
      workshop({ capacity: 2 }),
      signup(1, 'confirmed'),
      signup(2, 'confirmed'),
      waiting(5),
      waiting(3),
      waiting(4),
    ])

    expect(await changeCapacity(WORKSHOP, CONF, 4)).toEqual({
      promoted: ['signup-3', 'signup-4'],
    })
    expect(store().doc(WORKSHOP)?.capacity).toBe(4)
    expect(store().doc('signup-5')?.status).toBe('waitlist')
  })

  it('promotes no one into a workshop that was already over capacity', async () => {
    store().reset([
      workshop({ capacity: 1 }),
      signup(1, 'confirmed'),
      signup(2, 'confirmed'),
      signup(3, 'confirmed'),
      waiting(4),
    ])

    expect(await changeCapacity(WORKSHOP, CONF, 3)).toEqual({ promoted: [] })
    expect(store().doc('signup-4')?.status).toBe('waitlist')
  })

  it('two waiting sign-ups cancelled one after the other while it writes: it promotes the next ones instead of failing', async () => {
    store().reset([
      workshop({ capacity: 1 }),
      signup(1, 'confirmed'),
      waiting(2),
      waiting(3),
      waiting(4),
      waiting(5),
    ])
    const cancel = (id: string) => () => store().remove(id)
    store().beforeNextCommit(cancel('signup-2'))
    store().beforeNextCommit(cancel('signup-3'))

    expect(await changeCapacity(WORKSHOP, CONF, 3)).toEqual({
      promoted: ['signup-4', 'signup-5'],
    })
    expect(
      withStatus('confirmed')
        .map((d) => d._id)
        .sort(),
    ).toEqual(['signup-1', 'signup-4', 'signup-5'])
  })

  it('is refused below the seats taken, and writes nothing', async () => {
    store().reset([workshop(), signup(1, 'confirmed'), signup(2, 'confirmed')])

    expect(await changeCapacity(WORKSHOP, CONF, 1)).toEqual({
      refused: 'below-seats-taken',
      seatsTaken: 2,
    })
    expect(store().commits).toEqual([])
  })

  it('and a sign-up at the same time: the capacity and the seats taken agree afterwards', async () => {
    store().reset([workshop({ capacity: 1 }), waiting(2), waiting(3)])

    await Promise.all([
      changeCapacity(WORKSHOP, CONF, 2),
      signUpForWorkshop(attendee(1), { whenFull: 'waitlist' }),
    ])

    expect(store().events.slice(0, 3)).toEqual(['read', 'read', 'commit'])
    expect(store().doc(WORKSHOP)?.capacity).toBe(2)
    expect(withStatus('confirmed')).toHaveLength(2)
  })
})
