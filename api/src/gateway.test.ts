import { beforeAll, describe, expect, it, vi } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose'
import {
  ENVELOPE_HEADER,
  generateEnvelopeKeyPair,
  verifyEnvelope,
} from '@runkonf/tenancy'
import { createGateway, type Env } from './gateway'
import { compose } from './supergraph'

// vitest.config.ts aliases `jose` to a key-ignoring stub; load the real one so
// signatures, audiences and expiry are actually checked.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const VERIFIED = 'https://conf.example'
const TENANT = { orgId: 'org_a', conferenceId: 'conf_a' }

let envelopeKeys: { privatePem: string; publicPem: string }
let identityKey: CryptoKey
let jwks: unknown
const gateway = createGateway(compose())

beforeAll(async () => {
  envelopeKeys = await generateEnvelopeKeyPair()
  const pair = await generateKeyPair('EdDSA', { extractable: true })
  identityKey = pair.privateKey
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] }
})

/**
 * Fake tenant-directory: knows only conf.example, and records the envelope
 * header of every subgraph call (the gateway's own lookup sends none).
 */
function makeEnv(role: { orgRole: string | null } = { orgRole: 'admin' }) {
  const envelopes: (string | null)[] = []
  const forwarded: Headers[] = []
  const env = {
    ENVELOPE_PRIVATE_KEY: envelopeKeys.privatePem,
    IDENTITY_ISSUER: 'https://id.test',
    DIRECTORY: {
      fetch: async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body))
        // The gateway's own lookup; the federated subgraph call is minified.
        if (body.query.includes('orgId conferenceId')) {
          const known = body.variables.host === 'conf.example'
          return Response.json({
            data: { tenantByHost: known ? TENANT : null },
          })
        }
        forwarded.push(new Headers(init.headers))
        envelopes.push(forwarded.at(-1)!.get(ENVELOPE_HEADER))
        return Response.json({ data: { tenantByHost: null } })
      },
    },
    IDENTITY: { fetch: async () => Response.json(jwks) },
    MEMBERSHIP: {
      principal: vi.fn(async () => ({ ...role, platformOperator: false })),
    },
  }
  return { env: env as unknown as Env, envelopes, forwarded, role }
}

const post = (body: unknown, headers: Record<string, string> = {}): Request =>
  new Request('http://api.test/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const SUBGRAPH_QUERY = { query: '{ tenantByHost(host: "q") { orgId } }' }

const jwt = (
  opts: { aud?: string; iss?: string; ttl?: number; iat?: number } = {},
) => {
  const iat = opts.iat ?? Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setSubject('user_1')
    .setAudience(opts.aud ?? 'konf-gateway')
    .setIssuer(opts.iss ?? 'https://id.test')
    .setIssuedAt(iat)
    .setExpirationTime(iat + (opts.ttl ?? 300))
    .sign(identityKey)
}

describe('gateway', () => {
  it('exposes no @tag(internal) provisioning fields', async () => {
    const { env } = makeEnv()
    const res = await gateway.fetch(
      post({ query: '{ __schema { mutationType { name } } }' }),
      env,
    )
    expect(await res.json()).toEqual({
      data: { __schema: { mutationType: null } },
    })
    expect(compose()).not.toMatch(/provision|internal"\)|type Organization/)
  })

  it('answers the health query', async () => {
    const { env } = makeEnv()
    const res = await gateway.fetch(post({ query: '{ health }' }), env)
    expect(await res.json()).toEqual({ data: { health: 'ok' } })
  })

  it('strips a client envelope when no tenant resolves', async () => {
    const { env, envelopes } = makeEnv()
    await gateway.fetch(
      post(SUBGRAPH_QUERY, { [ENVELOPE_HEADER]: 'forged' }),
      env,
    )
    expect(envelopes).toEqual([null])
  })

  it('gives an unverified host no tenant', async () => {
    const { env, envelopes } = makeEnv()
    await gateway.fetch(
      post(SUBGRAPH_QUERY, { origin: 'https://unverified.example' }),
      env,
    )
    expect(envelopes).toEqual([null])
  })

  it('replaces a client envelope with an anonymous one for a verified host', async () => {
    const { env, envelopes } = makeEnv()
    await gateway.fetch(
      post(SUBGRAPH_QUERY, { origin: VERIFIED, [ENVELOPE_HEADER]: 'forged' }),
      env,
    )
    expect(envelopes[0]).not.toBe('forged')
    expect(await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem)).toEqual(
      { typ: 'tenant', ...TENANT, userId: null, orgRole: null, scopes: [] },
    )
  })

  it('mints userId and the live orgRole for a signed-in member', async () => {
    const { env, envelopes, role } = makeEnv()
    const headers = { origin: VERIFIED, authorization: `Bearer ${await jwt()}` }
    await gateway.fetch(post(SUBGRAPH_QUERY, headers), env)
    role.orgRole = 'member' // role changed in identity; next request sees it
    await gateway.fetch(post(SUBGRAPH_QUERY, headers), env)

    expect(env.MEMBERSHIP.principal).toHaveBeenCalledWith('user_1', 'org_a')
    const [first, second] = await Promise.all(
      envelopes.map((e) => verifyEnvelope(e!, envelopeKeys.publicPem)),
    )
    expect(first).toEqual({
      typ: 'tenant',
      ...TENANT,
      userId: 'user_1',
      orgRole: 'admin',
      scopes: [],
    })
    expect(second).toMatchObject({ orgRole: 'member' })
  })

  it.each([
    ['expired', () => jwt({ iat: Math.floor(Date.now() / 1000) - 600 })],
    ['wrong audience', () => jwt({ aud: 'someone-else' })],
    ['wrong issuer', () => jwt({ iss: 'https://auth.konf.app' })],
    ['too long-lived', () => jwt({ ttl: 3600 })],
    ['garbage', async () => 'not-a-jwt'],
  ])('rejects a %s identity token', async (_, token) => {
    const { env, envelopes } = makeEnv()
    const res = await gateway.fetch(
      post(SUBGRAPH_QUERY, {
        origin: VERIFIED,
        authorization: `Bearer ${await token()}`,
      }),
      env,
    )
    expect(res.status).toBe(401)
    expect(envelopes).toEqual([])
  })

  it('rejects batched requests', async () => {
    const { env } = makeEnv()
    const res = await gateway.fetch(
      post([{ query: '{ health }' }, { query: '{ health }' }]),
      env,
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects a query deeper than the limit before execution', async () => {
    const { env, envelopes } = makeEnv()
    // The schema has no self-nesting field; __type.ofType nests freely.
    const nested = `{ __type(name: "Query") { ${'ofType { '.repeat(12)}name${' }'.repeat(12)} } }`
    const res = await gateway.fetch(post({ query: nested }), env)
    const body = (await res.json()) as { errors: unknown[] }
    expect(JSON.stringify(body.errors)).toMatch(/depth limit/i)
    expect(envelopes).toEqual([])
  })

  it('rejects a deep __schema query', async () => {
    const { env } = makeEnv()
    const deep = `{ __schema { types { fields { type { ${'ofType { '.repeat(10)}name${' }'.repeat(10)} } } } } }`
    const res = await gateway.fetch(post({ query: deep }), env)
    expect(JSON.stringify(await res.json())).toMatch(/depth limit/i)
  })

  it('rejects 300 aliased __schema fields', async () => {
    const { env } = makeEnv()
    const aliases = Array.from(
      { length: 300 },
      (_, i) => `a${i}: __schema { queryType { name } }`,
    ).join(' ')
    const res = await gateway.fetch(post({ query: `{ ${aliases} }` }), env)
    expect(JSON.stringify(await res.json())).toMatch(/aliases limit/i)
  })

  it('accepts a lowercase bearer scheme and never forwards the token', async () => {
    const { env, envelopes, forwarded } = makeEnv()
    const res = await gateway.fetch(
      post(SUBGRAPH_QUERY, {
        origin: VERIFIED,
        authorization: `bearer ${await jwt()}`,
      }),
      env,
    )
    expect(res.status).toBe(200)
    expect(
      await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem),
    ).toMatchObject({ userId: 'user_1' })
    expect(forwarded[0].get('authorization')).toBeNull()
  })

  it('never accepts a NextAuth session cookie (#1803)', async () => {
    const { env, envelopes, forwarded } = makeEnv()
    const cookie =
      '__Secure-authjs.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0.x; authjs.session-token=y'
    await gateway.fetch(post(SUBGRAPH_QUERY, { origin: VERIFIED, cookie }), env)
    expect(
      await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem),
    ).toMatchObject({ userId: null })
    expect(forwarded[0].get('cookie')).toBeNull()
    expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()

    // Nor the same value presented as a bearer token.
    const res = await gateway.fetch(
      post(SUBGRAPH_QUERY, {
        origin: VERIFIED,
        authorization: 'Bearer eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0.x',
      }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it.each(['Basic abc', 'Bearer', 'Bearer a b', 'nonsense'])(
    'rejects a malformed Authorization header %j',
    async (authorization) => {
      const { env, envelopes } = makeEnv()
      const res = await gateway.fetch(
        post(SUBGRAPH_QUERY, { origin: VERIFIED, authorization }),
        env,
      )
      expect(res.status).toBe(401)
      expect(envelopes).toEqual([])
    },
  )

  it('answers 503 without detail when tenant-directory fails', async () => {
    const { env } = makeEnv()
    ;(env.DIRECTORY as unknown as { fetch: unknown }).fetch = async () => {
      throw new Error('secret detail')
    }
    const res = await gateway.fetch(
      post(SUBGRAPH_QUERY, { origin: VERIFIED }),
      env,
    )
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('secret detail')
  })

  it('masks unexpected subgraph failures', async () => {
    const { env } = makeEnv()
    ;(env.DIRECTORY as unknown as { fetch: unknown }).fetch = async (
      _url: string,
      init: RequestInit,
    ) => {
      if (String(init.body).includes('orgId conferenceId')) {
        return Response.json({ data: { tenantByHost: null } })
      }
      throw new Error('secret detail')
    }
    const res = await gateway.fetch(post(SUBGRAPH_QUERY), env)
    expect(await res.text()).not.toContain('secret detail')
  })
})
