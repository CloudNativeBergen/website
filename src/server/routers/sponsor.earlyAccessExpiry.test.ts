/**
 * @vitest-environment node
 *
 * Removing a sponsor from a conference expires the cached early-access links
 * of that conference AT ONCE (#1346, spec §7), on each of the three paths that
 * delete a `sponsorForConference`: one sponsor (`sponsor.crm.delete`), several
 * (`sponsor.crm.bulkDelete`) and the sponsor itself with every conference it
 * is in (`sponsor.delete`).
 *
 * REAL: the procedures, their guards, the delete functions with their query
 * text (`groq-js`) and their transactions (`@sanity/mutator`).
 * SUPPLIED: the request's conference and `next/cache`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  getConference: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

import type { Context } from '@/server/trpc'
import { resolveEarlyAccess } from '@/lib/workshop/early-access'
import { sponsorRouter } from './sponsor'

const t = initTRPC.context<Context>().create()
const ORG = 'org-a'
const CONF = 'conf-a'
const LAST_YEAR = 'conf-a-2025'
const FIELD = 'workshopEarlyAccessToken'
const tag = (conferenceId: string) =>
  `sanity:workshop-early-access-${conferenceId}`

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })

function sponsorIn(
  conferenceId: string,
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: id,
    _type: 'sponsorForConference',
    _rev: 'r0',
    conference: ref(conferenceId),
    sponsor: ref('sponsor-acme'),
    status: 'closed-won',
    ...overrides,
  }
}

const DATASET = [
  { _id: CONF, _type: 'conference', organization: ref(ORG) },
  { _id: LAST_YEAR, _type: 'conference', organization: ref(ORG) },
  {
    _id: 'sponsor-acme',
    _type: 'sponsor',
    name: 'Acme AS',
    organization: ref(ORG),
  },
  sponsorIn(CONF, 'sfc-acme', { [FIELD]: 'token-acme' }),
  sponsorIn(CONF, 'sfc-other', { [FIELD]: 'token-other' }),
  sponsorIn(LAST_YEAR, 'sfc-acme-2025', { [FIELD]: 'token-2025' }),
]

function caller() {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(sponsorRouter)({
    req: { headers: new Headers(), url: 'https://conf.example.org' },
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

/** The early-access tags that were expired at once, in order. */
const expired = () =>
  h.revalidateTag.mock.calls
    .filter(([name]) => String(name).includes('workshop-early-access'))
    .map(([name, profile]) => [name, profile])

beforeEach(() => {
  vi.clearAllMocks()
  h.revalidateTag.mockReset()
  store().reset(DATASET)
  h.getConference.mockResolvedValue({
    conference: { _id: CONF, organization: { _ref: ORG } },
    domain: 'conf.example.org',
    error: null,
  })
})

describe('removing a sponsor expires the cached links at once', () => {
  it('one sponsor (sponsor.crm.delete)', async () => {
    expect(await resolveEarlyAccess(CONF, 'token-acme')).toEqual({
      sponsorName: 'Acme AS',
    })

    await caller().crm.delete({ id: 'sfc-acme' })

    expect(store().doc('sfc-acme')).toBeUndefined()
    expect(expired()).toEqual([[tag(CONF), { expire: 0 }]])
    // What a refill then reads: the removed sponsor's link is not live.
    expect(await resolveEarlyAccess(CONF, 'token-acme')).toBeNull()
    expect(await resolveEarlyAccess(CONF, 'token-other')).toEqual({
      sponsorName: 'Acme AS',
    })
  })

  it('several sponsors (sponsor.crm.bulkDelete)', async () => {
    await caller().crm.bulkDelete({ ids: ['sfc-acme', 'sfc-other'] })

    expect(store().doc('sfc-acme')).toBeUndefined()
    expect(store().doc('sfc-other')).toBeUndefined()
    expect(expired()).toEqual([[tag(CONF), { expire: 0 }]])
    expect(await resolveEarlyAccess(CONF, 'token-other')).toBeNull()
  })

  it('the sponsor itself, in every conference it is in (sponsor.delete)', async () => {
    store().reset(DATASET.filter((doc) => doc._id !== 'sfc-other'))

    await caller().delete({ id: 'sponsor-acme' })

    expect(store().doc('sponsor-acme')).toBeUndefined()
    expect(store().doc('sfc-acme')).toBeUndefined()
    expect(store().doc('sfc-acme-2025')).toBeUndefined()
    expect(expired()).toEqual(
      expect.arrayContaining([
        [tag(CONF), { expire: 0 }],
        [tag(LAST_YEAR), { expire: 0 }],
      ]),
    )
    expect(expired()).toHaveLength(2)
    expect(await resolveEarlyAccess(LAST_YEAR, 'token-2025')).toBeNull()
  })

  it('nothing is expired when the removal is refused', async () => {
    store().reset([
      ...DATASET,
      { _id: 'conf-b', _type: 'conference', organization: ref('org-b') },
      sponsorIn('conf-b', 'sfc-theirs', { [FIELD]: 'their-token' }),
    ])

    await expect(
      caller().crm.delete({ id: 'sfc-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(store().doc('sfc-theirs')).toBeDefined()
    expect(expired()).toEqual([])
  })
})

/**
 * Next stamps an expiry at the call. One made BEFORE the removal is stored
 * lets a refill in between read the sponsor that is about to go, and keep its
 * link live for the cache's life.
 */
describe('the cached links are expired AFTER the removal is stored', () => {
  /** The sponsors of any conference that are stored at each expiry, in order. */
  function sponsorsStoredAtEachExpiry() {
    const seen: string[][] = []
    h.revalidateTag.mockImplementation((name: unknown) => {
      if (!String(name).includes('workshop-early-access')) return
      seen.push(
        store()
          .all()
          .filter((doc) => doc._type === 'sponsorForConference')
          .map((doc) => doc._id)
          .sort(),
      )
    })
    return seen
  }

  it('one sponsor (sponsor.crm.delete)', async () => {
    const seen = sponsorsStoredAtEachExpiry()

    await caller().crm.delete({ id: 'sfc-acme' })

    expect(seen).toEqual([['sfc-acme-2025', 'sfc-other']])
  })

  it('several sponsors (sponsor.crm.bulkDelete)', async () => {
    const seen = sponsorsStoredAtEachExpiry()

    await caller().crm.bulkDelete({ ids: ['sfc-acme', 'sfc-other'] })

    expect(seen).toEqual([['sfc-acme-2025']])
  })

  it('the sponsor itself, in every conference it is in (sponsor.delete)', async () => {
    store().reset(DATASET.filter((doc) => doc._id !== 'sfc-other'))
    // A sponsor of another company stays: what is left at each expiry.
    store().put(
      sponsorIn(CONF, 'sfc-globex', { sponsor: ref('sponsor-globex') }),
    )
    const seen = sponsorsStoredAtEachExpiry()

    await caller().delete({ id: 'sponsor-acme' })

    expect(seen).toEqual([['sfc-globex'], ['sfc-globex']])
  })
})

/**
 * A delete can be committed and its acknowledgement lost: the procedure then
 * fails, and the sponsor is gone all the same. The cached links are expired
 * after any ATTEMPTED removal.
 */
describe('a removal that commits and then fails still expires the cached links', () => {
  const commitsThenThrows = () =>
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })

  it('one sponsor (sponsor.crm.delete)', async () => {
    commitsThenThrows()

    await expect(caller().crm.delete({ id: 'sfc-acme' })).rejects.toMatchObject(
      { code: 'INTERNAL_SERVER_ERROR' },
    )

    expect(store().doc('sfc-acme')).toBeUndefined()
    expect(expired()).toEqual([[tag(CONF), { expire: 0 }]])
  })

  it('several sponsors (sponsor.crm.bulkDelete)', async () => {
    commitsThenThrows()

    await expect(
      caller().crm.bulkDelete({ ids: ['sfc-acme', 'sfc-other'] }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })

    expect(store().doc('sfc-acme')).toBeUndefined()
    expect(expired()).toEqual([[tag(CONF), { expire: 0 }]])
  })

  it('the sponsor itself, in every conference it is in (sponsor.delete)', async () => {
    store().reset(DATASET.filter((doc) => doc._id !== 'sfc-other'))
    commitsThenThrows()

    await expect(caller().delete({ id: 'sponsor-acme' })).rejects.toMatchObject(
      { code: 'INTERNAL_SERVER_ERROR' },
    )

    expect(store().doc('sfc-acme')).toBeUndefined()
    expect(store().doc('sfc-acme-2025')).toBeUndefined()
    expect(expired()).toHaveLength(2)
    expect(expired()).toEqual(
      expect.arrayContaining([
        [tag(CONF), { expire: 0 }],
        [tag(LAST_YEAR), { expire: 0 }],
      ]),
    )
  })
})
