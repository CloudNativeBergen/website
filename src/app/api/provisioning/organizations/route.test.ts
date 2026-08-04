/**
 * @vitest-environment node
 *
 * MACHINE PROVISIONING API (#753) — the guard tests.
 *
 * Every assertion here is on an OBSERVABLE EFFECT: how many `organization` and
 * `conference` documents ended up in the (in-memory, atomic) content lake, and
 * which ids came back. Asserting on an error message would happily pass against
 * a broken guard that wrote the tenant anyway, so error strings are only ever
 * checked as a SECONDARY property once the write count has already been pinned.
 *
 * The Sanity fake below models the three behaviours the security design leans
 * on, so the tests exercise the real code paths rather than a stub of them:
 *   - `create` on an explicit `_id` FAILS if the document already exists
 *     (this is the idempotency compare-and-swap),
 *   - `patch(...).ifRevisionId(rev)` FAILS unless the revision is current
 *     (this is the rate limiter's CAS),
 *   - a transaction is ALL-OR-NOTHING (a failed commit rolls the store back).
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

function insertDoc(doc: Doc): void {
  if (docs.has(doc._id)) {
    throw conflict(`Document ${doc._id} already exists`)
  }
  docs.set(doc._id, { ...doc, _rev: nextRev() })
}

const fetchMock = vi.fn(
  async (query: string, params: Record<string, unknown> = {}) => {
    // Bucket / receipt lookup by deterministic id.
    if (query.includes('_type == $type && _id == $id')) {
      const doc = docs.get(params.id as string)
      return doc && doc._type === params.type ? { ...doc } : null
    }
    if (query.includes('count(*[_type == "organization"')) {
      return [...docs.values()].filter(
        (d) =>
          d._type === 'organization' &&
          (d.slug as { current?: string } | undefined)?.current === params.slug,
      ).length
    }
    // The real GROQ pre-narrows; the JS predicate is the authority, so the fake
    // may safely return every claimed domain.
    if (query.includes('.domains[]')) {
      return [...docs.values()]
        .filter((d) => d._type === 'conference')
        .flatMap((d) => (d.domains as string[] | undefined) ?? [])
    }
    if (query.includes('_type == "speaker"')) {
      return [...docs.values()]
        .filter(
          (d) =>
            d._type === 'speaker' &&
            String(d.email ?? '').toLowerCase() === params.email,
        )
        .map((d) => ({ _id: d._id, name: d.name }))
    }
    throw new Error(`Unexpected query: ${query}`)
  },
)

/** Standalone patch builder (used by the rate limiter's CAS). */
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

/** In-transaction patch builder (organizer membership append). */
function transactionPatch(id: string) {
  const ops: Array<(doc: Doc) => Doc> = []
  const builder = {
    setIfMissing(values: Record<string, unknown>) {
      ops.push((doc) => ({ ...values, ...doc }))
      return builder
    },
    insert(_pos: string, _selector: string, items: unknown[]) {
      ops.push((doc) => ({
        ...doc,
        organizations: [
          ...((doc.organizations as unknown[] | undefined) ?? []),
          ...items,
        ],
      }))
      return builder
    },
  }
  return {
    builder,
    apply() {
      const doc = docs.get(id)
      if (!doc) throw conflict(`Document ${id} is gone`)
      docs.set(
        id,
        ops.reduce((acc, op) => op(acc), doc as Doc),
      )
    },
  }
}

function makeTransaction() {
  const staged: Array<() => void> = []
  const tx = {
    create(doc: Doc) {
      staged.push(() => insertDoc(doc))
      return tx
    },
    patch(id: string, fn: (p: unknown) => unknown) {
      const rec = transactionPatch(id)
      fn(rec.builder)
      staged.push(() => rec.apply())
      return tx
    },
    async commit() {
      // ALL-OR-NOTHING: snapshot, apply, restore on any failure.
      const snapshot = new Map(docs)
      try {
        for (const op of staged) op()
      } catch (error) {
        docs.clear()
        for (const [id, doc] of snapshot) docs.set(id, doc)
        throw error
      }
      return {}
    },
  }
  return tx
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: (query: string, params?: Record<string, unknown>) =>
      fetchMock(query, params ?? {}),
  },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: {
    transaction: () => makeTransaction(),
    create: async (doc: Doc) => {
      insertDoc(doc)
      return doc
    },
    patch: (id: string) => standalonePatch(id),
    delete: async () => ({ results: [] }),
  },
}))

const syncDomainVerificationsMock = vi.fn(async () => {})
vi.mock('@/lib/domain-verification', () => ({
  syncDomainVerifications: (...args: unknown[]) =>
    syncDomainVerificationsMock(...(args as [])),
  getDomainVerification: async () => null,
  toDomainVerificationView: (hostname: string) => ({
    hostname,
    status: 'pending',
  }),
}))

import { POST } from './route'

const ENDPOINT = 'https://konf.app/api/provisioning/organizations'

/** 40 chars — comfortably over the 32-char floor. */
const TOKEN = 'prov_live_5f3c1a9e77b4d206c8ae13f0b95d7e42'
const KEY = 'idem-0123456789abcdef'

function body(overrides: Record<string, unknown> = {}) {
  return {
    organization: {
      name: 'Cloud Native Oslo',
      slug: 'cloud-native-oslo',
      contactEmail: 'hello@cno.no',
    },
    conference: {
      title: 'Cloud Native Days Oslo 2027',
      city: 'Oslo',
      country: 'Norway',
      startDate: '2027-06-01',
      endDate: '2027-06-02',
    },
    organizer: { name: 'Kari Nordmann', email: 'Kari@CNO.no' },
    domains: ['oslo.cloudnativedays.no'],
    ...overrides,
  }
}

function request({
  token = TOKEN as string | null,
  key = KEY as string | null,
  payload = body() as unknown,
  raw,
  ip = '203.0.113.7',
}: {
  token?: string | null
  key?: string | null
  payload?: unknown
  raw?: string
  ip?: string
} = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': ip,
  }
  if (token !== null) headers.authorization = `Bearer ${token}`
  if (key !== null) headers['idempotency-key'] = key
  return new Request(ENDPOINT, {
    method: 'POST',
    headers,
    body: raw ?? JSON.stringify(payload),
  }) as unknown as Parameters<typeof POST>[0]
}

const ofType = (type: string) =>
  [...docs.values()].filter((d) => d._type === type)

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  docs.clear()
  revCounter = 0
  process.env.AUTH_SECRET = 'test-auth-secret'
  process.env.PROVISIONING_API_TOKEN = TOKEN
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete process.env.PROVISIONING_API_TOKEN
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

// ───────────────────────────────────────────────────────────────────────────
// 1. FAIL CLOSED ON MISCONFIGURATION
// ───────────────────────────────────────────────────────────────────────────

describe('provisioning API — an unconfigured secret closes the endpoint', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace only', '   \n'],
  ])(
    'refuses a request when PROVISIONING_API_TOKEN is %s, and writes NOTHING',
    async (_label, value) => {
      if (value === undefined) delete process.env.PROVISIONING_API_TOKEN
      else process.env.PROVISIONING_API_TOKEN = value

      const res = await POST(request({ token: TOKEN }))

      // THE assertion that a permissive guard cannot survive: no tenant exists.
      expect(ofType('organization')).toHaveLength(0)
      expect(ofType('conference')).toHaveLength(0)
      expect(ofType('speaker')).toHaveLength(0)
      expect(res.status).toBe(401)
    },
  )

  it('refuses even a caller presenting the SAME empty string as the unset secret', async () => {
    process.env.PROVISIONING_API_TOKEN = ''
    const res = await POST(request({ token: '' }))
    expect(ofType('organization')).toHaveLength(0)
    expect(res.status).toBe(401)
  })

  it('refuses a secret shorter than the 32-character floor, even when presented exactly', async () => {
    process.env.PROVISIONING_API_TOKEN = 'short-secret'
    const res = await POST(request({ token: 'short-secret' }))
    expect(ofType('organization')).toHaveLength(0)
    expect(res.status).toBe(401)
  })

  it('refuses a request with no Authorization header at all', async () => {
    const res = await POST(request({ token: null }))
    expect(ofType('organization')).toHaveLength(0)
    expect(res.status).toBe(401)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 2. WRONG TOKEN — REFUSED AND OPAQUE
// ───────────────────────────────────────────────────────────────────────────

describe('provisioning API — a wrong token is refused opaquely', () => {
  it('writes nothing and returns the bare 401 body', async () => {
    const res = await POST(
      request({ token: 'prov_live_0000000000000000000000000000000000000000' }),
    )
    expect(ofType('organization')).toHaveLength(0)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' })
  })

  it.each([
    ['a token that is a PREFIX of the real one', TOKEN.slice(0, 20)],
    ['a token that EXTENDS the real one', `${TOKEN}x`],
    ['a case-flipped token', TOKEN.toUpperCase()],
  ])('refuses %s', async (_label, token) => {
    const res = await POST(request({ token }))
    expect(ofType('organization')).toHaveLength(0)
    expect(res.status).toBe(401)
  })

  it('refuses a non-bearer scheme carrying the correct secret', async () => {
    const res = await POST(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Basic ${TOKEN}`,
          'idempotency-key': KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body()),
      }) as unknown as Parameters<typeof POST>[0],
    )
    expect(ofType('organization')).toHaveLength(0)
    expect(res.status).toBe(401)
  })

  it('accepts a lowercase "bearer" scheme (RFC 7235 is case-insensitive)', async () => {
    const res = await POST(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `bearer ${TOKEN}`,
          'idempotency-key': KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body()),
      }) as unknown as Parameters<typeof POST>[0],
    )
    expect(res.status).toBe(201)
    expect(ofType('organization')).toHaveLength(1)
  })

  it('tells an unauthenticated prober NOTHING about which slugs exist', async () => {
    // Provision for real, then probe the same slug with a bad token: the
    // response must be byte-identical to probing a slug that does not exist,
    // and identical to the unconfigured-endpoint response.
    expect((await POST(request())).status).toBe(201)

    const takenProbe = await POST(
      request({
        token: 'wrong-but-long-enough-token-value-here-1',
        key: 'k2-0123456789abcdef',
      }),
    )
    const freeProbe = await POST(
      request({
        token: 'wrong-but-long-enough-token-value-here-1',
        key: 'k3-0123456789abcdef',
        payload: body({
          organization: {
            name: 'Nothing Here',
            slug: 'definitely-not-taken',
            contactEmail: 'a@b.no',
          },
        }),
      }),
    )

    expect(takenProbe.status).toBe(freeProbe.status)
    await expect(takenProbe.json()).resolves.toEqual(await freeProbe.json())
    expect(ofType('organization')).toHaveLength(1)
  })

  it('never echoes the presented or configured token in the response or the logs', async () => {
    const presented = 'prov_live_secret_guess_that_must_never_be_logged'
    const res = await POST(request({ token: presented }))
    const text = await res.text()

    expect(text).not.toContain(presented)
    expect(text).not.toContain(TOKEN)

    const logged = [...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((arg) => String(arg))
      .join(' ')
    expect(logged).not.toContain(presented)
    expect(logged).not.toContain(TOKEN)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 3. THE HAPPY PATH — EXACTLY ONE TENANT
// ───────────────────────────────────────────────────────────────────────────

describe('provisioning API — a correct token creates exactly one tenant', () => {
  it('writes one organization, one conference and one organizer, and returns their ids', async () => {
    const res = await POST(request())
    expect(res.status).toBe(201)

    const orgs = ofType('organization')
    const confs = ofType('conference')
    const speakers = ofType('speaker')
    expect(orgs).toHaveLength(1)
    expect(confs).toHaveLength(1)
    expect(speakers).toHaveLength(1)

    const payload = await res.json()
    expect(payload).toMatchObject({
      organizationId: orgs[0]._id,
      conferenceId: confs[0]._id,
      speakerId: speakers[0]._id,
      speakerCreated: true,
      replayed: false,
    })
    expect(payload.challenges).toEqual([
      { hostname: 'oslo.cloudnativedays.no', status: 'pending' },
    ])

    // Reused defaults from the SHARED transaction, not a second implementation.
    expect(confs[0]).toMatchObject({
      visibility: 'unlisted',
      registrationEnabled: false,
      organization: { _ref: orgs[0]._id },
      domains: ['oslo.cloudnativedays.no'],
    })
    expect(speakers[0]).toMatchObject({ email: 'kari@cno.no' })
    expect(syncDomainVerificationsMock).toHaveBeenCalledWith(confs[0]._id, [
      'oslo.cloudnativedays.no',
    ])
  })

  it('patches a matching existing speaker instead of minting a duplicate account', async () => {
    docs.set('sp-existing', {
      _id: 'sp-existing',
      _type: 'speaker',
      name: 'Kari Nordmann',
      email: 'kari@cno.no',
    })

    const res = await POST(request())
    expect(res.status).toBe(201)
    expect(ofType('speaker')).toHaveLength(1)
    await expect(res.json()).resolves.toMatchObject({
      speakerId: 'sp-existing',
      speakerCreated: false,
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 4. REPLAY
// ───────────────────────────────────────────────────────────────────────────

describe('provisioning API — a replayed request never creates a second tenant', () => {
  it('returns the ORIGINAL ids and leaves the document count unchanged', async () => {
    const first = await POST(request())
    expect(first.status).toBe(201)
    const firstBody = await first.json()
    expect(ofType('organization')).toHaveLength(1)

    const second = await POST(request())

    expect(ofType('organization')).toHaveLength(1)
    expect(ofType('conference')).toHaveLength(1)
    expect(ofType('speaker')).toHaveLength(1)
    expect(second.status).toBe(200)
    await expect(second.json()).resolves.toMatchObject({
      organizationId: firstBody.organizationId,
      conferenceId: firstBody.conferenceId,
      speakerId: firstBody.speakerId,
      replayed: true,
    })
  })

  it('honours the KEY, not the payload — a changed body under a used key still creates nothing', async () => {
    await POST(request())
    const res = await POST(
      request({
        payload: body({
          organization: {
            name: 'Totally Different',
            slug: 'totally-different',
            contactEmail: 'x@y.no',
          },
        }),
      }),
    )
    expect(res.status).toBe(200)
    expect(ofType('organization')).toHaveLength(1)
    expect(ofType('organization')[0].name).toBe('Cloud Native Oslo')
  })

  it('creates exactly one tenant when two identical requests race', async () => {
    const [a, b] = await Promise.all([POST(request()), POST(request())])

    expect(ofType('organization')).toHaveLength(1)
    expect(ofType('conference')).toHaveLength(1)
    const bodies = await Promise.all([a.json(), b.json()])
    expect(bodies[0].organizationId).toBe(bodies[1].organizationId)
    expect(new Set([a.status, b.status])).toEqual(new Set([201, 200]))
  })

  it('lets a DIFFERENT key through — idempotency must not become a global lock', async () => {
    await POST(request())
    const res = await POST(
      request({
        key: 'a-second-key-0123456789',
        payload: body({
          organization: {
            name: 'Cloud Native Bergen',
            slug: 'cloud-native-bergen',
            contactEmail: 'hei@cnb.no',
          },
          domains: ['bergen.cloudnativedays.no'],
        }),
      }),
    )
    expect(res.status).toBe(201)
    expect(ofType('organization')).toHaveLength(2)
  })

  it('requires an idempotency key, and writes nothing without one', async () => {
    const res = await POST(request({ key: null }))
    expect(ofType('organization')).toHaveLength(0)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      code: 'idempotency_key_required',
    })
  })

  it('rejects a too-short idempotency key (a guessable key is not replay protection)', async () => {
    const res = await POST(request({ key: 'short' }))
    expect(ofType('organization')).toHaveLength(0)
    expect(res.status).toBe(400)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 5. INPUT VALIDATION — BEFORE ANY WRITE
// ───────────────────────────────────────────────────────────────────────────

describe('provisioning API — malformed input is rejected before any write', () => {
  it.each([
    ['a body that is not JSON at all', { raw: 'not json {' }],
    ['a body that is not an object', { payload: 'nope' }],
    [
      'a missing organization block',
      { payload: body({ organization: undefined }) },
    ],
    [
      'an invalid organizer email',
      { payload: body({ organizer: { name: 'K', email: 'not-an-email' } }) },
    ],
    [
      'an illegal org slug',
      {
        payload: body({
          organization: {
            name: 'X',
            slug: '-Not A Slug-',
            contactEmail: 'a@b.no',
          },
        }),
      },
    ],
    [
      'a non-hostname domain',
      { payload: body({ domains: ['https://x.no/a'] }) },
    ],
    [
      'duplicate domains',
      { payload: body({ domains: ['a.example.com', 'a.example.com'] }) },
    ],
    [
      'a lone start date',
      {
        payload: body({
          conference: {
            title: 'T',
            city: 'C',
            country: 'N',
            startDate: '2027-06-01',
          },
        }),
      },
    ],
    [
      'an end date before the start date',
      {
        payload: body({
          conference: {
            title: 'T',
            city: 'C',
            country: 'N',
            startDate: '2027-06-02',
            endDate: '2027-06-01',
          },
        }),
      },
    ],
  ])('rejects %s with 400 and writes nothing', async (_label, overrides) => {
    const res = await POST(request(overrides))
    expect(ofType('organization')).toHaveLength(0)
    expect(ofType('conference')).toHaveLength(0)
    expect(res.status).toBe(400)
  })

  it('validates BEFORE authenticating nothing — an unauthenticated malformed body still 401s', async () => {
    // Order matters: authentication comes first, so a prober cannot use schema
    // errors to map the payload shape.
    const res = await POST(
      request({ token: 'wrong-token-value-of-adequate-length!!', raw: '{' }),
    )
    expect(res.status).toBe(401)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 6. CONFLICTS AND ABUSE CONTROL
// ───────────────────────────────────────────────────────────────────────────

describe('provisioning API — conflicts and limits', () => {
  it('refuses a slug another organization already holds, without writing a second one', async () => {
    await POST(request())
    const res = await POST(request({ key: 'another-key-0123456789' }))
    expect(ofType('organization')).toHaveLength(1)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'slug_taken' })
  })

  it('refuses a domain an existing conference already claims', async () => {
    await POST(request())
    const res = await POST(
      request({
        key: 'domain-clash-key-0123456789',
        payload: body({
          organization: {
            name: 'Other',
            slug: 'other-org',
            contactEmail: 'a@b.no',
          },
        }),
      }),
    )
    expect(ofType('organization')).toHaveLength(1)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'domain_claimed' })
  })

  it('refuses an organizer email matching several speaker accounts', async () => {
    docs.set('sp-a', {
      _id: 'sp-a',
      _type: 'speaker',
      email: 'kari@cno.no',
      name: 'A',
    })
    docs.set('sp-b', {
      _id: 'sp-b',
      _type: 'speaker',
      email: 'kari@cno.no',
      name: 'B',
    })
    const res = await POST(request())
    expect(ofType('organization')).toHaveLength(0)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      code: 'ambiguous_organizer',
    })
  })

  it('meters UNAUTHENTICATED attempts, so the shared secret cannot be ground down for free', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) {
      const res = await POST(
        request({ token: `guess-number-${i}-padded-to-length-abcdefgh` }),
      )
      statuses.push(res.status)
    }
    // The attempt bucket allows 10 per minute; the rest are refused before the
    // token is even compared.
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0)
    expect(ofType('organization')).toHaveLength(0)
  })

  it('fails CLOSED when the limiter cannot bucket (no AUTH_SECRET)', async () => {
    const saved = process.env.AUTH_SECRET
    delete process.env.AUTH_SECRET
    try {
      const res = await POST(request())
      expect(ofType('organization')).toHaveLength(0)
      expect(res.status).toBe(429)
    } finally {
      process.env.AUTH_SECRET = saved
    }
  })
})
