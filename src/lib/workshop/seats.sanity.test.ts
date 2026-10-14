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
})
