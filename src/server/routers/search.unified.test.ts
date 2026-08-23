/**
 * THE COMMAND PALETTE'S COST CONTRACT.
 *
 * Two properties here are invisible to every other test and both were wrong in
 * production:
 *
 *  1. HOW MANY Sanity reads a search costs. It used to be THREE tRPC procedures
 *     — batched into one HTTP request by tRPC, which is exactly what hid it —
 *     each re-running the authorization waist and its own GROQ, five Sanity
 *     reads in total, per debounce tick. Nothing in the rendered output changes
 *     if that fan-out comes back, so the ONLY thing that can stop it returning
 *     is an assertion on the call count itself.
 *  2. WHICH CLIENT runs it. `clientReadCached` and `clientReadUncached` have the
 *     same signature, the same token and return the same rows; swapping the
 *     identifier changes no output and no other assertion. It only moves the
 *     traffic onto the metered live-API quota. Hence a separate spy per client,
 *     and assertions that the other two did NOT run — a one-sided assertion
 *     would still pass if the read fanned out to both.
 *
 * The authorization cases assert the read NEVER RAN, not merely that the call
 * threw: fetching and then refusing still bills the quota, and still answers the
 * question "does this tenant exist".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

const CONFERENCE_ID = 'conf-bergen'
const ORG_ID = 'org-test'

const ROWS = {
  proposals: [
    {
      _id: 'talk-1',
      title: 'Kubernetes at scale',
      status: 'submitted',
      format: 'presentation_25',
      speakers: [{ _id: 'sp-1', name: 'Jane Doe' }],
    },
  ],
  sponsors: [
    { _id: 'spon-1', name: 'Kubernetes Corp', website: 'https://k.io' },
  ],
  speakers: [
    {
      _id: 'sp-1',
      name: 'Jane Doe',
      title: 'Kubernetes Architect',
      email: 'jane@example.com',
      bio: 'Writes about clusters',
      isOrganizer: false,
      hasCurrentConferenceTalk: true,
    },
    {
      _id: 'sp-2',
      name: 'Nobody Matching',
      title: 'Baker',
      email: 'no@example.com',
      bio: 'Bakes bread',
      isOrganizer: false,
      hasCurrentConferenceTalk: true,
    },
  ],
}

const EMPTY = { proposals: [], sponsors: [], speakers: [] }

/**
 * Every client resolves the unified query to a plausible payload, so a case
 * fails because the WRONG CLIENT ran — never because a stub returned nothing
 * and the handler bailed early. A mis-routed read and a crashed read must not
 * look alike. Anything that is NOT the unified query resolves empty, so a
 * handler that sent some other text cannot borrow this fixture.
 */
const respond = async (query: unknown) =>
  String(query).includes('"proposals"') ? ROWS : EMPTY

// Rest parameters so the recorded calls keep the query, the params AND the
// fetch options — the assertions below read `calls[0][1]` and `calls[0][2]`.
const cdnFetch = vi.fn(async (...args: unknown[]) => respond(args[0]))
const liveFetch = vi.fn(async (...args: unknown[]) => respond(args[0]))
const writeFetch = vi.fn(async (...args: unknown[]) => respond(args[0]))

vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: (...a: unknown[]) => cdnFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => liveFetch(...a) },
  clientWrite: {
    fetch: (...a: unknown[]) => writeFetch(...a),
    create: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  sanityImage: () => ({ url: () => '' }),
  speakerImageUrl: () => '',
}))

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

import { searchRouter } from './search'

/** An organizer of the org the request domain resolves to, unless told otherwise. */
function makeCaller(organizerOrgIds: string[] = [ORG_ID]) {
  const speaker = {
    _id: 'sp-caller',
    name: 'Org',
    isOrganizer: true,
    organizerOrgIds,
  }
  const ctx = {
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context
  return searchRouter.createCaller(ctx)
}

const noReadRan = () => {
  expect(cdnFetch).not.toHaveBeenCalled()
  expect(liveFetch).not.toHaveBeenCalled()
  expect(writeFetch).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({
    conference: {
      _id: CONFERENCE_ID,
      organization: { _type: 'reference', _ref: ORG_ID },
    },
    error: null,
  })
})

describe('search.unified — ONE round-trip', () => {
  it('costs exactly ONE Sanity read for all three sources', async () => {
    await makeCaller().unified({ query: 'kubernetes' })

    expect(cdnFetch).toHaveBeenCalledTimes(1)
    expect(liveFetch).not.toHaveBeenCalled()
    expect(writeFetch).not.toHaveBeenCalled()
  })

  it('asks for all three sources in that one query', async () => {
    await makeCaller().unified({ query: 'kubernetes' })

    const query = String(cdnFetch.mock.calls[0][0])
    expect(query).toContain('"proposals"')
    expect(query).toContain('"sponsors"')
    expect(query).toContain('"speakers"')
  })

  it('runs on the CDN client, never the live API or the write token', async () => {
    await makeCaller().unified({ query: 'kubernetes' })

    expect(cdnFetch).toHaveBeenCalledTimes(1)
    expect(liveFetch).not.toHaveBeenCalled()
    expect(writeFetch).not.toHaveBeenCalled()
  })

  it('keeps Next’s data cache out of the admin search', async () => {
    await makeCaller().unified({ query: 'kubernetes' })

    expect(cdnFetch.mock.calls[0][2]).toEqual({ cache: 'no-store' })
  })

  it('never sets `perspective`, which would silently disable CDN routing', async () => {
    await makeCaller().unified({ query: 'kubernetes' })

    expect(cdnFetch.mock.calls[0][2]).not.toHaveProperty('perspective')
  })
})

describe('search.unified — tenant scope travels as GROQ parameters', () => {
  it('binds the domain conference and org, and bakes neither into the text', async () => {
    await makeCaller().unified({ query: 'kubernetes' })

    const [query, params] = cdnFetch.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ]
    expect(params).toMatchObject({
      conferenceId: CONFERENCE_ID,
      orgId: ORG_ID,
    })
    expect(query).toContain('$conferenceId')
    expect(query).toContain('$orgId')
    expect(query).not.toContain(CONFERENCE_ID)
    expect(query).not.toContain(ORG_ID)
    // The tenant is the DOMAIN's conference — never anything the caller sent.
    expect(getConferenceMock).toHaveBeenCalled()
  })
})

describe('search.unified — the authorization waist', () => {
  it('refuses an organizer of ANOTHER org, without reading anything', async () => {
    await expect(
      makeCaller(['some-other-org']).unified({ query: 'kubernetes' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    noReadRan()
  })

  it('refuses a signed-in non-organizer, without reading anything', async () => {
    await expect(
      makeCaller([]).unified({ query: 'kubernetes' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    noReadRan()
  })

  it('refuses an anonymous caller, without reading anything', async () => {
    const caller = searchRouter.createCaller({
      session: null,
    } as unknown as Context)

    await expect(caller.unified({ query: 'kubernetes' })).rejects.toMatchObject(
      { code: 'UNAUTHORIZED' },
    )

    noReadRan()
  })

  it('refuses when the request domain resolves to no organization', async () => {
    // FAIL CLOSED. Without an org the sponsor predicate has no tenant key, and
    // an unscoped sponsor read is every tenant's sponsor list.
    //
    // HONEST ABOUT WHICH CONTROL FIRES: this refusal comes from the WAIST
    // (`requireAdmin` denies an unresolvable org), not from the handler's own
    // `if (!orgId)`. Removing that handler guard does NOT make this case fail —
    // it is defence in depth, and the guard that would notice its removal is
    // the lib-level one in `src/lib/search/sanity.failclosed.test.ts`, which calls
    // `searchUnified` directly.
    getConferenceMock.mockResolvedValue({ conference: null, error: null })

    await expect(
      makeCaller().unified({ query: 'kubernetes' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    noReadRan()
  })
})

describe('search.unified — the ≥2-character floor is a SERVER rule', () => {
  it('rejects a one-character query without reading anything', async () => {
    await expect(makeCaller().unified({ query: 'k' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })

    noReadRan()
  })

  it('rejects a query that is only one character once trimmed', async () => {
    await expect(
      makeCaller().unified({ query: '  k  ' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    noReadRan()
  })

  it('accepts exactly two characters', async () => {
    await makeCaller().unified({ query: 'k8' })

    expect(cdnFetch).toHaveBeenCalledTimes(1)
  })
})

describe('search.unified — the payload the palette groups', () => {
  it('returns the three sources under their own keys', async () => {
    const result = await makeCaller().unified({ query: 'kubernetes' })

    expect(Object.keys(result).sort()).toEqual([
      'proposals',
      'speakers',
      'sponsors',
    ])
    expect(result.proposals[0]._id).toBe('talk-1')
    expect(result.sponsors[0]._id).toBe('spon-1')
  })

  it('applies the speaker substring match `speaker.admin.search` used', async () => {
    const result = await makeCaller().unified({ query: 'kubernetes' })

    // `sp-2` came back in the corpus and matches nothing; it must not be shown.
    expect(result.speakers.map((s) => s._id)).toEqual(['sp-1'])
  })

  it('never ships a speaker bio to the browser', async () => {
    const result = await makeCaller().unified({ query: 'kubernetes' })

    expect(Object.keys(result.speakers[0]).sort()).toEqual([
      '_id',
      'email',
      'name',
      'title',
    ])
  })
})
