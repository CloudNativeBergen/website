/**
 * @vitest-environment node
 *
 * Anonymous response cache (#1789). The gateway runs for real (envelope and
 * site-assertion crypto included); ctx.exports.CachedRead is a stand-in for
 * Workers Caching that keys entries the way Cloudflare documents (entrypoint ×
 * ctx.props × cf.cacheKey) and honours Cache-Control and Cache-Tag. It proves
 * the gateway's keying, bypass and purge decisions, not Cloudflare's cache:
 * that is checked on preview.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SignJWT,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  type CryptoKey,
} from 'jose'
import { ENVELOPE_HEADER, generateEnvelopeKeyPair } from '@runkonf/tenancy'
import { createGateway, SESSION_ORIGIN_CLAIM, type Env } from './gateway'
import { SITE_ASSERTION_HEADER } from './site-identity'
import { compose } from './supergraph'
import {
  cacheableRead,
  cacheTtl,
  storable,
  tagsFor,
  type CacheProps,
} from './response-cache'

vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const gateway = createGateway(compose())
const TENANTS: Record<string, { orgId: string; conferenceId: string }> = {
  'conf.example': { orgId: 'org_a', conferenceId: 'conf_a' },
  'b.example': { orgId: 'org_b', conferenceId: 'conf_b' },
}
const QUERY = { query: '{ conference { id } }' }
const MUTATION = {
  query: 'mutation { updateConference(input: {tagline: "x"}) { id } }',
}

let envelopeKeys: { privatePem: string; publicPem: string }
let siteKey: CryptoKey
let sitePublicKeys: string
let identityKey: CryptoKey
let jwks: unknown

beforeAll(async () => {
  envelopeKeys = await generateEnvelopeKeyPair()
  const site = await generateKeyPair('EdDSA', { extractable: true })
  siteKey = site.privateKey
  sitePublicKeys = JSON.stringify({ s1: await exportSPKI(site.publicKey) })
  const id = await generateKeyPair('EdDSA', { extractable: true })
  identityKey = id.privateKey
  jwks = { keys: [{ ...(await exportJWK(id.publicKey)), kid: 'k1' }] }
})

const assertion = (host = 'conf.example') =>
  new SignJWT({ host })
    .setProtectedHeader({ alg: 'EdDSA', kid: 's1' })
    .setIssuer('konf-site')
    .setAudience('konf-gateway')
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(siteKey)

const session = (host = 'conf.example') =>
  new SignJWT({ [SESSION_ORIGIN_CLAIM]: `https://${host}` })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setSubject('user_1')
    .setAudience('konf-gateway')
    .setIssuer('https://id.test')
    .setIssuedAt()
    .setExpirationTime('300s')
    .sign(identityKey)

/** The envelope's claims, read without verifying (the fake subgraph's view). */
const claims = (headers: Headers) => {
  const jwt = headers.get(ENVELOPE_HEADER)
  return jwt
    ? (JSON.parse(
        atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
      ) as {
        orgId?: string
        conferenceId?: string
      })
    : {}
}

let contentCalls: number
let contentError: boolean

function makeEnv(over: Partial<Record<string, unknown>> = {}) {
  return {
    API_CACHE_TTL_SECONDS: '60',
    ENVELOPE_PRIVATE_KEY: envelopeKeys.privatePem,
    IDENTITY_ISSUER: 'https://id.test',
    OVERRIDE_TENANTS: {},
    DIRECTORY: {
      fetch: async (_url: string, init: RequestInit) => {
        const { variables } = JSON.parse(String(init.body))
        return Response.json({
          data: { tenantByHost: TENANTS[variables.host] ?? null },
        })
      },
    },
    // Answers with the envelope's own conference, so a cross-tenant hit shows.
    CONTENT: {
      fetch: async (_url: string, init: RequestInit) => {
        contentCalls++
        if (contentError)
          return Response.json({
            errors: [{ message: 'boom' }],
            data: { conference: null },
          })
        const c = claims(new Headers(init.headers))
        return Response.json({ data: { conference: { id: c.conferenceId } } })
      },
    },
    CONFERENCE: {
      fetch: async (_url: string, init: RequestInit) => {
        const c = claims(new Headers(init.headers))
        return Response.json({
          data: { updateConference: { id: c.conferenceId } },
        })
      },
    },
    IDENTITY: { fetch: async () => Response.json(jwks) },
    API_LIMITER: { limit: async () => ({ success: true }) },
    API_IP_LIMITER: { limit: async () => ({ success: true }) },
    API_MUTATION_LIMITER: { limit: async () => ({ success: true }) },
    CLIENT_IP_SECRET: 'ip-secret',
    SITE_PUBLIC_KEYS: sitePublicKeys,
    MEMBERSHIP: {
      principal: async () => ({ orgRole: 'admin', platformOperator: false }),
    },
    ...over,
  } as unknown as Env
}

/** Workers Caching stand-in: one store per entrypoint, keyed by props + cacheKey. */
function workersCache(env: Env, purgeFails = false) {
  const store = new Map<
    string,
    { body: string; status: number; tags: string[] }
  >()
  const seen: { props: CacheProps; cacheKey: string }[] = []
  const purged: string[][] = []
  const ctx = {
    waitUntil: () => {},
    passThroughOnException: () => {},
    exports: {
      CachedRead: ({ props }: { props: CacheProps }) => ({
        async fetch(request: Request, init: { cf: { cacheKey: string } }) {
          seen.push({ props, cacheKey: init.cf.cacheKey })
          const key = JSON.stringify(props) + init.cf.cacheKey
          const hit = store.get(key)
          if (hit)
            return new Response(hit.body, {
              status: hit.status,
              headers: {
                'content-type': 'application/json',
                'cf-cache-status': 'HIT',
              },
            })
          const res = await gateway.cachedRead(request, env, ctx, props)
          const body = await res.text()
          if (
            /^public, max-age=\d+$/.test(res.headers.get('cache-control') ?? '')
          )
            store.set(key, {
              body,
              status: res.status,
              tags: (res.headers.get('cache-tag') ?? '').split(','),
            })
          return new Response(body, {
            status: res.status,
            headers: {
              'content-type': 'application/json',
              'cf-cache-status': 'MISS',
            },
          })
        },
        async purge(tags: string[]) {
          if (purgeFails) throw new Error('purge failed')
          purged.push(tags)
          for (const [k, v] of store)
            if (v.tags.some((t) => tags.includes(t))) store.delete(k)
        },
      }),
    },
  } as unknown as ExecutionContext
  return { ctx, store, seen, purged }
}

const post = (body: unknown, headers: Record<string, string>) =>
  new Request('http://api.test/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
const site = async (host = 'conf.example') => ({
  [SITE_ASSERTION_HEADER]: await assertion(host),
})

beforeEach(() => {
  contentCalls = 0
  contentError = false
})

describe('response cache through the gateway (#1789)', () => {
  it('serves a repeated anonymous site-lane read from the cache', async () => {
    const env = makeEnv()
    const { ctx, store } = workersCache(env)
    const first = await gateway.fetch(post(QUERY, await site()), env, ctx)
    const second = await gateway.fetch(post(QUERY, await site()), env, ctx)
    expect(first.headers.get('x-konf-cache')).toBe('miss')
    expect(second.headers.get('x-konf-cache')).toBe('hit')
    expect(await second.json()).toEqual({
      data: { conference: { id: 'conf_a' } },
    })
    expect(contentCalls).toBe(1)
    expect(store.size).toBe(1)
    // Cache headers stay between the gateway and CachedRead.
    expect(second.headers.get('cache-control')).toBeNull()
  })

  it("never serves one tenant's cached read to another", async () => {
    const env = makeEnv()
    const { ctx, seen } = workersCache(env)
    await gateway.fetch(post(QUERY, await site('conf.example')), env, ctx)
    const b = await gateway.fetch(
      post(QUERY, await site('b.example')),
      env,
      ctx,
    )
    expect(await b.json()).toEqual({ data: { conference: { id: 'conf_b' } } })
    expect(b.headers.get('x-konf-cache')).toBe('miss')
    expect(contentCalls).toBe(2)
    // Same document, same key: the tenant is told apart only by the props.
    expect(seen[0].cacheKey).toBe(seen[1].cacheKey)
    expect(seen.map((s) => s.props.orgId)).toEqual(['org_a', 'org_b'])
  })

  it.each([
    [
      'a browser Origin (no site assertion)',
      async () => ({ origin: 'https://conf.example' }),
      QUERY,
    ],
    [
      'a signed-in site-lane caller',
      async () => ({
        ...(await site()),
        authorization: `Bearer ${await session()}`,
      }),
      QUERY,
    ],
    ['introspection', site, { query: '{ __schema { queryType { name } } }' }],
    [
      'a persisted-query extension',
      site,
      { ...QUERY, extensions: { persistedQuery: {} } },
    ],
  ])('bypasses the cache for %s', async (_, headers, body) => {
    const env = makeEnv()
    const { ctx, seen, store } = workersCache(env)
    const res = await gateway.fetch(post(body, await headers()), env, ctx)
    expect(res.headers.get('x-konf-cache')).toBeNull()
    expect(seen).toEqual([])
    expect(store.size).toBe(0)
  })

  it('stays off without API_CACHE_TTL_SECONDS', async () => {
    const env = makeEnv({ API_CACHE_TTL_SECONDS: undefined })
    const { ctx, seen } = workersCache(env)
    const res = await gateway.fetch(post(QUERY, await site()), env, ctx)
    expect(await res.json()).toEqual({ data: { conference: { id: 'conf_a' } } })
    expect(seen).toEqual([])
  })

  it('never stores a response with errors', async () => {
    contentError = true
    const env = makeEnv()
    const { ctx, store } = workersCache(env)
    await gateway.fetch(post(QUERY, await site()), env, ctx)
    const again = await gateway.fetch(post(QUERY, await site()), env, ctx)
    expect(again.headers.get('x-konf-cache')).toBe('miss')
    expect(contentCalls).toBe(2)
    expect(store.size).toBe(0)
  })

  it('still runs the rate limit before a cached read', async () => {
    const env = makeEnv()
    const { ctx, store } = workersCache(env)
    await gateway.fetch(post(QUERY, await site()), env, ctx)
    expect(store.size).toBe(1)
    const limited = makeEnv({
      API_LIMITER: { limit: async () => ({ success: false }) },
    })
    const res = await gateway.fetch(post(QUERY, await site()), limited, ctx)
    expect(res.status).toBe(429)
  })

  it("purges the writing tenant's reads after a mutation, and only theirs", async () => {
    const env = makeEnv()
    const { ctx, store, purged } = workersCache(env)
    await gateway.fetch(post(QUERY, await site('conf.example')), env, ctx)
    await gateway.fetch(post(QUERY, await site('b.example')), env, ctx)
    expect(store.size).toBe(2)
    const write = await gateway.fetch(
      post(MUTATION, {
        ...(await site()),
        authorization: `Bearer ${await session()}`,
      }),
      env,
      ctx,
    )
    expect(await write.json()).toEqual({
      data: { updateConference: { id: 'conf_a' } },
    })
    expect(purged).toEqual([['org:org_a', 'conf:conf_a']])
    expect(
      [...store.keys()].map(
        (k) => JSON.parse(k.slice(0, k.indexOf('}') + 1)).orgId,
      ),
    ).toEqual(['org_b'])
    const after = await gateway.fetch(
      post(QUERY, await site('conf.example')),
      env,
      ctx,
    )
    expect(after.headers.get('x-konf-cache')).toBe('miss')
  })

  it('a failed purge never fails the write, and is logged', async () => {
    const env = makeEnv()
    const { ctx } = workersCache(env, true)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const write = await gateway.fetch(
      post(MUTATION, {
        ...(await site()),
        authorization: `Bearer ${await session()}`,
      }),
      env,
      ctx,
    )
    expect(await write.json()).toEqual({
      data: { updateConference: { id: 'conf_a' } },
    })
    expect(err.mock.calls.map((c) => c[0])).toContain(
      JSON.stringify({ event: 'gateway.cache.purge_failed' }),
    )
    err.mockRestore()
  })
})

describe('response cache rules', () => {
  it.each([
    ['60', 60],
    ['0', 0],
    [undefined, 0],
    ['-5', 0],
    ['1.5', 0],
    ['abc', 0],
  ])('cacheTtl(%s) = %s', (v, n) => expect(cacheTtl(v)).toBe(n))

  it.each([
    [
      'a mutation',
      'mutation { updateConference(input: {}) { id } }',
      undefined,
    ],
    ['a subscription', 'subscription { x }', undefined],
    [
      'the mutation of a two-operation document',
      'query A { a } mutation B { b }',
      'B',
    ],
    ['an unparsable document', '{ conference {', undefined],
  ])('does not cache %s', (_, query, operationName) => {
    expect(cacheableRead(JSON.stringify({ query, operationName }))).toBeNull()
  })

  it('caches a named query and keeps its variables', () => {
    expect(
      cacheableRead(
        JSON.stringify({
          query: 'query A($n: Int) { a(n: $n) }',
          variables: { n: 1 },
          operationName: 'A',
        }),
      ),
    ).toEqual({
      query: 'query A($n: Int) { a(n: $n) }',
      variables: { n: 1 },
      operationName: 'A',
    })
  })

  it('refuses tags a Cache-Tag header would silently drop', () => {
    expect(tagsFor({ orgId: 'org_a', conferenceId: null })).toEqual([
      'org:org_a',
    ])
    expect(tagsFor({ orgId: 'org a', conferenceId: null })).toBeNull()
    expect(tagsFor({ orgId: 'org,a', conferenceId: null })).toBeNull()
  })

  it.each([
    ['a clean 200', 200, { data: { a: 1 } }, ['org:x'], 'public, max-age=60'],
    [
      'errors',
      200,
      { data: null, errors: [{ message: 'x' }] },
      ['org:x'],
      'no-store',
    ],
    ['a non-200', 503, { data: { a: 1 } }, ['org:x'], 'no-store'],
    ['no valid tags', 200, { data: { a: 1 } }, null, 'no-store'],
  ])('storable: %s', async (_, status, json, tags, cc) => {
    const res = await storable(Response.json(json, { status }), 60, tags)
    expect(res.headers.get('cache-control')).toBe(cc)
    expect(res.headers.get('cache-tag')).toBe(
      cc === 'no-store' ? null : 'org:x',
    )
  })
})
