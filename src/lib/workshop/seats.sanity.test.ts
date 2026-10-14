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
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

import { signUpForWorkshop } from './seats'

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
    store().reset(store().all().filter((d) => d._id !== id))

    const again = await signUpForWorkshop(attendee(7), {
      whenFull: 'waitlist',
    })

    expect(again).toMatchObject({ signup: { _id: id, status: 'confirmed' } })
  })
})
