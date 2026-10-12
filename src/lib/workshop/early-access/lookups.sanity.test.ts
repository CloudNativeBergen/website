/**
 * @vitest-environment node
 *
 * Which early-access links are LIVE (#1346, spec §2, §4, §7): the two reads
 * that look a link up, as EXECUTED GROQ over a dataset with drafts, release
 * copies and a second conference.
 *
 *  - `resolveEarlyAccess`: through the one cached read per conference, for
 *    what is shown and for the route.
 *  - `findEarlyAccessSponsor`: live, for the sign-up.
 *
 * REAL: both functions and their query text (`groq-js`).
 * NOT RUN: `'use cache: remote'` is inert under Vitest, so nothing here says
 * how often the cached read reaches Sanity in a deployment.
 * MODELLED: which documents a read sees, by API version and perspective
 * (`__tests__/helpers/versionedSanityStore.ts`). The release-copy cases
 * therefore ALSO run the query text over every stored document.
 */
import { createHash } from 'node:crypto'
import { evaluate, parse } from 'groq-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { cacheTag } from 'next/cache'
import { earlyAccessLinksTag } from '@/lib/cache/tags'
import { findEarlyAccessSponsor } from './link'
import { conferenceEarlyAccessLinks, resolveEarlyAccess } from './links'

const store = () => h.store!
const CONF = 'conf-a'
const OTHER_CONF = 'conf-b'
const SFC = 'sfc-acme'
const TOKEN = '4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'
const REVOKED = '9f8e7d6c-5b4a-4321-8fed-cba987654321'

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
const ACME = { _id: 'sponsor-acme', _type: 'sponsor', name: 'Acme AS' }

/** Both lookups, each answering "which sponsor, or null". */
const lookups = [
  [
    'the cached read (what is shown, and the route)',
    async (conferenceId: string, token: string) =>
      (await resolveEarlyAccess(conferenceId, token)) && SFC,
  ],
  [
    'the live read (the sign-up)',
    async (conferenceId: string, token: string) =>
      (await findEarlyAccessSponsor(conferenceId, token))?._id ?? null,
  ],
] as const

/** The last query that ran, again, over EVERY stored document. */
async function lastQueryOverEverything() {
  const read = store().reads.at(-1)!
  const result = await evaluate(parse(read.query), {
    dataset: store().all(),
    params: read.params,
  })
  return result.get()
}

beforeEach(() => {
  vi.clearAllMocks()
  store().reset([ACME, sponsor({ workshopEarlyAccessToken: TOKEN })])
})

describe.each(lookups)('%s', (_name, lookup) => {
  it('finds the sponsor whose published document stores the token', async () => {
    expect(await lookup(CONF, TOKEN)).toBe(SFC)
  })

  it('finds nothing for a token no sponsor stores', async () => {
    expect(await lookup(CONF, REVOKED)).toBeNull()
  })

  it('a draft that still holds a revoked token does not make it live', async () => {
    store().reset([
      ACME,
      sponsor({ workshopEarlyAccessToken: TOKEN }),
      sponsor({ _id: `drafts.${SFC}`, workshopEarlyAccessToken: REVOKED }),
    ])

    expect(await lookup(CONF, REVOKED)).toBeNull()
    // The same read finds the token the published document stores.
    expect(await lookup(CONF, TOKEN)).toBe(SFC)
  })

  it('a release copy that still holds a revoked token does not make it live', async () => {
    store().reset([
      ACME,
      sponsor({ workshopEarlyAccessToken: TOKEN }),
      sponsor({
        _id: `versions.rSpring.${SFC}`,
        workshopEarlyAccessToken: REVOKED,
      }),
    ])

    expect(await lookup(CONF, REVOKED)).toBeNull()
    expect(await lookup(CONF, TOKEN)).toBe(SFC)
  })

  it('a token of another conference is not live here, and is live there', async () => {
    store().reset([
      ACME,
      sponsor({
        conference: ref(OTHER_CONF),
        workshopEarlyAccessToken: TOKEN,
      }),
    ])

    expect(await lookup(CONF, TOKEN)).toBeNull()
    expect(await lookup(OTHER_CONF, TOKEN)).toBe(SFC)
  })
})

describe('the query text itself leaves unpublished copies out', () => {
  // Under the clients' API version a release copy is not visible at all, so
  // the cases above would pass without the exclusion. Here the query runs
  // over every stored document, as a read at a newer version would see them.
  const everyVersion = [
    ACME,
    sponsor({ workshopEarlyAccessToken: TOKEN }),
    sponsor({ _id: `drafts.${SFC}`, workshopEarlyAccessToken: REVOKED }),
    sponsor({
      _id: `versions.rSpring.${SFC}`,
      workshopEarlyAccessToken: REVOKED,
    }),
  ]

  it('the cached read lists the published link only', async () => {
    store().reset(everyVersion)
    await conferenceEarlyAccessLinks(CONF)

    expect(await lastQueryOverEverything()).toEqual([
      { token: TOKEN, sponsorName: 'Acme AS' },
    ])
  })

  it('the live read finds no sponsor for the revoked token', async () => {
    store().reset(everyVersion)
    await findEarlyAccessSponsor(CONF, REVOKED)
    expect(await lastQueryOverEverything()).toBeNull()

    await findEarlyAccessSponsor(CONF, TOKEN)
    expect(await lastQueryOverEverything()).toEqual({ _id: SFC })
  })
})

describe('the cached read of a conference', () => {
  it('answers the sponsor name of a live link', async () => {
    expect(await resolveEarlyAccess(CONF, TOKEN)).toEqual({
      sponsorName: 'Acme AS',
    })
  })

  it('holds a hash of each token and never the token', async () => {
    const links = await conferenceEarlyAccessLinks(CONF)

    expect(links).toEqual([
      {
        tokenHash: createHash('sha256').update(TOKEN).digest('hex'),
        sponsorName: 'Acme AS',
      },
    ])
    expect(JSON.stringify(links)).not.toContain(TOKEN)
  })

  it('is filled through the uncached client, from one read that does not carry the token', async () => {
    await resolveEarlyAccess(CONF, TOKEN)
    const forOne = store().reads.map(({ client, query, params }) => ({
      client,
      query,
      params,
    }))
    store().reset([ACME, sponsor({ workshopEarlyAccessToken: TOKEN })])
    await resolveEarlyAccess(CONF, REVOKED)
    const forAnother = store().reads.map(({ client, query, params }) => ({
      client,
      query,
      params,
    }))

    expect(forOne).toHaveLength(1)
    expect(forOne[0].client).toBe('uncached')
    expect(forOne[0].params).toEqual({ conferenceId: CONF })
    // Whatever the token, the read is the same one.
    expect(forAnother).toEqual(forOne)
  })

  it('is tagged for its conference', async () => {
    await conferenceEarlyAccessLinks(CONF)

    expect(cacheTag).toHaveBeenCalledWith(earlyAccessLinksTag(CONF))
    expect(earlyAccessLinksTag(CONF)).not.toBe(earlyAccessLinksTag(OTHER_CONF))
  })

  it('reads nothing for a request that carries no token', async () => {
    expect(await resolveEarlyAccess(CONF, undefined)).toBeNull()
    expect(await resolveEarlyAccess(CONF, '')).toBeNull()
    expect(store().reads).toEqual([])
  })
})

describe('the live read', () => {
  it('goes to the uncached client, within the conference', async () => {
    await findEarlyAccessSponsor(CONF, TOKEN)

    expect(store().reads).toHaveLength(1)
    expect(store().reads[0].client).toBe('uncached')
    expect(store().reads[0].params).toMatchObject({ conferenceId: CONF })
  })

  it('reads nothing for an empty token', async () => {
    expect(await findEarlyAccessSponsor(CONF, '')).toBeNull()
    expect(store().reads).toEqual([])
  })
})
