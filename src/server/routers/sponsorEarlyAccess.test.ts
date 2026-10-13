/**
 * @vitest-environment node
 *
 * The organizer procedures of a sponsor's workshop early-access link (#1346,
 * spec §4, §8), through the tRPC caller: `sponsor.crm.earlyAccess.create`,
 * `.getAddress` and `.revoke`.
 *
 * REAL: the procedures, the tenancy guard (`requireDocumentInCurrentConference`
 * and its probe), the link module with its query text (`groq-js`) and its
 * writes (`@sanity/mutator`), the portal address (`workshopPortalUrl` and the
 * destination policy).
 * SUPPLIED: the request's conference, the workshop feature gate, the host's
 * verification record (`getDomainClaim`) and `next/cache`.
 * MODELLED: see `__tests__/helpers/versionedSanityStore.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'
import type { DomainClaim } from '@/lib/domain-verification/types'
import {
  claimsById,
  provenClaim,
} from '../../../__tests__/helpers/domainClaims'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  getConference: vi.fn(),
  workshopsEnabled: vi.fn<(c: unknown) => Promise<boolean>>(),
  getDomainClaim: vi.fn<(id: string) => Promise<DomainClaim | null>>(),
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
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: h.workshopsEnabled,
}))
vi.mock('@/lib/domain-verification/sanity', () => ({
  getDomainClaim: h.getDomainClaim,
}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

import type { Context } from '@/server/trpc'
import { sponsorEarlyAccessRouter } from './sponsorEarlyAccess'

const t = initTRPC.context<Context>().create()
const ORG = 'org-a'
const CONF = 'conf-a'
const MAIN_HOST = 'conf.example.org'
const SFC = 'sfc-acme'
const FOREIGN = 'sfc-theirs'
const FIELD = 'workshopEarlyAccessToken'
const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const TAG = `sanity:workshop-early-access-${CONF}`

const store = () => h.store!
const stored = (id: string) => store().doc(id)?.[FIELD]
const ref = (id: string) => ({ _type: 'reference', _ref: id })

function sponsor(overrides: Record<string, unknown> = {}) {
  return {
    _id: SFC,
    _type: 'sponsorForConference',
    _rev: 'r0',
    conference: ref(CONF),
    sponsor: ref('sponsor-acme'),
    status: 'closed-won',
    ...overrides,
  }
}
/** A sponsor of another conference of another organization, with a link. */
const foreignSponsor = () =>
  sponsor({
    _id: FOREIGN,
    conference: ref('conf-b'),
    [FIELD]: 'their-token',
  })

const DATASET = [
  { _id: CONF, _type: 'conference', organization: ref(ORG) },
  { _id: 'conf-b', _type: 'conference', organization: ref('org-b') },
]

function caller() {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(sponsorEarlyAccessRouter)({
    req: { headers: new Headers(), url: `https://${MAIN_HOST}` },
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

/** The reads that ran, as the text of each query. */
const queries = () => store().reads.map((read) => read.query)
/** The one read a refused request may make: the ownership probe, by id. */
const isOwnershipProbe = (query: string) => query.includes('"memberOrgIds"')

beforeEach(() => {
  vi.clearAllMocks()
  store().reset([...DATASET, sponsor(), foreignSponsor()])
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF,
      organization: { _ref: ORG },
      domains: [MAIN_HOST],
    },
    domain: MAIN_HOST,
    error: null,
  })
  h.workshopsEnabled.mockResolvedValue(true)
  h.getDomainClaim.mockImplementation(
    claimsById(provenClaim(MAIN_HOST, {}, { _id: CONF })),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('create', () => {
  it("stores a token and answers the link's address on the portal's host", async () => {
    const { url } = await caller().create({ sponsorForConferenceId: SFC })

    expect(url).toMatch(
      new RegExp(
        `^https://conf\\.example\\.org/workshop/early-access/${UUID}$`,
      ),
    )
    expect(url).toBe(
      `https://${MAIN_HOST}/workshop/early-access/${stored(SFC)}`,
    )
  })

  it('answers the same address for a sponsor that already has a link', async () => {
    const first = await caller().create({ sponsorForConferenceId: SFC })
    const second = await caller().create({ sponsorForConferenceId: SFC })

    expect(second.url).toBe(first.url)
  })

  it('expires the cached links of the conference at once', async () => {
    await caller().create({ sponsorForConferenceId: SFC })

    expect(h.revalidateTag.mock.calls).toEqual([[TAG, { expire: 0 }]])
  })

  it('is refused for a sponsor without a won deal, and writes nothing', async () => {
    store().reset([...DATASET, sponsor({ status: 'negotiating' })])

    await expect(
      caller().create({ sponsorForConferenceId: SFC }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('won deal'),
    })
    expect(store().commits).toEqual([])
    expect(stored(SFC)).toBeUndefined()
  })

  it('is refused, with the reason, when the conference has no working portal, and writes nothing', async () => {
    // The main host has no verification record: it cannot sign anyone in.
    h.getDomainClaim.mockResolvedValue(null)

    await expect(
      caller().create({ sponsorForConferenceId: SFC }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('no working workshop portal'),
    })
    expect(store().commits).toEqual([])
    expect(stored(SFC)).toBeUndefined()
    // The identical request with a working portal stores a token.
    h.getDomainClaim.mockImplementation(
      claimsById(provenClaim(MAIN_HOST, {}, { _id: CONF })),
    )
    await caller().create({ sponsorForConferenceId: SFC })
    expect(stored(SFC)).toMatch(new RegExp(`^${UUID}$`))
  })

  it('is refused when the conference has no workshops, before anything is read', async () => {
    h.workshopsEnabled.mockResolvedValue(false)

    await expect(
      caller().create({ sponsorForConferenceId: SFC }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(store().reads).toEqual([])
    expect(store().commits).toEqual([])
  })

  it("is refused for another conference's sponsor, which is neither read nor written", async () => {
    await expect(
      caller().create({ sponsorForConferenceId: FOREIGN }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // The ownership probe is the one read, and it asks for tenancy keys only.
    expect(queries()).toHaveLength(1)
    expect(isOwnershipProbe(queries()[0])).toBe(true)
    expect(queries()[0]).not.toContain(FIELD)
    expect(store().commits).toEqual([])
    expect(stored(FOREIGN)).toBe('their-token')
    expect(h.getDomainClaim).not.toHaveBeenCalled()
    expect(h.revalidateTag).not.toHaveBeenCalled()
  })

  it('refuses an id that does not exist exactly as it refuses a foreign one', async () => {
    const missing = await caller()
      .create({ sponsorForConferenceId: 'sfc-nobody' })
      .catch((error) => error)
    const foreign = await caller()
      .create({ sponsorForConferenceId: FOREIGN })
      .catch((error) => error)

    expect(missing.code).toBe('NOT_FOUND')
    expect({ code: foreign.code, message: foreign.message }).toEqual({
      code: missing.code,
      message: missing.message,
    })
  })
})

describe('getAddress', () => {
  it("answers the stored link's address, and writes nothing", async () => {
    store().reset([...DATASET, sponsor({ [FIELD]: 'stored-token' })])

    expect(await caller().getAddress({ sponsorForConferenceId: SFC })).toEqual({
      url: `https://${MAIN_HOST}/workshop/early-access/stored-token`,
    })
    expect(store().commits).toEqual([])
  })

  it('answers a link that exists after the deal left the won state', async () => {
    store().reset([
      ...DATASET,
      sponsor({ status: 'closed-lost', [FIELD]: 'stored-token' }),
    ])

    expect(await caller().getAddress({ sponsorForConferenceId: SFC })).toEqual({
      url: `https://${MAIN_HOST}/workshop/early-access/stored-token`,
    })
  })

  it('never creates a link: a sponsor without one is refused and nothing is written', async () => {
    await expect(
      caller().getAddress({ sponsorForConferenceId: SFC }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('no early-access link'),
    })
    expect(store().commits).toEqual([])
    expect(stored(SFC)).toBeUndefined()
  })

  it("is refused for another conference's sponsor, which is not read", async () => {
    await expect(
      caller().getAddress({ sponsorForConferenceId: FOREIGN }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(queries()).toHaveLength(1)
    expect(isOwnershipProbe(queries()[0])).toBe(true)
    expect(h.getDomainClaim).not.toHaveBeenCalled()
  })
})

describe('revoke', () => {
  it('removes the stored token, so the old address is not live and a new create gives another', async () => {
    const { findEarlyAccessSponsor } =
      await import('@/lib/workshop/early-access')
    const first = await caller().create({ sponsorForConferenceId: SFC })
    const token = first.url.split('/').at(-1)!
    expect(await findEarlyAccessSponsor(CONF, token)).toEqual({ _id: SFC })

    expect(await caller().revoke({ sponsorForConferenceId: SFC })).toEqual({
      success: true,
      notCleared: [],
    })

    expect(stored(SFC)).toBeUndefined()
    expect(await findEarlyAccessSponsor(CONF, token)).toBeNull()
    const second = await caller().create({ sponsorForConferenceId: SFC })
    expect(second.url).not.toBe(first.url)
    expect(second.url).toBe(
      `https://${MAIN_HOST}/workshop/early-access/${stored(SFC)}`,
    )
  })

  it('expires the cached links of the conference at once', async () => {
    store().reset([...DATASET, sponsor({ [FIELD]: 'stored-token' })])

    await caller().revoke({ sponsorForConferenceId: SFC })

    expect(h.revalidateTag.mock.calls).toEqual([[TAG, { expire: 0 }]])
  })

  it('works for a conference that has turned workshops off', async () => {
    store().reset([...DATASET, sponsor({ [FIELD]: 'stored-token' })])
    h.workshopsEnabled.mockResolvedValue(false)

    await caller().revoke({ sponsorForConferenceId: SFC })

    expect(stored(SFC)).toBeUndefined()
  })

  it("is refused for another conference's sponsor, which is neither read nor written", async () => {
    await expect(
      caller().revoke({ sponsorForConferenceId: FOREIGN }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(queries()).toHaveLength(1)
    expect(isOwnershipProbe(queries()[0])).toBe(true)
    expect(queries()[0]).not.toContain(FIELD)
    expect(store().commits).toEqual([])
    expect(stored(FOREIGN)).toBe('their-token')
    expect(h.revalidateTag).not.toHaveBeenCalled()
  })
})

describe('an id of an unpublished copy', () => {
  const DRAFT = `drafts.${SFC}`
  const RELEASE_COPY = `versions.rSpring.${SFC}`

  it.each(
    (['create', 'getAddress', 'revoke'] as const).flatMap((procedure) =>
      [DRAFT, RELEASE_COPY].map((id) => [procedure, id] as const),
    ),
  )('%s refuses %s before anything is read', async (procedure, id) => {
    // The copies exist, are the conference's and are won: the ownership
    // guard would accept them.
    store().reset([
      ...DATASET,
      sponsor({ [FIELD]: 'stored-token' }),
      sponsor({ _id: DRAFT }),
      sponsor({ _id: RELEASE_COPY }),
    ])

    await expect(
      caller()[procedure]({ sponsorForConferenceId: id }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('unpublished copy'),
    })
    expect(store().reads).toEqual([])
    expect(store().commits).toEqual([])
    expect(stored(SFC)).toBe('stored-token')
    expect(stored(DRAFT)).toBeUndefined()
    expect(h.getDomainClaim).not.toHaveBeenCalled()
  })
})

describe('the cached links are expired whenever a write may have landed', () => {
  const DRAFT = `drafts.${SFC}`
  const RELEASE_COPY = `versions.rSpring.${SFC}`

  it('create: the token is stored and writing it to a copy fails', async () => {
    store().reset([...DATASET, sponsor(), sponsor({ _id: DRAFT })])
    store().failPatchesOf(DRAFT)

    await expect(
      caller().create({ sponsorForConferenceId: SFC }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })

    expect(stored(SFC)).toMatch(new RegExp(`^${UUID}$`))
    expect(h.revalidateTag.mock.calls).toEqual([[TAG, { expire: 0 }]])
  })

  it('revoke: the commit landed and then threw', async () => {
    store().reset([...DATASET, sponsor({ [FIELD]: 'stored-token' })])
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })

    await expect(
      caller().revoke({ sponsorForConferenceId: SFC }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })

    expect(stored(SFC)).toBeUndefined()
    expect(h.revalidateTag.mock.calls).toEqual([[TAG, { expire: 0 }]])
  })

  it('revoke says which copies still hold the link, and the link is not live', async () => {
    store().reset([
      ...DATASET,
      sponsor({ [FIELD]: 'stored-token' }),
      sponsor({ _id: RELEASE_COPY, [FIELD]: 'stored-token' }),
    ])
    store().failPatchesOf(RELEASE_COPY)

    expect(await caller().revoke({ sponsorForConferenceId: SFC })).toEqual({
      success: true,
      notCleared: [RELEASE_COPY],
    })
    expect(stored(SFC)).toBeUndefined()
    expect(h.revalidateTag.mock.calls).toEqual([[TAG, { expire: 0 }]])
  })
})

describe('who may call', () => {
  it.each(['create', 'getAddress', 'revoke'] as const)(
    '%s is refused for a caller who is not an organizer of this organization',
    async (procedure) => {
      const speaker = { _id: 'sp-x', organizerOrgIds: ['org-b'] }
      const outsider = t.createCallerFactory(sponsorEarlyAccessRouter)({
        req: { headers: new Headers(), url: `https://${MAIN_HOST}` },
        session: { user: { email: 'x@example.com' }, speaker },
        speaker,
      } as unknown as Context)
      store().reset([...DATASET, sponsor({ [FIELD]: 'stored-token' })])

      await expect(
        outsider[procedure]({ sponsorForConferenceId: SFC }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(store().reads).toEqual([])
      expect(stored(SFC)).toBe('stored-token')
    },
  )
})
