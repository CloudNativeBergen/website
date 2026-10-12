/**
 * @vitest-environment node
 *
 * The early-access link of a sponsor (#1346, spec §4): create, revoke and the
 * two lookups, asserted on the STORED DOCUMENTS and on EXECUTED GROQ.
 *
 * REAL: the module under test, the query text (`groq-js`) and the writes (the
 * real client's serialized mutations applied by `@sanity/mutator`).
 * MODELLED: see `__tests__/helpers/versionedSanityStore.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})

import { createEarlyAccessLink, revokeEarlyAccessLink } from './link'

const store = () => h.store!
const CONF = 'conf-a'
const SFC = 'sfc-acme'
const FIELD = 'workshopEarlyAccessToken'
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

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

const stored = (id: string) => store().doc(id)?.[FIELD]

const DRAFT = `drafts.${SFC}`
const RELEASE_COPY = `versions.rSpring.${SFC}`
/** The sponsor with a Studio draft and a copy in a content release. */
const withCopies = (overrides: Record<string, unknown> = {}) => [
  sponsor(overrides),
  sponsor({ ...overrides, _id: DRAFT }),
  sponsor({ ...overrides, _id: RELEASE_COPY }),
]

beforeEach(() => {
  store().reset([sponsor()])
})

describe('creating a link', () => {
  it('stores a random token on the sponsor and answers it', async () => {
    const result = await createEarlyAccessLink(CONF, SFC)

    expect(result).toEqual({ token: expect.stringMatching(UUID) })
    expect(stored(SFC)).toBe((result as { token: string }).token)
  })

  it('answers the stored token when there is one, and writes nothing', async () => {
    store().reset([sponsor({ [FIELD]: 'stored-token' })])

    expect(await createEarlyAccessLink(CONF, SFC)).toEqual({
      token: 'stored-token',
    })
    expect(stored(SFC)).toBe('stored-token')
    expect(store().commits).toEqual([])
  })

  it('two creates at once end with one token: the one that is stored', async () => {
    const [first, second] = await Promise.all([
      createEarlyAccessLink(CONF, SFC),
      createEarlyAccessLink(CONF, SFC),
    ])

    // The race ran: both read "no token" before either wrote.
    expect(store().events.slice(0, 3)).toEqual(['read', 'read', 'commit'])
    expect(first).toEqual({ token: expect.stringMatching(UUID) })
    expect(second).toEqual(first)
    expect(stored(SFC)).toBe((first as { token: string }).token)
  })

  it.each(['prospect', 'contacted', 'negotiating', 'closed-lost'])(
    'is refused for a sponsor whose deal is %s, and writes nothing',
    async (status) => {
      store().reset([sponsor({ status })])

      expect(await createEarlyAccessLink(CONF, SFC)).toEqual({
        refused: 'not-won',
      })
      expect(store().commits).toEqual([])
      expect(stored(SFC)).toBeUndefined()
    },
  )

  it('keeps answering a link that exists after the deal left the won state', async () => {
    store().reset([sponsor({ status: 'closed-lost', [FIELD]: 'stored-token' })])

    expect(await createEarlyAccessLink(CONF, SFC)).toEqual({
      token: 'stored-token',
    })
  })

  it('is refused for a sponsor of another conference, and writes nothing', async () => {
    store().reset([sponsor({ conference: ref('conf-b') })])

    expect(await createEarlyAccessLink(CONF, SFC)).toEqual({
      refused: 'not-found',
    })
    expect(store().commits).toEqual([])
    expect(stored(SFC)).toBeUndefined()
  })
})

describe('the unpublished copies of the sponsor are kept in step', () => {
  it('a draft and a release copy that exist when a link is created receive the token', async () => {
    store().reset(withCopies())

    const { token } = (await createEarlyAccessLink(CONF, SFC)) as {
      token: string
    }

    expect(token).toMatch(UUID)
    expect(stored(DRAFT)).toBe(token)
    expect(stored(RELEASE_COPY)).toBe(token)
  })

  it('a copy that still holds an older token is given the stored one', async () => {
    store().reset([
      sponsor({ [FIELD]: 'stored-token' }),
      sponsor({ _id: DRAFT, [FIELD]: 'older-token' }),
      sponsor({ _id: RELEASE_COPY }),
    ])

    await createEarlyAccessLink(CONF, SFC)

    expect(stored(DRAFT)).toBe('stored-token')
    expect(stored(RELEASE_COPY)).toBe('stored-token')
  })

  it("leaves another sponsor's copies alone", async () => {
    const other = { _id: 'sfc-other', sponsor: ref('sponsor-other') }
    store().reset([
      ...withCopies(),
      sponsor(other),
      sponsor({ ...other, _id: 'drafts.sfc-other' }),
      sponsor({ ...other, _id: 'versions.rSpring.sfc-other' }),
    ])

    await createEarlyAccessLink(CONF, SFC)

    expect(stored('drafts.sfc-other')).toBeUndefined()
    expect(stored('versions.rSpring.sfc-other')).toBeUndefined()
  })

  it('finds the copies of a sponsor whose id has dots in it', async () => {
    // Production holds ids of this shape.
    const id = 'kkdemo.sponsorForConference.bramble'
    store().reset([
      sponsor({ _id: id }),
      sponsor({ _id: `drafts.${id}` }),
      sponsor({ _id: `versions.rSpring.${id}` }),
    ])

    const { token } = (await createEarlyAccessLink(CONF, id)) as {
      token: string
    }

    expect(token).toMatch(UUID)
    expect(stored(`drafts.${id}`)).toBe(token)
    expect(stored(`versions.rSpring.${id}`)).toBe(token)
  })

  it('a revoke that lands before the copies are written leaves no copy holding the revoked token', async () => {
    store().reset(withCopies())
    // The first commit stores the token. The revoke runs just before the
    // second one, which would write that token to the copies.
    let revoked: string | undefined
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(async () => {
      revoked = stored(SFC) as string
      await revokeEarlyAccessLink(SFC)
    })

    const { token } = (await createEarlyAccessLink(CONF, SFC)) as {
      token: string
    }

    expect(revoked).toMatch(UUID)
    expect(token).not.toBe(revoked)
    expect(stored(SFC)).toBe(token)
    expect(stored(DRAFT)).toBe(token)
    expect(stored(RELEASE_COPY)).toBe(token)
  })
})

describe('revoking a link', () => {
  it('removes the token from the sponsor and from every unpublished copy', async () => {
    store().reset(withCopies({ [FIELD]: 'stored-token' }))

    await revokeEarlyAccessLink(SFC)

    expect(store().doc(SFC)).toBeDefined()
    expect(stored(SFC)).toBeUndefined()
    expect(stored(DRAFT)).toBeUndefined()
    expect(stored(RELEASE_COPY)).toBeUndefined()
  })

  it('a create after a revoke stores a different token', async () => {
    const first = (await createEarlyAccessLink(CONF, SFC)) as { token: string }
    await revokeEarlyAccessLink(SFC)
    const second = (await createEarlyAccessLink(CONF, SFC)) as { token: string }

    expect(second.token).toMatch(UUID)
    expect(second.token).not.toBe(first.token)
    expect(stored(SFC)).toBe(second.token)
  })

  it('writes nothing for a sponsor that has no link', async () => {
    await revokeEarlyAccessLink(SFC)

    expect(store().commits).toEqual([])
  })
})
