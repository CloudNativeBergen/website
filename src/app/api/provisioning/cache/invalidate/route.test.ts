/**
 * @vitest-environment node
 *
 * EXTERNAL CACHE INVALIDATION (RunKonf/platform#36) — the guard tests.
 *
 * Every assertion is on an OBSERVABLE EFFECT: the status code, and above all
 * WHICH TAGS `revalidateTag` was handed. Error strings are never asserted on —
 * a broken guard that revalidated anyway would pass such a test happily — and
 * the uniform-401 property is checked by comparing whole response bodies to
 * each other rather than to an expected message.
 *
 * The Sanity fake models the one behaviour the rate limiter leans on:
 * `patch(...).ifRevisionId(rev)` fails unless the revision is current, and
 * `create` on an explicit id fails if the document exists. Without that the
 * limiter's compare-and-swap would not actually be exercised.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_noStore: () => {},
  revalidateTag: vi.fn(),
}))

interface Doc extends Record<string, unknown> {
  _id: string
  _type: string
  _rev?: string
}

const docs = new Map<string, Doc>()
let revCounter = 0
const nextRev = () => `rev-${++revCounter}`

function conflict(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 409 })
}

/**
 * Every content read this route could possibly make. It must stay EMPTY-handed:
 * the endpoint is specified never to look anything up (that is what keeps it
 * from being an existence oracle), so any call here that is not a rate-limit
 * bucket read is a regression.
 */
const contentFetches: string[] = []

const fetchMock = vi.fn(
  async (query: string, params: Record<string, unknown> = {}) => {
    if (query.includes('_type == $type && _id == $id')) {
      const doc = docs.get(params.id as string)
      return doc && doc._type === params.type ? { ...doc } : null
    }
    contentFetches.push(query)
    return null
  },
)

function standalonePatch(id: string) {
  let expectedRev: string | undefined
  let updates: Record<string, unknown> = {}
  const chain = {
    ifRevisionId(rev: string) {
      expectedRev = rev
      return chain
    },
    set(values: Record<string, unknown>) {
      updates = { ...updates, ...values }
      return chain
    },
    async commit() {
      const doc = docs.get(id)
      if (!doc) throw conflict(`Document ${id} is gone`)
      if (expectedRev !== undefined && doc._rev !== expectedRev) {
        throw conflict(`Revision moved on ${id}`)
      }
      docs.set(id, { ...doc, ...updates, _rev: nextRev() })
    },
  }
  return chain
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: (query: string, params?: Record<string, unknown>) =>
      fetchMock(query, params ?? {}),
  },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: {
    create: async (doc: Doc) => {
      if (docs.has(doc._id)) throw conflict(`${doc._id} already exists`)
      docs.set(doc._id, { ...doc, _rev: nextRev() })
      return doc
    },
    patch: (id: string) => standalonePatch(id),
    delete: async () => ({ results: [] }),
  },
}))

import { revalidateTag } from 'next/cache'
import { POST } from './route'
import { MAX_INVALIDATION_TARGETS } from '@/lib/cache/invalidation'

const revalidateTagMock = revalidateTag as unknown as ReturnType<typeof vi.fn>

const ENDPOINT = 'https://konf.app/api/provisioning/cache/invalidate'

/** 40 chars — comfortably over the 32-char floor. */
const TOKEN = 'prov_live_5f3c1a9e77b4d206c8ae13f0b95d7e42'

type Target = Record<string, unknown>

function request({
  token = TOKEN as string | null,
  targets = [{ type: 'organization', id: 'org-A' }] as Target[],
  payload,
  raw,
  ip = '203.0.113.7' as string | null,
}: {
  token?: string | null
  targets?: Target[]
  payload?: unknown
  raw?: string
  ip?: string | null
} = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (ip !== null) headers['x-forwarded-for'] = ip
  if (token !== null) headers.authorization = `Bearer ${token}`
  return new Request(ENDPOINT, {
    method: 'POST',
    headers,
    body: raw ?? JSON.stringify(payload ?? { targets }),
  }) as unknown as Parameters<typeof POST>[0]
}

/** Every tag handed to `revalidateTag` so far, in call order. */
function revalidatedTags(): string[] {
  return revalidateTagMock.mock.calls.map((call) => call[0] as string)
}

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  docs.clear()
  contentFetches.length = 0
  revCounter = 0
  process.env.AUTH_SECRET = 'test-auth-secret'
  process.env.PROVISIONING_API_TOKEN = TOKEN
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete process.env.PROVISIONING_API_TOKEN
  delete process.env.AUTH_SECRET
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

describe('authentication — fail closed, and nothing is invalidated', () => {
  it('refuses when PROVISIONING_API_TOKEN is UNSET, revalidating nothing', async () => {
    delete process.env.PROVISIONING_API_TOKEN

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it('refuses when the configured secret is EMPTY or WHITESPACE', async () => {
    for (const secret of ['', '   ']) {
      revalidateTagMock.mockClear()
      process.env.PROVISIONING_API_TOKEN = secret

      const response = await POST(request({ token: secret }))

      expect(response.status).toBe(401)
      expect(revalidateTagMock).not.toHaveBeenCalled()
    }
  })

  it('refuses when the configured secret is TOO SHORT, even if presented exactly', async () => {
    const weak = 'short-secret'
    process.env.PROVISIONING_API_TOKEN = weak

    const response = await POST(request({ token: weak }))

    expect(response.status).toBe(401)
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it('refuses a missing header, a non-bearer scheme and a wrong token', async () => {
    for (const token of [null, 'Basic abc', `${TOKEN}x`]) {
      revalidateTagMock.mockClear()

      const response = await POST(request({ token }))

      expect(response.status).toBe(401)
      expect(revalidateTagMock).not.toHaveBeenCalled()
    }
  })

  it('answers every failure mode with the IDENTICAL body — no oracle', async () => {
    const bodies: string[] = []

    delete process.env.PROVISIONING_API_TOKEN
    bodies.push(await (await POST(request())).text())

    process.env.PROVISIONING_API_TOKEN = 'short-secret'
    bodies.push(await (await POST(request({ token: 'short-secret' }))).text())

    process.env.PROVISIONING_API_TOKEN = TOKEN
    bodies.push(await (await POST(request({ token: null }))).text())
    bodies.push(await (await POST(request({ token: `${TOKEN}x` }))).text())

    expect(new Set(bodies).size).toBe(1)
  })

  it('METERS unauthenticated attempts — a brute-force run is cut off', async () => {
    delete process.env.PROVISIONING_API_TOKEN

    const statuses: number[] = []
    for (let i = 0; i < 70; i++) {
      statuses.push((await POST(request({ token: 'guess' }))).status)
    }

    // The pre-auth bucket is charged before the token is compared, so the run
    // stops being merely refused and starts being rate limited.
    expect(statuses).toContain(429)
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })
})

describe('the tags it revalidates', () => {
  it('busts EXACTLY the organization tag for an organization target', async () => {
    const response = await POST(
      request({ targets: [{ type: 'organization', id: 'org-A' }] }),
    )

    expect(response.status).toBe(200)
    expect(revalidatedTags()).toEqual(['sanity:organization-org-A'])
    await expect(response.json()).resolves.toEqual({
      invalidated: 1,
      tags: ['sanity:organization-org-A'],
    })
  })

  it('busts EXACTLY the conference tag for a conference target', async () => {
    const response = await POST(
      request({ targets: [{ type: 'conference', id: 'conf-9' }] }),
    )

    expect(response.status).toBe(200)
    expect(revalidatedTags()).toEqual(['sanity:conference-conf-9'])
  })

  it('busts EXACTLY the domain tag, normalized, for a domain target', async () => {
    const response = await POST(
      request({ targets: [{ type: 'domain', domain: '  Oslo.Example.COM ' }] }),
    )

    expect(response.status).toBe(200)
    expect(revalidatedTags()).toEqual(['domain:oslo.example.com'])
  })

  it('busts one tag per target, in order, for a mixed batch', async () => {
    await POST(
      request({
        targets: [
          { type: 'organization', id: 'org-A' },
          { type: 'conference', id: 'conf-9' },
          { type: 'domain', domain: 'oslo.example.com' },
        ],
      }),
    )

    expect(revalidatedTags()).toEqual([
      'sanity:organization-org-A',
      'sanity:conference-conf-9',
      'domain:oslo.example.com',
    ])
  })

  it('DE-DUPLICATES repeated targets rather than charging them twice', async () => {
    const response = await POST(
      request({
        targets: [
          { type: 'organization', id: 'org-A' },
          { type: 'organization', id: 'org-A' },
          { type: 'domain', domain: 'OSLO.example.com' },
          { type: 'domain', domain: 'oslo.example.com' },
        ],
      }),
    )

    expect(revalidatedTags()).toEqual([
      'sanity:organization-org-A',
      'domain:oslo.example.com',
    ])
    await expect(response.json()).resolves.toMatchObject({ invalidated: 2 })
  })

  it('cannot be talked into a BROAD content tag', async () => {
    // Spelling a cross-tenant tag straight into an id is refused outright…
    for (const id of ['content:organizations', 'content:conferences']) {
      revalidateTagMock.mockClear()
      const response = await POST(
        request({ targets: [{ type: 'organization', id }] }),
      )
      expect(response.status).toBe(400)
      expect(revalidateTagMock).not.toHaveBeenCalled()
    }

    // …and an id that IS accepted is still only ever wrapped by the builder,
    // so the result cannot be a `content:` / `admin:` tag either way.
    revalidateTagMock.mockClear()
    await POST(
      request({
        targets: [{ type: 'organization', id: 'content-organizations' }],
      }),
    )
    expect(revalidatedTags()).toEqual([
      'sanity:organization-content-organizations',
    ])
  })
})

describe('a target that does not exist is a NO-OP, not an oracle', () => {
  it('answers an unknown id exactly as it answers a known one, reading nothing', async () => {
    const unknown = await POST(
      request({
        targets: [{ type: 'organization', id: 'org-does-not-exist' }],
      }),
    )

    expect(unknown.status).toBe(200)
    await expect(unknown.json()).resolves.toEqual({
      invalidated: 1,
      tags: ['sanity:organization-org-does-not-exist'],
    })
    // Nothing was looked up, so there is nothing for a prober to compare.
    expect(contentFetches).toEqual([])
  })
})

describe('bounds — one call cannot stampede the cache', () => {
  it('refuses a batch over the per-call cap, revalidating NOTHING', async () => {
    const targets = Array.from(
      { length: MAX_INVALIDATION_TARGETS + 1 },
      (_, i) => ({ type: 'organization', id: `org-${i}` }),
    )

    const response = await POST(request({ targets }))

    expect(response.status).toBe(400)
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it('accepts a batch AT the cap', async () => {
    const targets = Array.from(
      { length: MAX_INVALIDATION_TARGETS },
      (_, i) => ({ type: 'organization', id: `org-${i}` }),
    )

    const response = await POST(request({ targets }))

    expect(response.status).toBe(200)
    expect(revalidatedTags()).toHaveLength(MAX_INVALIDATION_TARGETS)
  })

  /**
   * THE TWO METERS GET ONE TEST EACH, AND EACH TEST CAN ONLY BE SATISFIED BY
   * ITS OWN.
   *
   * The pre-auth per-IP bucket and the post-auth global bucket carry the
   * IDENTICAL 60/min cap, and the per-IP one is charged first. So a plain
   * authenticated flood from a fixed address trips the per-IP bucket at call 61
   * and never reaches the global bucket at all — such a test passes with the
   * global bound deleted, which makes the platform's only anti-stampede cap
   * (`INVALIDATION_RULES`, `@/lib/provisioning/constants`) unobservable.
   *
   * So each test below removes the OTHER bucket from the picture:
   *  - fixed address, payload refused at validation ⇒ the global bucket is
   *    never charged (it comes after validation), so only the per-IP bound can
   *    produce the 429;
   *  - one fresh address per call ⇒ every per-IP bucket sees exactly one hit
   *    and none can ever trip, so only the global bound can produce the 429.
   */
  it('METERS a flood from ONE address before the payload is even read', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 70; i++) {
      statuses.push((await POST(request({ targets: [] }))).status)
    }

    // Refused on content until the per-IP meter takes over from validation.
    expect(statuses.slice(0, 60)).toEqual(Array(60).fill(400))
    expect(statuses).toContain(429)
    expect(revalidateTagMock).not.toHaveBeenCalled()

    // And the platform's invalidation budget is untouched by that run — a real
    // call from a fresh address still goes through, which is the property that
    // keeps a malformed caller from spending everyone else's quota.
    const afterwards = await POST(request({ ip: '198.51.100.254' }))
    expect(afterwards.status).toBe(200)
  })

  it('METERS a flood that ROTATES its client IP — the anti-stampede bound', async () => {
    // `x-forwarded-for` is caller-controlled (see `@/lib/rate-limit/client-ip`),
    // so this is the caller the per-IP bucket cannot stop: a fresh address every
    // call. Only the single global bucket is left to say no.
    const statuses: number[] = []
    for (let i = 0; i < 70; i++) {
      statuses.push((await POST(request({ ip: `198.51.100.${i}` }))).status)
    }

    expect(statuses.slice(0, 60)).toEqual(Array(60).fill(200))
    expect(statuses).toContain(429)
    // One target per call, so the revalidation work caused is exactly the
    // number of calls that got through — the cap held platform-wide.
    expect(revalidatedTags()).toHaveLength(60)
  })
})

describe('payload validation', () => {
  it('refuses an empty batch, an absent batch and unparseable JSON', async () => {
    const cases = [
      request({ targets: [] }),
      request({ payload: {} }),
      request({ raw: '{' }),
    ]

    for (const req of cases) {
      revalidateTagMock.mockClear()
      const response = await POST(req)
      expect(response.status).toBe(400)
      expect(revalidateTagMock).not.toHaveBeenCalled()
    }
  })

  it('refuses an unknown target type — the vocabulary is closed', async () => {
    const response = await POST(
      request({ targets: [{ type: 'speaker', id: 'spk-1' }] }),
    )

    expect(response.status).toBe(400)
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it('refuses a malformed id or hostname, revalidating nothing', async () => {
    const cases: Target[][] = [
      [{ type: 'organization', id: '' }],
      [{ type: 'organization', id: 'org *[_type=="organization"]' }],
      [{ type: 'organization', id: 'a'.repeat(300) }],
      [{ type: 'domain', domain: 'https://oslo.example.com' }],
      [{ type: 'domain', domain: 'oslo.example.com/admin' }],
      [{ type: 'domain', domain: '' }],
    ]

    for (const targets of cases) {
      revalidateTagMock.mockClear()
      const response = await POST(request({ targets }))
      expect(response.status).toBe(400)
      expect(revalidateTagMock).not.toHaveBeenCalled()
    }
  })

  it('refuses a target that is not an object at all', async () => {
    const response = await POST(
      request({ payload: { targets: ['organization'] } }),
    )

    expect(response.status).toBe(400)
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })
})
