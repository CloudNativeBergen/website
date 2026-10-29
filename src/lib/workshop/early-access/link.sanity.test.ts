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

import {
  createEarlyAccessLink,
  findEarlyAccessSponsor,
  revokeEarlyAccessLink,
} from './link'

const store = () => h.store!
const CONF = 'conf-a'
const SFC = 'sfc-acme'
const FIELD = 'workshopEarlyAccessToken'
const TOKEN = '4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'
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

    expect(result).toEqual({
      token: expect.stringMatching(UUID),
      notWritten: [],
    })
    expect(stored(SFC)).toBe((result as { token: string }).token)
  })

  it('answers the stored token when there is one, and writes nothing', async () => {
    store().reset([sponsor({ [FIELD]: 'stored-token' })])

    expect(await createEarlyAccessLink(CONF, SFC)).toEqual({
      token: 'stored-token',
      notWritten: [],
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
    expect(first).toEqual({
      token: expect.stringMatching(UUID),
      notWritten: [],
    })
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
      notWritten: [],
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

describe('the token is written only to the sponsor that passed the checks', () => {
  it('the write, as the real client sends it: only if none is stored, and only to the revision that was read', async () => {
    const { token } = (await createEarlyAccessLink(CONF, SFC)) as {
      token: string
    }

    // `ifRevisionID` is enforced by Sanity, and here by the store's model of
    // it; `setIfMissing` by `@sanity/mutator` itself.
    expect(store().commits).toEqual([
      [
        {
          patch: {
            id: SFC,
            ifRevisionID: 'r0',
            setIfMissing: { [FIELD]: token },
          },
        },
      ],
    ])
  })

  it('a deal moved out of won between the check and the write gets no token, and the refusal', async () => {
    // The CRM update lands after the create read "won" and before it writes.
    store().beforeNextCommit(() => {
      store().put(sponsor({ _rev: 'r1', status: 'closed-lost' }))
    })

    expect(await createEarlyAccessLink(CONF, SFC)).toEqual({
      refused: 'not-won',
    })
    expect(stored(SFC)).toBeUndefined()
  })

  it('a sponsor moved to another conference between the check and the write gets no token', async () => {
    store().beforeNextCommit(() => {
      store().put(sponsor({ _rev: 'r1', conference: ref('conf-b') }))
    })

    expect(await createEarlyAccessLink(CONF, SFC)).toEqual({
      refused: 'not-found',
    })
    expect(stored(SFC)).toBeUndefined()
  })

  it('an unrelated edit in between does not stop the create: it starts over and stores the token', async () => {
    store().beforeNextCommit(() => {
      store().put(sponsor({ _rev: 'r1', notes: 'Called them on Tuesday' }))
    })

    const result = (await createEarlyAccessLink(CONF, SFC)) as { token: string }

    expect(result.token).toMatch(UUID)
    expect(stored(SFC)).toBe(result.token)
    expect(store().doc(SFC)?.notes).toBe('Called them on Tuesday')
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

  it('a draft moved to another conference before the copies are written does not get the token', async () => {
    store().reset(withCopies())
    // The first commit stores the token. Before the second, which writes the
    // copies, the draft is edited in Studio: it now names another conference.
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(() => {
      store().put(
        sponsor({ _id: DRAFT, _rev: 'moved', conference: ref('conf-b') }),
      )
    })

    const result = (await createEarlyAccessLink(CONF, SFC)) as {
      token: string
      notWritten: string[]
    }

    expect(stored(SFC)).toBe(result.token)
    expect(stored(DRAFT)).toBeUndefined()
    // The release copy, still this conference's, got it.
    expect(stored(RELEASE_COPY)).toBe(result.token)
    expect(result.notWritten).toEqual([])
  })

  it('a revoke that lands before the copies are written leaves no copy holding the revoked token', async () => {
    store().reset(withCopies())
    // The first commit stores the token. The revoke runs just before the
    // second one, which would write that token to the copies.
    let revoked: string | undefined
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(async () => {
      revoked = stored(SFC) as string
      await revokeEarlyAccessLink(CONF, SFC)
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

describe('a create never answers a link that is no longer stored', () => {
  it('a revoke that lands right after the token is stored: the create starts over', async () => {
    let revoked: string | undefined
    store().afterNextCommit(async () => {
      revoked = stored(SFC) as string
      await revokeEarlyAccessLink(CONF, SFC)
    })

    const { token } = (await createEarlyAccessLink(CONF, SFC)) as {
      token: string
    }

    expect(revoked).toMatch(UUID)
    expect(token).not.toBe(revoked)
    expect(stored(SFC)).toBe(token)
  })

  it('a copy without the token is published right after it is stored: the create starts over', async () => {
    let lost: string | undefined
    store().afterNextCommit(() => {
      lost = stored(SFC) as string
      // Publishing replaces the published document with the copy.
      store().put(sponsor({ _rev: 'published-from-draft' }))
    })

    const { token } = (await createEarlyAccessLink(CONF, SFC)) as {
      token: string
    }

    expect(lost).toMatch(UUID)
    expect(token).not.toBe(lost)
    expect(stored(SFC)).toBe(token)
  })

  it('a copy that cannot be written does not hide a link that is stored: the token is answered, and the copy named', async () => {
    store().reset(withCopies())
    store().failPatchesOf(RELEASE_COPY)

    const result = (await createEarlyAccessLink(CONF, SFC)) as {
      token: string
      notWritten: string[]
    }

    expect(result.token).toMatch(UUID)
    expect(stored(SFC)).toBe(result.token)
    // One transaction writes the copies: neither got the token.
    expect(result.notWritten).toEqual([DRAFT, RELEASE_COPY])
    // Pressing create again answers the same link.
    expect(await createEarlyAccessLink(CONF, SFC)).toEqual(result)
  })

  it('a revoke that lands after the last failed attempt: the create does not answer the revoked token', async () => {
    store().reset(withCopies())
    store().failPatchesOf(RELEASE_COPY)
    // The copies cannot be written, so every attempt fails and the create
    // falls back to what is stored. A revoke lands just before that last
    // look: the fourth time every version is read.
    let versionReads = 0
    let revoked: unknown
    store().beforeEachRead(async (read) => {
      if (!read.query.includes('versions.**') || ++versionReads !== 4) return
      revoked = stored(SFC)
      await revokeEarlyAccessLink(CONF, SFC)
    })

    await expect(createEarlyAccessLink(CONF, SFC)).rejects.toThrow(
      'early-access link',
    )
    expect(revoked).toMatch(UUID)
    expect(stored(SFC)).toBeUndefined()
  })

  it.each([
    ['no copies to bring in step', () => [sponsor({ [FIELD]: TOKEN })]],
    [
      'copies behind',
      () =>
        withCopies().map((doc, i) =>
          i === 0 ? { ...doc, [FIELD]: TOKEN } : doc,
        ),
    ],
  ])(
    'for a send, a deal lost between the two looks is refused (%s)',
    async (_, docs) => {
      store().reset(docs())
      // The deal is lost after the sponsor was read won, just before every
      // version of it is read.
      store().beforeEachRead((read) => {
        if (!read.query.includes('versions.**')) return
        if (store().doc(SFC)?.status !== 'closed-won') return
        store().put({ ...store().doc(SFC)!, status: 'closed-lost' })
      })

      expect(await createEarlyAccessLink(CONF, SFC, { wonOnly: true })).toEqual(
        { refused: 'not-won' },
      )
      expect(stored(SFC)).toBe(TOKEN)
    },
  )

  it('for a send, a deal lost before the last look is refused, also when the token is stored', async () => {
    store().reset(withCopies())
    store().failPatchesOf(RELEASE_COPY)
    // Every attempt fails on the copies, so the create falls back to what is
    // stored. The deal is lost just before that last look.
    let versionReads = 0
    store().beforeEachRead((read) => {
      if (!read.query.includes('versions.**') || ++versionReads !== 4) return
      store().put({ ...store().doc(SFC)!, status: 'closed-lost' })
    })

    expect(await createEarlyAccessLink(CONF, SFC, { wonOnly: true })).toEqual({
      refused: 'not-won',
    })
    expect(stored(SFC)).toMatch(UUID)
  })

  it('refuses, rather than answer a dead address, when it keeps losing', async () => {
    const revoke = () => revokeEarlyAccessLink(CONF, SFC)
    // The hooks run after the first, third and fifth commit: each attempt's
    // store. (The second and fourth are the revokes' own.)
    store().afterNextCommit(async () => {
      await revoke()
      store().afterNextCommit(async () => {
        await revoke()
        store().afterNextCommit(revoke)
      })
    })

    await expect(createEarlyAccessLink(CONF, SFC)).rejects.toThrow(
      'early-access link',
    )
    expect(stored(SFC)).toBeUndefined()
  })
})

describe('revoking a link', () => {
  it('answers that nothing was left behind', async () => {
    store().reset(withCopies({ [FIELD]: 'stored-token' }))

    expect(await revokeEarlyAccessLink(CONF, SFC)).toEqual({ notCleared: [] })
  })

  it('a release copy that cannot be changed does not keep the link live, and is reported', async () => {
    store().reset(withCopies({ [FIELD]: 'stored-token' }))
    store().failPatchesOf(RELEASE_COPY)

    const result = await revokeEarlyAccessLink(CONF, SFC)

    expect(stored(SFC)).toBeUndefined()
    expect(stored(DRAFT)).toBeUndefined()
    expect(stored(RELEASE_COPY)).toBe('stored-token')
    expect(result).toEqual({ notCleared: [RELEASE_COPY] })
  })

  it('a draft made from the still-linked sponsor while the revoke runs ends without the token', async () => {
    store().reset([sponsor({ [FIELD]: 'stored-token' })])
    // Between the revoke's read and its commit, Studio makes a draft: a copy
    // of the published document as it is, token and all.
    store().beforeNextCommit(() => {
      store().put(sponsor({ _id: DRAFT, [FIELD]: 'stored-token' }))
    })

    const result = await revokeEarlyAccessLink(CONF, SFC)

    expect(store().doc(DRAFT)).toBeDefined()
    expect(stored(DRAFT)).toBeUndefined()
    expect(stored(SFC)).toBeUndefined()
    expect(result).toEqual({ notCleared: [] })
  })

  it('leaves the copies of a link created right after it in step', async () => {
    store().reset(withCopies({ [FIELD]: 'stored-token' }))
    let created: string | undefined
    // The revoke's first commit clears the sponsor and its draft. A create
    // lands right after it.
    store().afterNextCommit(async () => {
      created = ((await createEarlyAccessLink(CONF, SFC)) as { token: string })
        .token
    })

    await revokeEarlyAccessLink(CONF, SFC)

    expect(created).toMatch(UUID)
    expect(stored(SFC)).toBe(created)
    expect(stored(DRAFT)).toBe(created)
    expect(stored(RELEASE_COPY)).toBe(created)
  })

  it('does not strip a copy that a create wrote after the revoke read it', async () => {
    store().reset([
      sponsor({ [FIELD]: 'stored-token' }),
      sponsor({ _id: RELEASE_COPY, [FIELD]: 'stored-token' }),
    ])
    store().beforeNextCommit(() => {})
    // Before the commit that clears the release copy: a create has stored a
    // new token and written it to the copy.
    store().beforeNextCommit(() => {
      store().put(sponsor({ _rev: 'r-new', [FIELD]: 'new-token' }))
      store().put(
        sponsor({ _id: RELEASE_COPY, _rev: 'r-new', [FIELD]: 'new-token' }),
      )
    })

    await revokeEarlyAccessLink(CONF, SFC)

    expect(stored(SFC)).toBe('new-token')
    expect(stored(RELEASE_COPY)).toBe('new-token')
  })

  it('a copy that still holds the revoked token is published while the revoke runs: the link is not live', async () => {
    store().reset([
      sponsor({ [FIELD]: TOKEN }),
      sponsor({ _id: RELEASE_COPY, [FIELD]: TOKEN }),
    ])
    // Right after the revoke cleared the published document, the release is
    // published: the copy, token and all, replaces it.
    store().afterNextCommit(() => {
      store().put(sponsor({ _rev: 'published-from-release', [FIELD]: TOKEN }))
    })

    const result = await revokeEarlyAccessLink(CONF, SFC)

    expect(stored(SFC)).toBeUndefined()
    expect(stored(RELEASE_COPY)).toBeUndefined()
    expect(await findEarlyAccessSponsor(CONF, TOKEN)).toBeNull()
    expect(result).toEqual({ notCleared: [] })
  })

  it('fails, and says so, when the published document still holds the revoked token after the last round', async () => {
    store().reset([sponsor({ [FIELD]: TOKEN })])
    store().afterNextCommit(() => {
      store().put(sponsor({ _rev: 'published-from-release', [FIELD]: TOKEN }))
      store().failPatchesOf(SFC)
    })

    await expect(revokeEarlyAccessLink(CONF, SFC)).rejects.toThrow(
      'Could not revoke the early-access link',
    )
    // The control for the test above: here the link IS still live.
    expect(await findEarlyAccessSponsor(CONF, TOKEN)).toEqual({ _id: SFC })
  })

  it('a second revoke and a create finish while this one waits to write: the new link is left whole', async () => {
    store().reset(withCopies({ [FIELD]: TOKEN }))
    let created: string | undefined
    // This revoke has read every version holding TOKEN. Before its first
    // write lands, a colleague's revoke and then a create both complete.
    store().beforeNextCommit(async () => {
      await revokeEarlyAccessLink(CONF, SFC)
      created = ((await createEarlyAccessLink(CONF, SFC)) as { token: string })
        .token
    })

    const result = await revokeEarlyAccessLink(CONF, SFC)

    expect(created).toMatch(UUID)
    expect(created).not.toBe(TOKEN)
    // The new token is on every version that had it, the revoked one on none.
    expect(stored(SFC)).toBe(created)
    expect(stored(DRAFT)).toBe(created)
    expect(stored(RELEASE_COPY)).toBe(created)
    expect(result).toEqual({ notCleared: [] })
  })

  it('a draft that is gone by the time the revoke writes does not stop it', async () => {
    store().reset([
      sponsor({ [FIELD]: TOKEN }),
      sponsor({ _id: DRAFT, [FIELD]: TOKEN }),
    ])
    // The draft is published or discarded between the read and the write.
    store().beforeNextCommit(() => {
      store().reset([sponsor({ _rev: 'r0', [FIELD]: TOKEN })])
    })

    expect(await revokeEarlyAccessLink(CONF, SFC)).toEqual({ notCleared: [] })
    expect(stored(SFC)).toBeUndefined()
  })

  it('does not write to a copy that was moved to another conference while it ran', async () => {
    store().reset(withCopies({ [FIELD]: TOKEN }))
    store().beforeNextCommit(() => {
      store().put(
        sponsor({
          _id: DRAFT,
          _rev: 'moved',
          conference: ref('conf-b'),
          [FIELD]: TOKEN,
        }),
      )
    })

    expect(await revokeEarlyAccessLink(CONF, SFC)).toEqual({ notCleared: [] })

    expect(stored(SFC)).toBeUndefined()
    expect(stored(RELEASE_COPY)).toBeUndefined()
    // No longer this conference's copy: left exactly as it was.
    expect(store().doc(DRAFT)).toMatchObject({ _rev: 'moved', [FIELD]: TOKEN })
  })

  it('acts only within the conference it is given', async () => {
    store().reset(
      withCopies({ conference: ref('conf-b'), [FIELD]: 'their-token' }),
    )

    expect(await revokeEarlyAccessLink(CONF, SFC)).toEqual({ notCleared: [] })

    expect(store().commits).toEqual([])
    expect(stored(SFC)).toBe('their-token')
    expect(stored(DRAFT)).toBe('their-token')
  })

  it('removes the token from the sponsor and from every unpublished copy', async () => {
    store().reset(withCopies({ [FIELD]: 'stored-token' }))

    await revokeEarlyAccessLink(CONF, SFC)

    expect(store().doc(SFC)).toBeDefined()
    expect(stored(SFC)).toBeUndefined()
    expect(stored(DRAFT)).toBeUndefined()
    expect(stored(RELEASE_COPY)).toBeUndefined()
  })

  // The sponsor's versions can hold DIFFERENT tokens: a release copy made
  // from an earlier link that a failed revoke left behind. Every one of them
  // is revoked, or publishing that copy brings a link back.
  it('two different tokens on the sponsor’s versions: neither is left on any of them', async () => {
    store().reset([
      sponsor({ [FIELD]: 'current-token' }),
      sponsor({ _id: DRAFT, [FIELD]: 'current-token' }),
      sponsor({ _id: RELEASE_COPY, [FIELD]: 'older-token' }),
    ])

    const result = await revokeEarlyAccessLink(CONF, SFC)

    expect({
      published: stored(SFC),
      draft: stored(DRAFT),
      releaseCopy: stored(RELEASE_COPY),
      result,
    }).toEqual({
      published: undefined,
      draft: undefined,
      releaseCopy: undefined,
      result: { notCleared: [] },
    })
    // Not by deleting anything: all three are still there.
    expect(
      store()
        .all()
        .map((each) => each._id),
    ).toEqual([SFC, DRAFT, RELEASE_COPY])
  })

  it('a create after a revoke stores a different token', async () => {
    const first = (await createEarlyAccessLink(CONF, SFC)) as { token: string }
    await revokeEarlyAccessLink(CONF, SFC)
    const second = (await createEarlyAccessLink(CONF, SFC)) as { token: string }

    expect(second.token).toMatch(UUID)
    expect(second.token).not.toBe(first.token)
    expect(stored(SFC)).toBe(second.token)
  })

  it('writes nothing for a sponsor that has no link', async () => {
    await revokeEarlyAccessLink(CONF, SFC)

    expect(store().commits).toEqual([])
  })
})
