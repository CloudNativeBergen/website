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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

import { cacheLife, cacheTag } from 'next/cache'
import { earlyAccessLinksTag } from '@/lib/cache/tags'
import {
  findEarlyAccessSponsor,
  readEarlyAccessToken,
  revokeEarlyAccessLink,
} from './link'
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

  it('lives an hour before it is read again and two before it is dropped', async () => {
    await conferenceEarlyAccessLinks(CONF)

    expect(vi.mocked(cacheLife).mock.calls).toEqual([
      [{ stale: 60, revalidate: 3600, expire: 7200 }],
    ])
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

describe('a token that another document of the conference holds too', () => {
  // A sponsor duplicated in Sanity Studio (before Duplicate was removed for
  // the type), or copied by a script: the same token under an id of its own.
  const duplicated = [
    ACME,
    sponsor({ workshopEarlyAccessToken: TOKEN }),
    sponsor({ _id: 'sfc-acme-copy', workshopEarlyAccessToken: TOKEN }),
    sponsor({ _id: 'drafts.sfc-acme-copy-2', workshopEarlyAccessToken: TOKEN }),
    sponsor({
      _id: 'versions.rSpring.sfc-acme-copy',
      workshopEarlyAccessToken: TOKEN,
    }),
    // Another conference's sponsor with a token of its own: not touched.
    sponsor({
      _id: 'sfc-elsewhere',
      conference: ref(OTHER_CONF),
      workshopEarlyAccessToken: REVOKED,
    }),
  ]
  const holds = (id: string) => store().doc(id)?.workshopEarlyAccessToken

  it('before the revoke, the link is live through the duplicate too', async () => {
    store().reset(duplicated.filter((doc) => doc._id !== SFC))

    expect(await findEarlyAccessSponsor(CONF, TOKEN)).toEqual({
      _id: 'sfc-acme-copy',
    })
  })

  it('a revoke clears it from every document of the conference, under any id, with its copies', async () => {
    store().reset(duplicated)

    expect(await revokeEarlyAccessLink(CONF, SFC)).toEqual({ notCleared: [] })

    for (const id of [
      SFC,
      'sfc-acme-copy',
      'drafts.sfc-acme-copy-2',
      'versions.rSpring.sfc-acme-copy',
    ]) {
      expect(holds(id), id).toBeUndefined()
    }
    expect(holds('sfc-elsewhere')).toBe(REVOKED)
    expect(await findEarlyAccessSponsor(CONF, TOKEN)).toBeNull()
    expect(await conferenceEarlyAccessLinks(CONF)).toEqual([])
    expect(await resolveEarlyAccess(CONF, TOKEN)).toBeNull()
  })

  it('a duplicate that cannot be cleared keeps the link live: the revoke fails, and says so', async () => {
    store().reset(duplicated)
    store().failPatchesOf('sfc-acme-copy')

    await expect(revokeEarlyAccessLink(CONF, SFC)).rejects.toThrow(
      'Could not revoke the early-access link',
    )
    // Still live, and still on the sponsor: the next revoke finds it there.
    expect(await findEarlyAccessSponsor(CONF, TOKEN)).toEqual({ _id: SFC })
    expect(holds('sfc-acme-copy')).toBe(TOKEN)
  })
})

/**
 * "REVOKE AGAIN" MUST HAVE SOMETHING TO FIND. The tokens to revoke are read
 * from the sponsor's own versions, so the sponsor's own PUBLISHED document is
 * cleared last, and only once no other published document of the conference
 * holds one of them. A revoke that could not finish leaves that document as
 * it was, and the next one starts from the same place.
 */
describe('a revoke that could not clear another published holder, and the next one', () => {
  const duplicated = [
    ACME,
    sponsor({ workshopEarlyAccessToken: TOKEN }),
    sponsor({ _id: 'drafts.' + SFC, workshopEarlyAccessToken: TOKEN }),
    sponsor({ _id: 'sfc-acme-copy', workshopEarlyAccessToken: TOKEN }),
  ]
  const holds = (id: string) => store().doc(id)?.workshopEarlyAccessToken
  const failed = async () => {
    store().reset(duplicated)
    store().failPatchesOf('sfc-acme-copy')
    await expect(revokeEarlyAccessLink(CONF, SFC)).rejects.toThrow(
      'Could not revoke the early-access link',
    )
  }

  it('the failed revoke leaves the token on the sponsor it was asked for', async () => {
    await failed()

    expect({ sponsor: holds(SFC), other: holds('sfc-acme-copy') }).toEqual({
      sponsor: TOKEN,
      other: TOKEN,
    })
  })

  it('revoking again while the other holder still cannot be cleared fails again: it never reports a live link revoked', async () => {
    await failed()

    await expect(revokeEarlyAccessLink(CONF, SFC)).rejects.toThrow(
      'Could not revoke the early-access link',
    )
    expect({
      sponsor: holds(SFC),
      other: holds('sfc-acme-copy'),
      live: await findEarlyAccessSponsor(CONF, TOKEN),
    }).toEqual({ sponsor: TOKEN, other: TOKEN, live: { _id: SFC } })
  })

  it('revoking again once it can be cleared clears both, and the link is not live', async () => {
    await failed()
    store().allowPatchesOf('sfc-acme-copy')

    expect(await revokeEarlyAccessLink(CONF, SFC)).toEqual({ notCleared: [] })

    expect({
      sponsor: holds(SFC),
      draft: holds('drafts.' + SFC),
      other: holds('sfc-acme-copy'),
      live: await findEarlyAccessSponsor(CONF, TOKEN),
      cached: await resolveEarlyAccess(CONF, TOKEN),
    }).toEqual({
      sponsor: undefined,
      draft: undefined,
      other: undefined,
      live: null,
      cached: null,
    })
  })

  // The other holder turns up only after the revoke has read who holds the
  // token: found in a later round, and still cleared before the sponsor.
  it('a published holder that appears while the revoke runs is cleared before the sponsor is', async () => {
    store().reset([ACME, sponsor({ workshopEarlyAccessToken: TOKEN })])
    store().failPatchesOf('sfc-late-copy')
    // Just before the first write, which holds the sponsor alone: the copy
    // arrives, and the sponsor is edited, so that write is refused for its
    // revision and the rounds take over.
    store().beforeNextCommit(() => {
      store().put(
        sponsor({ _id: 'sfc-late-copy', workshopEarlyAccessToken: TOKEN }),
      )
      store().put(sponsor({ _rev: 'edited', workshopEarlyAccessToken: TOKEN }))
    })

    await expect(revokeEarlyAccessLink(CONF, SFC)).rejects.toThrow(
      'Could not revoke the early-access link',
    )

    expect({ sponsor: holds(SFC), late: holds('sfc-late-copy') }).toEqual({
      sponsor: TOKEN,
      late: TOKEN,
    })
  })
})

/**
 * AN UNPUBLISHED COPY OF ANOTHER DOCUMENT that still holds a revoked token
 * does not keep the link live, and must not keep the revoke from finishing:
 * the sponsor is cleared and the copy is named. A later revoke cannot find
 * that copy from the sponsor, which holds no token by then, so it is handed
 * the ids the first one answered, and clears a token there only when it is
 * a dead one: on an unpublished copy, of this conference, that no published
 * document of the conference holds.
 */
describe('a revoke that left an unpublished copy of another document, and the next one', () => {
  const OTHERS_COPY = 'versions.rSpring.sfc-acme-copy'
  const holds = (id: string) => store().doc(id)?.workshopEarlyAccessToken
  const left = async () => {
    store().reset([
      ACME,
      sponsor({ workshopEarlyAccessToken: TOKEN }),
      sponsor({ _id: OTHERS_COPY, workshopEarlyAccessToken: TOKEN }),
    ])
    store().failPatchesOf(OTHERS_COPY)
    expect(await revokeEarlyAccessLink(CONF, SFC)).toEqual({
      notCleared: [OTHERS_COPY],
    })
    expect({ sponsor: holds(SFC), copy: holds(OTHERS_COPY) }).toEqual({
      sponsor: undefined,
      copy: TOKEN,
    })
  }

  it('the link is not live, and the copy is named', async () => {
    await left()

    expect(await findEarlyAccessSponsor(CONF, TOKEN)).toBeNull()
  })

  it('the next revoke, handed that copy, clears it', async () => {
    await left()
    store().allowPatchesOf(OTHERS_COPY)

    expect(
      await revokeEarlyAccessLink(CONF, SFC, { leftCopies: [OTHERS_COPY] }),
    ).toEqual({ notCleared: [] })

    expect(store().doc(OTHERS_COPY)).toMatchObject({ _id: OTHERS_COPY })
    expect(holds(OTHERS_COPY)).toBeUndefined()
  })

  it('the next revoke names it again while it still cannot be cleared', async () => {
    await left()

    expect(
      await revokeEarlyAccessLink(CONF, SFC, { leftCopies: [OTHERS_COPY] }),
    ).toEqual({ notCleared: [OTHERS_COPY] })
    expect(holds(OTHERS_COPY)).toBe(TOKEN)
  })

  it('clears nothing but a dead token on an unpublished copy of this conference', async () => {
    const LIVE_ELSEWHERE = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
    store().reset([
      ACME,
      sponsor(),
      // A published document, named by a caller that should not have.
      sponsor({ _id: 'sfc-published', workshopEarlyAccessToken: REVOKED }),
      // A copy in step with a link that is live: its token is not dead.
      sponsor({ _id: 'sfc-linked', workshopEarlyAccessToken: LIVE_ELSEWHERE }),
      sponsor({
        _id: 'drafts.sfc-linked',
        workshopEarlyAccessToken: LIVE_ELSEWHERE,
      }),
      // Another conference's copy.
      sponsor({
        _id: 'drafts.sfc-theirs',
        conference: ref(OTHER_CONF),
        workshopEarlyAccessToken: 'their-token',
      }),
      // The one that qualifies.
      sponsor({ _id: 'drafts.sfc-dead', workshopEarlyAccessToken: TOKEN }),
    ])

    expect(
      await revokeEarlyAccessLink(CONF, SFC, {
        leftCopies: [
          'sfc-published',
          'drafts.sfc-linked',
          'drafts.sfc-theirs',
          'drafts.sfc-dead',
          'drafts.no-such-document',
        ],
      }),
    ).toEqual({ notCleared: [] })

    expect({
      published: holds('sfc-published'),
      inStep: holds('drafts.sfc-linked'),
      theirs: holds('drafts.sfc-theirs'),
      dead: holds('drafts.sfc-dead'),
    }).toEqual({
      published: REVOKED,
      inStep: LIVE_ELSEWHERE,
      theirs: 'their-token',
      dead: undefined,
    })
  })
})

/**
 * TWO PUBLISHED DOCUMENTS HOLDING ONE TOKEN (a copy made by a script; Studio
 * can no longer duplicate): the sponsor recorded at sign-up comes from the
 * live read and the name shown from the cached one. Both take the lowest
 * `_id`, so they name the same sponsor, whatever order the store answers in.
 */
describe('one token on two published documents', () => {
  const GLOBEX = { _id: 'sponsor-globex', _type: 'sponsor', name: 'Globex' }
  // Stored with the higher id FIRST: an unordered read answers that one.
  const twice = [
    ACME,
    GLOBEX,
    sponsor({ _id: 'sfc-zenith', workshopEarlyAccessToken: TOKEN }),
    sponsor({
      _id: 'sfc-aardvark',
      sponsor: ref('sponsor-globex'),
      workshopEarlyAccessToken: TOKEN,
    }),
  ]

  it('the live read and the cached read answer the same sponsor: the lowest id', async () => {
    store().reset(twice)

    expect({
      recorded: await findEarlyAccessSponsor(CONF, TOKEN),
      shown: await resolveEarlyAccess(CONF, TOKEN),
    }).toEqual({
      recorded: { _id: 'sfc-aardvark' },
      shown: { sponsorName: 'Globex' },
    })
  })
})

describe('the stored token, read for a link’s address', () => {
  // The procedure's own guard refuses a foreign sponsor first. This is the
  // read's own scope, on the query as it is executed: without it the read
  // would answer any sponsor's token to whoever got past (or around) that.
  it('answers a token only for a sponsor of the conference it is asked in', async () => {
    store().reset([
      sponsor({ workshopEarlyAccessToken: TOKEN }),
      sponsor({
        _id: 'sfc-theirs',
        conference: ref(OTHER_CONF),
        workshopEarlyAccessToken: 'their-token',
      }),
    ])

    expect({
      ours: await readEarlyAccessToken(CONF, SFC),
      theirsAskedHere: await readEarlyAccessToken(CONF, 'sfc-theirs'),
      theirsAskedThere: await readEarlyAccessToken(OTHER_CONF, 'sfc-theirs'),
    }).toEqual({
      ours: TOKEN,
      theirsAskedHere: null,
      theirsAskedThere: 'their-token',
    })
  })
})

describe('the cached read is a cached function', () => {
  // The directive is inert under Vitest, so nothing here can run it. Without
  // it every view and every opened link would read Sanity, and "a made-up
  // token costs no read" would be false. Pinned on the source.
  it("opens with 'use cache: remote'", () => {
    const source = readFileSync(join(__dirname, 'links.ts'), 'utf8')
    const body = source.slice(
      source.indexOf('export async function conferenceEarlyAccessLinks'),
    )

    expect(body.slice(body.indexOf('{\n') + 2).trimStart()).toMatch(
      /^'use cache: remote'\n/,
    )
  })
})

describe('the live read', () => {
  it('goes to the uncached client, within the conference', async () => {
    await findEarlyAccessSponsor(CONF, TOKEN)

    expect(store().reads).toHaveLength(1)
    expect(store().reads[0].client).toBe('uncached')
    expect(store().reads[0].params).toMatchObject({ conferenceId: CONF })
  })

  // "Uncached" names the client (no CDN). Next's own fetch cache is a second
  // one, and this option is what keeps the lookup out of it: a remembered
  // answer would keep a revoked link signing people up.
  it('is sent with no-store, so no remembered answer is served', async () => {
    await findEarlyAccessSponsor(CONF, TOKEN)

    expect(store().reads.map((read) => read.cache)).toEqual(['no-store'])
  })

  it.each([
    ['an empty value', ''],
    ['a word', 'early-access'],
    ['a token with something appended', `${TOKEN}"]`],
    ['a very long value', 'a'.repeat(4000)],
  ])(
    'reads nothing for %s: it is not a token this issues',
    async (_case, value) => {
      expect(await findEarlyAccessSponsor(CONF, value)).toBeNull()
      expect(store().reads).toEqual([])
      // A token of that very shape is read.
      expect(await findEarlyAccessSponsor(CONF, TOKEN)).toEqual({ _id: SFC })
    },
  )
})
