import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

/**
 * A stand-in for Sanity that behaves the way the real dataset does for the
 * three things this route depends on: the tenant predicate, the code, and the
 * exclusion of drafts and versions. Documents are stored per conference, and
 * `drafts.*` / `versions.*` ids are returned ONLY when the query does not
 * exclude them — so deleting either clause from the query makes a test fail on
 * the draft's link being served, not on an absence.
 */
interface FakeDoc {
  _id: string
  _type: 'socialPostVariant' | 'marketingTask'
  conferenceId: string
  shortCode: string
  link?: string | null
  kind?: string | null
  targetPage?: string | null
  key?: string | null
  campaignKey?: string | null
}

let dataset: FakeDoc[] = []
const sanityFetch = vi.fn(
  async (query: string, params: Record<string, string>) => {
    const excludesDrafts = query.includes('!(_id in path("drafts.**"))')
    const excludesVersions = query.includes('!(_id in path("versions.**"))')
    const hit = dataset.find(
      (d) =>
        d.conferenceId === params.conferenceId &&
        d.shortCode === params.code &&
        !(excludesDrafts && d._id.startsWith('drafts.')) &&
        !(excludesVersions && d._id.startsWith('versions.')),
    )
    if (!hit) return null
    return {
      _id: hit._id,
      _type: hit._type,
      link: hit.link ?? null,
      kind: hit.kind ?? null,
      targetPage: hit.targetPage ?? null,
      taskKey: hit.key ?? null,
      campaignKey: hit.campaignKey ?? null,
    }
  },
)
vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: {
    fetch: (...a: [string, Record<string, string>]) => sanityFetch(...a),
  },
}))

const getConferenceForCurrentDomain = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: () => getConferenceForCurrentDomain(),
}))

import { GET } from './route'

const HOST = 'https://cloudnativebergen.dev'

function request(code: string): Request {
  return new Request(`${HOST}/go/${code}`)
}

async function get(code: string): Promise<Response> {
  return GET(request(code) as never, { params: Promise.resolve({ code }) })
}

function location(response: Response): string {
  const raw = response.headers.get('location')
  if (!raw) throw new Error('expected a Location header')
  return raw
}

const VARIANT: FakeDoc = {
  _id: 'socialPostVariant.v1',
  _type: 'socialPostVariant',
  conferenceId: 'conf-1',
  shortCode: 'abc987',
  link: `${HOST}/program?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=speakerCard%3Asp-1%3Abluesky`,
}

beforeEach(() => {
  vi.clearAllMocks()
  dataset = [VARIANT]
  getConferenceForCurrentDomain.mockResolvedValue({
    conference: {
      _id: 'conf-1',
      title: 'CNDN',
      domains: ['cloudnativebergen.dev'],
    },
    domain: 'cloudnativebergen.dev',
    error: null,
    status: 'resolved',
  })
})

describe('GET /go/<code> — a malformed code never touches Sanity (spec §2.4)', () => {
  it.each([
    ['too short', 'abc98'],
    ['too long', 'abc9876'],
    ['an excluded character', 'abco87'],
    ['a dot', 'ab.987'],
    ['a vanity word', 'cfp'],
  ])('404s on %s', async (_label, code) => {
    const response = await get(code)
    expect(response.status).toBe(404)
    expect(sanityFetch).not.toHaveBeenCalled()
    // The conference read is Sanity too: the guard is before EVERY fetch.
    expect(getConferenceForCurrentDomain).not.toHaveBeenCalled()
  })

  it('lowercases a pasted capitalised code BEFORE the shape check', async () => {
    const response = await get('ABC987')
    expect(response.status).toBe(302)
    expect(location(response)).toBe(
      `${HOST}/program?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=speakerCard%3Asp-1%3Abluesky`,
    )
  })
})

describe('GET /go/<code> — the redirect (spec §2.4)', () => {
  it('302s to the path and query of the variant link, on the host that was asked', async () => {
    const response = await get('abc987')
    expect(response.status).toBe(302)
    expect(location(response)).toBe(
      `${HOST}/program?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=speakerCard%3Asp-1%3Abluesky`,
    )
  })

  it('answers on EVERY domain of the conference, redirecting on that domain', async () => {
    const response = await GET(
      new Request('https://cndn.no/go/abc987') as never,
      { params: Promise.resolve({ code: 'abc987' }) },
    )
    expect(new URL(location(response)).host).toBe('cndn.no')
    expect(new URL(location(response)).pathname).toBe('/program')
  })

  it('NEVER follows a foreign host stored on the link', async () => {
    dataset = [{ ...VARIANT, link: 'https://evil.example/pwned?next=x' }]
    const response = await get('abc987')
    expect(response.status).toBe(302)
    const target = new URL(location(response))
    // Fails on the foreign host being followed, not on an absence.
    expect(target.host).toBe('cloudnativebergen.dev')
    expect(target.pathname + target.search).toBe('/pwned?next=x')
  })

  it('302s to the home page with NO UTMs for a well-formed unknown code', async () => {
    dataset = []
    const response = await get('zzz999')
    expect(response.status).toBe(302)
    expect(location(response)).toBe(`${HOST}/`)
  })

  it('302s to the home page when the stored link does not parse', async () => {
    dataset = [{ ...VARIANT, link: 'not a url' }]
    expect(location(await get('abc987'))).toBe(`${HOST}/`)
  })

  it('302s to the home page when an outreach target no longer derives', async () => {
    dataset = [
      {
        _id: 'marketingTask.t1',
        _type: 'marketingTask',
        conferenceId: 'conf-1',
        shortCode: 'abc987',
        kind: 'speakerOutreach',
        targetPage: null,
        key: 'speakerInvite:sp-1',
        campaignKey: 'cfp',
      },
    ]
    expect(location(await get('abc987'))).toBe(`${HOST}/`)
  })

  it('302s an outreach Task to its derived target with utm_source=outreach', async () => {
    dataset = [
      {
        _id: 'marketingTask.t1',
        _type: 'marketingTask',
        conferenceId: 'conf-1',
        shortCode: 'abc987',
        kind: 'speakerOutreach',
        targetPage: '/program',
        key: 'speakerInvite:sp-1',
        campaignKey: 'cfp',
      },
    ]
    expect(location(await get('abc987'))).toBe(
      `${HOST}/program?utm_source=outreach&utm_medium=social&utm_campaign=cfp&utm_content=speakerInvite%3Asp-1`,
    )
  })

  it("serves ANOTHER conference's code exactly like an unknown one", async () => {
    dataset = [
      {
        ...VARIANT,
        conferenceId: 'conf-2',
        link: 'https://otherconf.dev/secret-program?utm_campaign=theirs',
      },
    ]
    const response = await get('abc987')
    // Fails on the other conference's link being served.
    expect(location(response)).toBe(`${HOST}/`)
    expect(location(response)).not.toContain('secret-program')
  })

  it("never lets a Studio DRAFT's link win over the published document", async () => {
    dataset = [
      {
        ...VARIANT,
        _id: 'drafts.socialPostVariant.v1',
        link: `${HOST}/draft-only?utm_campaign=unpublished`,
      },
    ]
    const response = await get('abc987')
    // Fails on the draft's link being served.
    expect(location(response)).toBe(`${HOST}/`)
    expect(location(response)).not.toContain('draft-only')
  })

  it('never lets a VERSION document win either', async () => {
    dataset = [
      {
        ...VARIANT,
        _id: 'versions.r1.socialPostVariant.v1',
        link: `${HOST}/version-only?utm_campaign=unreleased`,
      },
    ]
    expect(location(await get('abc987'))).toBe(`${HOST}/`)
  })
})

describe('GET /go/<code> — response headers (spec §2.4)', () => {
  it('is 302, never a permanent redirect', async () => {
    const response = await get('abc987')
    expect(response.status).toBe(302)
    expect(response.status).not.toBe(301)
    expect(response.status).not.toBe(308)
  })

  it('is no-store and noindex on a hit AND on a miss', async () => {
    for (const rows of [[VARIANT], []]) {
      dataset = rows
      const response = await get('abc987')
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(response.headers.get('x-robots-tag')).toBe('noindex')
    }
  })

  it('is no-store and noindex on the 404 too', async () => {
    const response = await get('nope')
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
  })
})

describe('GET /go/<code> — an unresolvable host', () => {
  it('404s without looking a code up when the host is no conference', async () => {
    getConferenceForCurrentDomain.mockResolvedValue({
      conference: {},
      domain: 'unknown.example',
      error: null,
      status: 'not-found',
    })
    const response = await get('abc987')
    expect(response.status).toBe(404)
    expect(sanityFetch).not.toHaveBeenCalled()
  })
})
