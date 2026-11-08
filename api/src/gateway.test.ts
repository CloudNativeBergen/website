import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  SignJWT,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  type CryptoKey,
} from 'jose'
import {
  ENVELOPE_HEADER,
  generateEnvelopeKeyPair,
  verifyEnvelope,
} from '@runkonf/tenancy'
import { buildSchema, GraphQLError } from 'graphql'
import {
  createGateway,
  maskError,
  MAX_INPUT_MESSAGE,
  MUTATION_LIMIT_PER_MINUTE,
  OPERATOR_SCOPE,
  OPERATOR_TENANT_HEADER,
  OPERATOR_CONFERENCE_HEADER,
  SESSION_ORIGIN_CLAIM,
  type Env,
} from './gateway'
import { SITE_ASSERTION_HEADER } from './site-identity'
import { compose, publicSdl } from './supergraph'
import { SIGNED_IP_HEADER, signClientIp } from './client-ip'

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
const siteKeys: Record<string, CryptoKey> = {}
let sitePublicKeys: string
let strangerKey: CryptoKey
const gateway = createGateway(compose())

beforeAll(async () => {
  envelopeKeys = await generateEnvelopeKeyPair()
  const pair = await generateKeyPair('EdDSA', { extractable: true })
  identityKey = pair.privateKey
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] }
  const spki: Record<string, string> = {}
  for (const kid of ['s1', 's2']) {
    const p = await generateKeyPair('EdDSA', { extractable: true })
    siteKeys[kid] = p.privateKey
    spki[kid] = await exportSPKI(p.publicKey)
  }
  sitePublicKeys = JSON.stringify(spki)
  strangerKey = (await generateKeyPair('EdDSA')).privateKey
})

/**
 * Fake tenant-directory (knows only conf.example) and a fake content
 * subgraph that records the envelope header of every federated call (the
 * gateway's own directory lookup sends none).
 */
function makeEnv(
  role: { orgRole: string | null } = { orgRole: 'admin' },
  allow = true,
  ipAllow = true,
  mutationAllow = true,
) {
  const envelopes: (string | null)[] = []
  const forwarded: Headers[] = []
  const conference: (string | null)[] = []
  const env = {
    ENVELOPE_PRIVATE_KEY: envelopeKeys.privatePem,
    IDENTITY_ISSUER: 'https://id.test',
    DIRECTORY: {
      fetch: async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body))
        const known = body.variables.host === 'conf.example'
        return Response.json({ data: { tenantByHost: known ? TENANT : null } })
      },
    },
    CONTENT: {
      fetch: async (_url: string, init: RequestInit) => {
        forwarded.push(new Headers(init.headers))
        envelopes.push(forwarded.at(-1)!.get(ENVELOPE_HEADER))
        return Response.json({ data: { conference: null } })
      },
    },
    CONFERENCE: {
      fetch: async (_url: string, init: RequestInit) => {
        conference.push(new Headers(init.headers).get(ENVELOPE_HEADER))
        return Response.json({ data: { conference: { id: 'conf_a' } } })
      },
    },
    IDENTITY: { fetch: async () => Response.json(jwks) },
    API_LIMITER: { limit: vi.fn(async () => ({ success: allow })) },
    API_IP_LIMITER: { limit: vi.fn(async () => ({ success: ipAllow })) },
    API_MUTATION_LIMITER: {
      limit: vi.fn(async () => ({ success: mutationAllow })),
    },
    CLIENT_IP_SECRET: 'ip-secret',
    SITE_PUBLIC_KEYS: sitePublicKeys,
    MEMBERSHIP: {
      principal: vi.fn(async () => ({ ...role, platformOperator: false })),
    },
  }
  return {
    env: env as unknown as Env,
    envelopes,
    forwarded,
    conference,
    role,
  }
}

const post = (body: unknown, headers: Record<string, string> = {}): Request =>
  new Request('http://api.test/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const SUBGRAPH_QUERY = { query: '{ conference { id } }' }

const jwt = (
  opts: {
    aud?: string
    iss?: string
    ttl?: number
    iat?: number
    claims?: Record<string, unknown>
  } = {},
) => {
  const iat = opts.iat ?? Math.floor(Date.now() / 1000)
  return new SignJWT(opts.claims ?? { [SESSION_ORIGIN_CLAIM]: VERIFIED })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setSubject('user_1')
    .setAudience(opts.aud ?? 'konf-gateway')
    .setIssuer(opts.iss ?? 'https://id.test')
    .setIssuedAt(iat)
    .setExpirationTime(iat + (opts.ttl ?? 300))
    .sign(identityKey)
}

describe('gateway', () => {
  it('exposes updateConference, the membership mutations and the operator-only fields, no @tag(internal) fields', async () => {
    // Read from the served SDL: introspection is operator-only (#1961).
    const names = Object.keys(
      buildSchema(publicSdl()).getMutationType()!.getFields(),
    )
    expect(names.sort()).toEqual([
      'bindTicketEvent',
      'cancelInvitation',
      'changeMemberRole',
      'createApiClient',
      'createOrganization',
      'createPersonalAccessToken',
      'createSignupCode',
      'inviteMember',
      'openBillingPortal',
      'operatorCancelInvitation',
      'operatorChangeMemberRole',
      'operatorInviteMember',
      'operatorRemoveMember',
      'provisionConference',
      'provisionOrganization',
      'recordWorkshopReminder',
      'releaseWorkshopReminder',
      'removeMember',
      'reserveWorkshopReminder',
      'revokeAll',
      'revokeApiClient',
      'revokePersonalAccessToken',
      'revokeSignupCode',
      'rotateApiClientSecret',
      'seedDemoInvitation',
      'seedDemoUser',
      'seedTicketOrders',
      'setComplimentaryPlan',
      'setConferenceLifecycle',
      'signUpOrganization',
      'startCheckout',
      'submitProposal',
      'subscribePush',
      'unsubscribePush',
      'updateConference',
      'updateMyProfile',
      'updateMyProposal',
      'withdrawMyProposal',
    ])
    // Operator-only list (#1973): in the served schema, refused by
    // requirePlatform; introspection of it is operator-only (#1961).
    // Same for the cross-org conferences list (#1985).
    for (const f of ['organizations', 'conferences'])
      expect(
        buildSchema(publicSdl()).getQueryType()!.getFields()[f],
        f,
      ).toBeDefined()
    // Still @tag(internal) in tenant-directory, so cut (#1924).
    const sdl = compose()
    for (const field of [
      'repointAlias',
      'addCustomDomain',
      'removeCustomDomain',
      'refreshCustomDomain',
    ])
      expect(sdl).not.toContain(field)
    expect(sdl).not.toMatch(/internal"\)/)
  })

  it('exposes no conference(id:) field', async () => {
    // content's argument-free `conference` is public; tenant-directory's
    // conference(id:) is internal.
    const conference = buildSchema(publicSdl())
      .getQueryType()!
      .getFields().conference
    expect(conference?.args ?? []).toEqual([])
    expect(compose()).not.toMatch(/conference\(id:/)
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
      {
        typ: 'tenant',
        ...TENANT,
        userId: null,
        orgRole: null,
        scopes: [],
        plan: 'free',
        orgKind: 'customer',
      },
    )
  })

  // Billing phase 1 (#2129): the directory's effective plan, capped to the
  // vocabulary; absent (an older directory) or unknown is free.
  it.each([
    ['pro', 'pro'],
    ['basic', 'basic'],
    [undefined, 'free'],
    [null, 'free'],
    ['enterprise', 'free'],
  ])('mints the directory plan %j as %j', async (plan, want) => {
    const { env, envelopes } = makeEnv()
    ;(env as unknown as { DIRECTORY: unknown }).DIRECTORY = {
      fetch: async () =>
        Response.json({ data: { tenantByHost: { ...TENANT, plan } } }),
    }
    await gateway.fetch(post(SUBGRAPH_QUERY, { origin: VERIFIED }), env)
    expect(
      await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem),
    ).toMatchObject({ typ: 'tenant', plan: want })
  })

  it('asks the directory for the plan with the tenant lookup', async () => {
    const { env } = makeEnv()
    const asked: string[] = []
    const inner = env.DIRECTORY.fetch
    env.DIRECTORY.fetch = async (url: string, init: RequestInit) => {
      asked.push(JSON.parse(String(init.body)).query)
      return inner(url, init)
    }
    await gateway.fetch(post(SUBGRAPH_QUERY, { origin: VERIFIED }), env)
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatch(
      /tenantByHost\(host: \$host, conferenceId: \$conferenceId\) \{[^}]*\} plan orgKind \}/,
    )
  })

  // #2150: the directory's org kind, capped; absent or unknown is customer.
  it.each([
    ['demo', 'demo'],
    ['customer', 'customer'],
    [undefined, 'customer'],
    [null, 'customer'],
    ['operator', 'customer'],
  ])('mints the directory orgKind %j as %j', async (orgKind, want) => {
    const { env, envelopes } = makeEnv()
    ;(env as unknown as { DIRECTORY: unknown }).DIRECTORY = {
      fetch: async () =>
        Response.json({ data: { tenantByHost: { ...TENANT, orgKind } } }),
    }
    await gateway.fetch(post(SUBGRAPH_QUERY, { origin: VERIFIED }), env)
    expect(
      await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem),
    ).toMatchObject({ typ: 'tenant', orgKind: want })
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
      plan: 'free',
      orgKind: 'customer',
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

  it('applies the alias limit to mutations (no mutation can nest past the depth limit)', async () => {
    const { env, envelopes } = makeEnv()
    const aliases = Array.from(
      { length: 16 },
      (_, i) => `a${i}: updateConference(input: {}) { id }`,
    ).join(' ')
    const wide = await gateway.fetch(
      post({ query: `mutation { ${aliases} }` }),
      env,
    )
    expect(JSON.stringify(await wide.json())).toMatch(/aliases limit/i)
    expect(envelopes).toEqual([])
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
    ;(env.CONTENT as unknown as { fetch: unknown }).fetch = async () => {
      throw new Error('secret detail')
    }
    const res = await gateway.fetch(post(SUBGRAPH_QUERY), env)
    expect(await res.text()).not.toContain('secret detail')
  })

  it('masks subgraph error messages and serviceName, keeping a safe code', async () => {
    const { env } = makeEnv()
    ;(env.CONTENT as unknown as { fetch: unknown }).fetch = async () =>
      Response.json({
        data: { conference: null },
        errors: [
          {
            message: 'missing tenant envelope',
            path: ['conference'],
            extensions: { code: 'UNAUTHENTICATED', stacktrace: ['at x'] },
          },
        ],
      })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await gateway.fetch(post(SUBGRAPH_QUERY), env)
    const text = await res.text()
    expect(text).not.toContain('missing tenant envelope')
    expect(text).not.toContain('serviceName')
    expect(text).not.toContain('stacktrace')
    expect(JSON.parse(text).errors).toEqual([
      {
        message: 'Not signed in.',
        path: ['conference'],
        extensions: { code: 'UNAUTHENTICATED' },
      },
    ])
    // Full detail stays in the server log.
    expect(JSON.stringify(error.mock.calls)).toContain(
      'missing tenant envelope',
    )
    error.mockRestore()
  })

  it('masks a subgraph 5xx without its body, the request or serviceName', async () => {
    const { env } = makeEnv()
    ;(env.CONTENT as unknown as { fetch: unknown }).fetch = async () =>
      new Response('upstream secret page', { status: 502 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await gateway.fetch(post(SUBGRAPH_QUERY), env)
    const text = await res.text()
    expect(text).not.toContain('upstream secret')
    expect(text).not.toContain('{conference{id}}')
    expect(text).not.toContain('"request"')
    expect(text).not.toContain('serviceName')
    expect(text).not.toContain('Unexpected response')
    expect(JSON.parse(text).errors[0]).toMatchObject({
      message: 'Unexpected error.',
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    })
  })

  // #1877: extensions.http from a subgraph would set the gateway's status and headers.
  it('ignores a subgraph error extensions.http status and headers', async () => {
    const { env } = makeEnv()
    ;(env.CONTENT as unknown as { fetch: unknown }).fetch = async () =>
      Response.json({
        data: { conference: null },
        errors: [
          {
            message: 'boom',
            path: ['conference'],
            extensions: {
              code: 'SANITY_DOWN',
              http: {
                status: 418,
                headers: { 'set-cookie': 'session=planted', 'x-planted': '1' },
              },
            },
          },
        ],
      })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await gateway.fetch(post(SUBGRAPH_QUERY), env)
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-planted')).toBeNull()
    expect(text).not.toContain('418')
    expect(JSON.parse(text).errors[0]).toEqual({
      message: 'Unexpected error.',
      path: ['conference'],
      extensions: { code: 'INTERNAL_SERVER_ERROR', unexpected: true },
    })
  })

  it('keeps extensions.http on a masked gateway error', () => {
    const outer = new GraphQLError('secret detail', {
      originalError: new Error('secret detail'),
      extensions: { http: { status: 503 } },
    })
    const masked = maskError(outer, 'Unexpected error.') as GraphQLError
    expect(masked.message).toBe('Unexpected error.')
    expect(masked.extensions.http).toEqual({ status: 503 })
  })

  it('masks a GraphQLError chain that ends in a plain Error', () => {
    const inner = new GraphQLError('inner', {
      originalError: new Error('secret detail'),
    })
    const outer = new GraphQLError('secret detail', { originalError: inner })
    const masked = maskError(outer, 'Unexpected error.')
    expect(masked.message).toBe('Unexpected error.')
    expect((masked as GraphQLError).extensions).toMatchObject({
      unexpected: true,
    })
  })

  it('replaces a subgraph code outside the safe list', async () => {
    const { env } = makeEnv()
    ;(env.CONTENT as unknown as { fetch: unknown }).fetch = async () =>
      Response.json({
        data: { conference: null },
        errors: [
          { message: 'db host 10.0.0.1', extensions: { code: 'SANITY_DOWN' } },
        ],
      })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const text = await (await gateway.fetch(post(SUBGRAPH_QUERY), env)).text()
    expect(text).not.toContain('10.0.0.1')
    expect(text).not.toContain('SANITY_DOWN')
    expect(text).toContain('INTERNAL_SERVER_ERROR')
    expect(text).not.toContain('serviceName')
  })

  describe('subgraph error passthrough (#1888)', () => {
    const subgraphError = (
      code: string,
      msg: string,
      extra: Record<string, unknown> = {},
    ) =>
      new GraphQLError(msg, {
        path: ['updateConference'],
        originalError: Object.assign(new Error('cause: D1_ERROR at row 7'), {
          stack: 'Error: at d1.ts:1',
        }),
        extensions: { code, serviceName: 'conference', ...extra },
      })
    const json = (e: Error) => JSON.parse(JSON.stringify(e))

    it('passes the message and field of BAD_USER_INPUT, nothing else', () => {
      const masked = maskError(
        subgraphError('BAD_USER_INPUT', 'name is too long', {
          field: 'name',
          sql: 'SELECT * FROM conferences',
          orgId: 'org_b',
        }),
        'Unexpected error.',
      )
      expect(json(masked)).toEqual({
        message: 'name is too long',
        path: ['updateConference'],
        extensions: { code: 'BAD_USER_INPUT', field: 'name' },
      })
    })

    it('truncates an oversized message and drops a malformed field', () => {
      const masked = maskError(
        subgraphError('BAD_USER_INPUT', 'x'.repeat(10_000), {
          field: "name'; DROP TABLE conferences",
        }),
        'Unexpected error.',
      ) as GraphQLError
      expect(masked.message).toBe('x'.repeat(MAX_INPUT_MESSAGE))
      expect(masked.extensions).toEqual({ code: 'BAD_USER_INPUT' })
    })

    it('passes requiredPlan only with PLAN_REQUIRED and a known plan (#2115)', () => {
      const ext = (extra: Record<string, unknown>) =>
        (
          maskError(
            subgraphError('BAD_USER_INPUT', 'needs pro', extra),
            'Unexpected error.',
          ) as GraphQLError
        ).extensions
      expect(ext({ reason: 'PLAN_REQUIRED', requiredPlan: 'pro' })).toEqual({
        code: 'BAD_USER_INPUT',
        reason: 'PLAN_REQUIRED',
        requiredPlan: 'pro',
      })
      expect(ext({ reason: 'PLAN_REQUIRED', requiredPlan: 'org_b' })).toEqual({
        code: 'BAD_USER_INPUT',
        reason: 'PLAN_REQUIRED',
      })
      expect(ext({ reason: 'LIMIT_REACHED', requiredPlan: 'pro' })).toEqual({
        code: 'BAD_USER_INPUT',
        reason: 'LIMIT_REACHED',
      })
    })

    it('answers NOT_IMPLEMENTED with a generic message', () => {
      const masked = maskError(
        subgraphError('NOT_IMPLEMENTED', 'D1_ERROR org_b'),
        'Unexpected error.',
      )
      expect(json(masked)).toEqual({
        message: 'Not implemented yet.',
        path: ['updateConference'],
        extensions: { code: 'NOT_IMPLEMENTED' },
      })
    })

    it('answers NOT_FOUND with a generic message', () => {
      const masked = maskError(
        subgraphError('NOT_FOUND', 'conference conf_b of org_b not found'),
        'Unexpected error.',
      )
      expect(json(masked)).toEqual({
        message: 'Not found.',
        path: ['updateConference'],
        extensions: { code: 'NOT_FOUND' },
      })
    })

    it.each([
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'INTERNAL_SERVER_ERROR',
      'CONFLICT',
      'GRAPHQL_VALIDATION_FAILED',
      'bad_user_input',
      'BAD_USER_INPUT ',
      '',
    ])('masks the message, field and code of %j', (code) => {
      const secret =
        "D1_ERROR: SELECT * FROM conferences WHERE org_id = 'org_b'"
      const masked = maskError(
        subgraphError(code, secret, { field: 'name' }),
        'Unexpected error.',
      ) as GraphQLError
      expect(masked.message).toBe(
        { UNAUTHENTICATED: 'Not signed in.', FORBIDDEN: 'Not allowed.' }[
          code
        ] ?? 'Unexpected error.',
      )
      expect(masked.extensions).toEqual(
        ['UNAUTHENTICATED', 'FORBIDDEN'].includes(code)
          ? { code }
          : { code: 'INTERNAL_SERVER_ERROR', unexpected: true },
      )
      expect(JSON.stringify(masked)).not.toMatch(/SELECT|D1_ERROR|org_b/)
    })

    it('carries the field over the wire from the subgraph', async () => {
      const { env } = makeEnv()
      ;(env.CONTENT as unknown as { fetch: unknown }).fetch = async () =>
        Response.json({
          data: { conference: null },
          errors: [
            {
              message: 'endDate is before startDate',
              path: ['conference'],
              extensions: { code: 'BAD_USER_INPUT', field: 'endDate' },
            },
          ],
        })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const body = (await (
        await gateway.fetch(post(SUBGRAPH_QUERY), env)
      ).json()) as {
        errors: unknown[]
      }
      expect(body.errors[0]).toMatchObject({
        message: 'endDate is before startDate',
        extensions: { code: 'BAD_USER_INPUT', field: 'endDate' },
      })
      expect(JSON.stringify(body)).not.toContain('serviceName')
    })
  })

  // #1895: the Grafana alerts match these lines (docs/OBSERVABILITY.md).
  describe('log events', () => {
    const events = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls.flatMap(([line]) => {
        if (typeof line !== 'string') return []
        try {
          const parsed = JSON.parse(line) as { event?: unknown }
          return typeof parsed.event === 'string' ? [parsed] : []
        } catch {
          return []
        }
      })

    it('logs gateway.response.5xx with the status', async () => {
      const { env } = makeEnv()
      ;(env.DIRECTORY as unknown as { fetch: unknown }).fetch = async () => {
        throw new Error('secret detail')
      }
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const res = await gateway.fetch(
          post(SUBGRAPH_QUERY, { origin: VERIFIED }),
          env,
        )
        expect(res.status).toBe(503)
        expect(events(error)).toEqual([
          { event: 'gateway.response.5xx', status: 503 },
        ])
      } finally {
        error.mockRestore()
      }
    })

    it('logs gateway.error.masked with the subgraph, path and its code', async () => {
      const { env } = makeEnv()
      ;(env.CONTENT as unknown as { fetch: unknown }).fetch = async () =>
        Response.json({
          data: { conference: null },
          errors: [
            {
              message: 'secret detail',
              path: ['conference'],
              extensions: { code: 'TENANT_MISMATCH' },
            },
          ],
        })
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const res = await gateway.fetch(post(SUBGRAPH_QUERY), env)
        expect(res.status).toBe(200)
        const logged = events(error)
        expect(logged).toEqual([
          {
            event: 'gateway.error.masked',
            subgraph: 'content',
            path: 'conference',
            code: 'TENANT_MISMATCH',
          },
        ])
        expect(JSON.stringify(logged)).not.toContain('secret detail')
      } finally {
        error.mockRestore()
      }
    })

    it('logs gateway.error.masked when a subgraph answers 5xx', async () => {
      const { env } = makeEnv()
      ;(env.CONTENT as unknown as { fetch: unknown }).fetch = async () =>
        new Response('upstream secret page', { status: 502 })
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await gateway.fetch(post(SUBGRAPH_QUERY), env)
        expect(events(error)).toMatchObject([
          { event: 'gateway.error.masked', path: 'conference' },
        ])
        expect(JSON.stringify(events(error))).not.toContain('upstream secret')
      } finally {
        error.mockRestore()
      }
    })

    // The 2026-11-04 incident: a subgraph without GATEWAY_PUBLIC_KEY refuses
    // every envelope (packages/tenancy reject), and the caller sees a 200.
    it('logs gateway.error.masked for a subgraph envelope refusal', async () => {
      const { env } = makeEnv()
      ;(env.CONTENT as unknown as { fetch: unknown }).fetch = async () =>
        Response.json(
          {
            errors: [
              {
                message: 'invalid tenant envelope',
                extensions: { code: 'TENANT_MISMATCH' },
              },
            ],
          },
          { status: 403 },
        )
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const res = await gateway.fetch(post(SUBGRAPH_QUERY), env)
        expect(res.status).toBe(200)
        expect(events(error)).toEqual([
          {
            event: 'gateway.error.masked',
            subgraph: 'content',
            path: 'conference',
            code: 'TENANT_MISMATCH',
          },
        ])
      } finally {
        error.mockRestore()
      }
    })

    it('logs gateway.response.5xx for an uncaught throw, then rethrows', async () => {
      const { env } = makeEnv()
      vi.mocked(env.API_IP_LIMITER.limit).mockRejectedValue(
        new Error('secret detail'),
      )
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        await expect(gateway.fetch(post(SUBGRAPH_QUERY), env)).rejects.toThrow(
          'secret detail',
        )
        expect(events(error)).toEqual([
          { event: 'gateway.response.5xx', status: 500, uncaught: true },
        ])
      } finally {
        error.mockRestore()
      }
    })

    it.each([
      [
        'the per-IP limit',
        () => makeEnv(undefined, true, false),
        {},
        429,
        'RATE_LIMITED',
      ],
      [
        'the caller limit',
        () => makeEnv(undefined, false),
        {},
        429,
        'RATE_LIMITED',
      ],
      [
        'an invalid identity token',
        () => makeEnv(),
        { authorization: 'Bearer nope' },
        401,
        'UNAUTHENTICATED',
      ],
    ] as const)(
      'logs gateway.rejected for %s',
      async (_, env, headers, status, code) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
          const res = await gateway.fetch(
            post(SUBGRAPH_QUERY, { origin: VERIFIED, ...headers }),
            env().env,
          )
          expect(res.status).toBe(status)
          expect(events(error)).toEqual([
            { event: 'gateway.rejected', status, code },
          ])
        } finally {
          error.mockRestore()
        }
      },
    )

    it('logs gateway.rejected for the mutation budget', async () => {
      const { env } = makeEnv(undefined, true, true, false)
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const res = await gateway.fetch(
          post(
            { query: 'mutation { updateConference(input: {}) { id } }' },
            { origin: VERIFIED, authorization: `Bearer ${await jwt()}` },
          ),
          env,
        )
        expect(res.status).toBe(429)
        expect(events(error)).toEqual([
          {
            event: 'gateway.rejected',
            status: 429,
            code: 'RATE_LIMITED',
            limit: 'mutation',
          },
        ])
      } finally {
        error.mockRestore()
      }
    })

    // Hive fills data: { conference: null }, so a 5xx alert alone sees nothing.
    it('answers 200 with only the masked event when a subgraph sends no data', async () => {
      const { env } = makeEnv()
      ;(env.CONTENT as unknown as { fetch: unknown }).fetch = async () =>
        Response.json({
          errors: [{ message: 'secret detail', extensions: { code: 'X' } }],
        })
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const res = await gateway.fetch(
          post({ query: '{ conference { id } }' }),
          env,
        )
        expect({ status: res.status, events: events(error) }).toEqual({
          status: 200,
          events: [
            {
              event: 'gateway.error.masked',
              subgraph: 'content',
              path: 'conference',
              code: 'X',
            },
          ],
        })
      } finally {
        error.mockRestore()
      }
    })

    it('caps a subgraph code in the masked event', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        maskError(
          new GraphQLError('x', {
            extensions: { code: 'X'.repeat(500), serviceName: 'conference' },
          }),
          'Unexpected error.',
        )
        expect(events(error)).toEqual([
          {
            event: 'gateway.error.masked',
            subgraph: 'conference',
            code: 'X'.repeat(64),
          },
        ])
      } finally {
        error.mockRestore()
      }
    })

    // Billing phase 1 (#2129): PLAN_REQUIRED and its plan pass; anything
    // else in requiredPlan, or a requiredPlan on another reason, is dropped.
    it.each([
      [
        'PLAN_REQUIRED',
        'basic',
        { reason: 'PLAN_REQUIRED', requiredPlan: 'basic' },
      ],
      [
        'PLAN_REQUIRED',
        'pro',
        { reason: 'PLAN_REQUIRED', requiredPlan: 'pro' },
      ],
      ['PLAN_REQUIRED', 'free', { reason: 'PLAN_REQUIRED' }],
      ['PLAN_REQUIRED', '<script>', { reason: 'PLAN_REQUIRED' }],
      ['SLUG_TAKEN', 'pro', { reason: 'SLUG_TAKEN' }],
    ])('passes reason %s with requiredPlan %j as %j', (reason, plan, want) => {
      const masked = maskError(
        new GraphQLError('this needs the plan', {
          extensions: {
            code: 'BAD_USER_INPUT',
            reason,
            requiredPlan: plan,
            serviceName: 'tenant-directory',
          },
        }),
        'Unexpected error.',
      ) as GraphQLError
      expect(masked.extensions).toEqual({ code: 'BAD_USER_INPUT', ...want })
    })

    it.each(['BAD_USER_INPUT', 'NOT_FOUND', 'FORBIDDEN', 'UNAUTHENTICATED'])(
      'logs no masked event for the safe code %s',
      (code) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
          const masked = maskError(
            new GraphQLError('refused', {
              extensions: { code, serviceName: 'conference' },
            }),
            'Unexpected error.',
          ) as GraphQLError
          // The value that proves this path ran: the code passed through.
          expect(masked.extensions.code).toBe(code)
          expect(events(error)).toEqual([])
        } finally {
          error.mockRestore()
        }
      },
    )
  })

  describe('rate limiting', () => {
    const keys = (env: Env) =>
      vi.mocked(env.API_LIMITER.limit).mock.calls.map(([o]) => o.key)

    const MUTATION = {
      query: 'mutation { updateConference(input: {}) { id } }',
    }
    const mutationKeys = (env: Env) =>
      vi.mocked(env.API_MUTATION_LIMITER.limit).mock.calls.map(([o]) => o.key)

    it('refuses a mutation when the mutation budget is spent', async () => {
      const { env } = makeEnv(undefined, true, true, false)
      const res = await gateway.fetch(
        post(MUTATION, {
          origin: VERIFIED,
          authorization: `Bearer ${await jwt()}`,
        }),
        env,
      )
      expect(res.status).toBe(429)
      expect(mutationKeys(env)).toEqual(['user:user_1:mutation'])
      expect(await res.json()).toMatchObject({
        errors: [{ extensions: { code: 'RATE_LIMITED' } }],
      })
    })

    // Yoga parses JSON, application/graphql and form bodies alike; each is
    // classified from what Yoga parsed, not from the raw body.
    const MUTATION_DOC = 'mutation { updateConference(input: {}) { id } }'
    const QUERY_DOC = '{ conference { id } }'
    const raw = (type: string, body: string, method = 'POST') =>
      new Request('http://api.test/graphql', {
        method,
        headers: { origin: VERIFIED, 'content-type': type },
        body,
      })
    const bodies = (doc: string): [string, string][] => [
      ['application/json', JSON.stringify({ query: doc })],
      ['application/graphql', doc],
      [
        'application/x-www-form-urlencoded',
        new URLSearchParams({ query: doc }).toString(),
      ],
    ]

    it.each(bodies(MUTATION_DOC))(
      'spends the mutation budget for a mutation as %s',
      async (type, body) => {
        const { env, conference } = makeEnv(undefined, true, true, false)
        const res = await gateway.fetch(raw(type, body), env)
        expect(res.status).toBe(429)
        expect(mutationKeys(env)).toEqual(['anon:org_a:unknown:mutation'])
        expect(conference).toEqual([])
      },
    )

    it.each(bodies(QUERY_DOC))(
      'keeps a query as %s off the mutation budget',
      async (type, body) => {
        const { env } = makeEnv(undefined, true, true, false)
        const res = await gateway.fetch(raw(type, body), env)
        expect(res.status).toBe(200)
        expect(mutationKeys(env)).toEqual([])
      },
    )

    it('pins what Yoga does with GET and multipart', async () => {
      const { env, conference } = makeEnv()
      const get = await gateway.fetch(
        new Request(
          `http://api.test/graphql?query=${encodeURIComponent(MUTATION_DOC)}`,
          { headers: { origin: VERIFIED } },
        ),
        env,
      )
      expect(get.status).toBe(405)
      const form = new FormData()
      form.set('operations', JSON.stringify({ query: MUTATION_DOC }))
      form.set('map', '{}')
      const multipart = await gateway.fetch(
        new Request('http://api.test/graphql', {
          method: 'POST',
          headers: { origin: VERIFIED },
          body: form,
        }),
        env,
      )
      expect(multipart.status).toBe(415)
      expect(conference).toEqual([])
    })

    it('counts a mutation whose operationName reads like a query', async () => {
      const { env } = makeEnv(undefined, true, true, false)
      const res = await gateway.fetch(
        post(
          {
            query:
              'mutation GetConference { updateConference(input: {}) { id } }',
            operationName: 'GetConference',
          },
          { origin: VERIFIED },
        ),
        env,
      )
      expect(res.status).toBe(429)
      expect(mutationKeys(env)).toEqual(['anon:org_a:unknown:mutation'])
    })

    it('keeps queries off the mutation budget, even when it is spent', async () => {
      const { env } = makeEnv(undefined, true, true, false)
      const res = await gateway.fetch(
        post(
          {
            query: 'mutation M { x } query Q { conference { id } }',
            operationName: 'Q',
          },
          { origin: VERIFIED, authorization: `Bearer ${await jwt()}` },
        ),
        env,
      )
      // `x` fails validation (400), but never the mutation budget (429).
      expect(res.status).toBe(400)
      expect(keys(env)).toEqual(['user:user_1'])
      expect(mutationKeys(env)).toEqual([])
    })

    it('picks the mutation by operationName', async () => {
      const { env } = makeEnv(undefined, true, true, false)
      const res = await gateway.fetch(
        post(
          {
            query:
              'query Q { conference { id } } mutation M { updateConference(input: {}) { id } }',
            operationName: 'M',
          },
          { origin: VERIFIED },
        ),
        env,
      )
      expect(res.status).toBe(429)
      expect(mutationKeys(env)).toEqual(['anon:org_a:unknown:mutation'])
    })

    it('matches the mutation budget configured in wrangler.jsonc', () => {
      const config = readFileSync(
        new URL('../wrangler.jsonc', import.meta.url),
        'utf8',
      )
      const limits = [
        ...config.matchAll(
          /"name": "API_MUTATION_LIMITER",[^}]*"limit": (\d+)/g,
        ),
      ].map((m) => Number(m[1]))
      expect(limits).toEqual([60, 60, 60])
      expect(MUTATION_LIMIT_PER_MINUTE).toBe(60)
    })

    it('keys anonymous callers on tenant and the signed client IP', async () => {
      const { env } = makeEnv()
      const signed = await signClientIp('203.0.113.7', 'ip-secret')
      await gateway.fetch(
        post(SUBGRAPH_QUERY, {
          origin: VERIFIED,
          'cf-connecting-ip': '10.0.0.1',
          [SIGNED_IP_HEADER]: signed,
        }),
        env,
      )
      await gateway.fetch(
        post(SUBGRAPH_QUERY, {
          'cf-connecting-ip': '10.0.0.1',
          [SIGNED_IP_HEADER]: signed.replace('.7.', '.8.'),
        }),
        env,
      )
      expect(keys(env)).toEqual([
        'anon:org_a:203.0.113.7',
        'anon:null:10.0.0.1',
      ])
    })

    it('keys signed-in callers on the verified sub', async () => {
      const { env } = makeEnv()
      await gateway.fetch(
        post(SUBGRAPH_QUERY, {
          origin: VERIFIED,
          authorization: `Bearer ${await jwt()}`,
        }),
        env,
      )
      expect(keys(env)).toEqual(['user:user_1'])
    })

    it('answers 429 to a mutation on the general budget before identity work', async () => {
      const { env } = makeEnv(undefined, false)
      const res = await gateway.fetch(
        post(
          { query: 'mutation { updateConference(input: {}) { id } }' },
          { origin: VERIFIED },
        ),
        env,
      )
      expect(res.status).toBe(429)
      expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
    })

    it('answers 429 before any identity or Membership work', async () => {
      const { env } = makeEnv(undefined, false)
      const res = await gateway.fetch(
        post(SUBGRAPH_QUERY, { origin: VERIFIED }),
        env,
      )
      expect(res.status).toBe(429)
      expect(await res.json()).toMatchObject({
        errors: [{ extensions: { code: 'RATE_LIMITED' } }],
      })
      expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
    })

    it('answers 429 per IP before the tenant lookup', async () => {
      const { env } = makeEnv(undefined, true, false)
      const lookup = vi.spyOn(env.DIRECTORY, 'fetch')
      const res = await gateway.fetch(
        post(SUBGRAPH_QUERY, {
          origin: VERIFIED,
          'cf-connecting-ip': '10.0.0.1',
        }),
        env,
      )
      expect(res.status).toBe(429)
      expect(lookup).not.toHaveBeenCalled()
      expect(vi.mocked(env.API_IP_LIMITER.limit)).toHaveBeenCalledWith({
        key: 'ip:10.0.0.1',
      })
    })

    it('answers 429 to a signed-in caller before Membership', async () => {
      const { env } = makeEnv(undefined, false)
      const res = await gateway.fetch(
        post(SUBGRAPH_QUERY, {
          origin: VERIFIED,
          authorization: `Bearer ${await jwt()}`,
        }),
        env,
      )
      expect(res.status).toBe(429)
      expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
    })
  })

  describe('site service identity', () => {
    const assertion = (
      opts: {
        kid?: string
        key?: CryptoKey
        iat?: number
        ttl?: number
        aud?: string
        host?: string
      } = {},
    ) => {
      const iat = opts.iat ?? Math.floor(Date.now() / 1000)
      return new SignJWT({ host: opts.host ?? 'conf.example' })
        .setProtectedHeader({ alg: 'EdDSA', kid: opts.kid ?? 's1' })
        .setIssuer('konf-site')
        .setAudience(opts.aud ?? 'konf-gateway')
        .setJti(crypto.randomUUID())
        .setIssuedAt(iat)
        .setExpirationTime(iat + (opts.ttl ?? 60))
        .sign(opts.key ?? siteKeys[opts.kid ?? 's1'])
    }
    const minted = async (envelopes: (string | null)[]) =>
      envelopes[0] && verifyEnvelope(envelopes[0], envelopeKeys.publicPem)

    it.each(['s1', 's2'])(
      'trusts the asserted host over Origin (kid %s)',
      async (kid) => {
        const { env, envelopes, forwarded } = makeEnv()
        await gateway.fetch(
          post(SUBGRAPH_QUERY, {
            origin: 'https://unverified.example',
            [SITE_ASSERTION_HEADER]: await assertion({ kid }),
          }),
          env,
        )
        // Anonymous: the assertion grants no role, only the site lane's
        // scope (#2080), which the conference subgraph trusts for the
        // ticketing binding.
        expect(await minted(envelopes)).toEqual({
          typ: 'tenant',
          ...TENANT,
          userId: null,
          orgRole: null,
          scopes: ['site:server'],
          plan: 'free',
          orgKind: 'customer',
        })
        expect(forwarded[0].get(SITE_ASSERTION_HEADER)).toBeNull()
      },
    )

    it.each([
      ['forged', () => assertion({ key: strangerKey })],
      [
        'expired',
        () => assertion({ iat: Math.floor(Date.now() / 1000) - 120 }),
      ],
      ['too long-lived', () => assertion({ ttl: 3600 })],
      ['unknown-kid', () => assertion({ kid: 'gone', key: siteKeys.s1 })],
      ['wrong-audience', () => assertion({ aud: 'konf-subgraphs' })],
      ['garbage', async () => 'nope'],
    ])('ignores a %s assertion and falls back to Origin', async (_, token) => {
      const { env, envelopes } = makeEnv()
      await gateway.fetch(
        post(SUBGRAPH_QUERY, { [SITE_ASSERTION_HEADER]: await token() }),
        env,
      )
      expect(envelopes).toEqual([null])
    })

    it('ignores every assertion when SITE_PUBLIC_KEYS is unset', async () => {
      const { env, envelopes } = makeEnv()
      delete (env as { SITE_PUBLIC_KEYS?: string }).SITE_PUBLIC_KEYS
      await gateway.fetch(
        post(SUBGRAPH_QUERY, { [SITE_ASSERTION_HEADER]: await assertion() }),
        env,
      )
      expect(envelopes).toEqual([null])
    })

    it('ignores a replayed assertion', async () => {
      const token = await assertion()
      const first = makeEnv()
      await gateway.fetch(
        post(SUBGRAPH_QUERY, { [SITE_ASSERTION_HEADER]: token }),
        first.env,
      )
      const again = makeEnv()
      await gateway.fetch(
        post(SUBGRAPH_QUERY, { [SITE_ASSERTION_HEADER]: token }),
        again.env,
      )
      expect(await minted(first.envelopes)).toMatchObject(TENANT)
      expect(again.envelopes).toEqual([null])
    })

    it.each([
      [
        'differs from Origin',
        { [SESSION_ORIGIN_CLAIM]: 'https://other.example' },
      ],
      ['is missing', {}],
    ])(
      'refuses a browser-lane user whose session origin %s',
      async (_, claims) => {
        const { env, envelopes } = makeEnv()
        const res = await gateway.fetch(
          post(SUBGRAPH_QUERY, {
            origin: VERIFIED,
            authorization: `Bearer ${await jwt({ claims })}`,
          }),
          env,
        )
        expect(res.status).toBe(401)
        expect(envelopes).toEqual([])
      },
    )

    it('refuses a server-lane user without a session origin', async () => {
      const { env } = makeEnv()
      const res = await gateway.fetch(
        post(SUBGRAPH_QUERY, {
          [SITE_ASSERTION_HEADER]: await assertion(),
          authorization: `Bearer ${await jwt({ claims: {} })}`,
        }),
        env,
      )
      expect(res.status).toBe(401)
    })

    it('refuses a user whose session origin differs from the asserted host', async () => {
      const { env, envelopes } = makeEnv()
      const res = await gateway.fetch(
        post(SUBGRAPH_QUERY, {
          [SITE_ASSERTION_HEADER]: await assertion(),
          authorization: `Bearer ${await jwt({ claims: { [SESSION_ORIGIN_CLAIM]: 'https://other.example' } })}`,
        }),
        env,
      )
      expect(res.status).toBe(401)
      expect(envelopes).toEqual([])
    })

    it('accepts a user whose session origin is the asserted host', async () => {
      const { env, envelopes } = makeEnv()
      const res = await gateway.fetch(
        post(SUBGRAPH_QUERY, {
          [SITE_ASSERTION_HEADER]: await assertion(),
          authorization: `Bearer ${await jwt({ claims: { [SESSION_ORIGIN_CLAIM]: VERIFIED } })}`,
        }),
        env,
      )
      expect(res.status).toBe(200)
      expect(await minted(envelopes)).toMatchObject({ userId: 'user_1' })
    })

    describe('rolloutFlags (#1925)', () => {
      const on = {
        apiRead: true,
        identityLogin: true,
        d1Write: false,
        d1Override: true,
      }
      const other = {
        apiRead: false,
        identityLogin: false,
        d1Write: true,
        d1Override: false,
      }
      const QUERY = {
        query: '{ rolloutFlags { apiRead identityLogin d1Write } }',
      }
      const withFlags = () => {
        const made = makeEnv()
        const hosts: Record<string, unknown> = {
          'conf.example': { ...TENANT, flags: on },
          'other.example': {
            orgId: 'org_b',
            conferenceId: 'conf_b',
            flags: other,
          },
        }
        ;(made.env.DIRECTORY as unknown as { fetch: unknown }).fetch = async (
          _url: string,
          init: RequestInit,
        ) => {
          const { variables } = JSON.parse(String(init.body))
          return Response.json({
            data: { tenantByHost: hosts[variables.host] ?? null },
          })
        }
        return made
      }
      const ask = async (headers: Record<string, string>) => {
        const { env } = withFlags()
        const res = await gateway.fetch(post(QUERY, headers), env)
        return ((await res.json()) as { data: { rolloutFlags: unknown } }).data
          .rolloutFlags
      }

      it("answers the asserted host's own flags, and only those", async () => {
        expect(
          await ask({ [SITE_ASSERTION_HEADER]: await assertion() }),
        ).toEqual({
          apiRead: true,
          identityLogin: true,
          d1Write: false,
        })
        expect(
          await ask({
            origin: VERIFIED,
            [SITE_ASSERTION_HEADER]: await assertion({ host: 'other.example' }),
          }),
        ).toEqual({ apiRead: false, identityLogin: false, d1Write: true })
      })

      it('answers null without a verified site assertion', async () => {
        expect(await ask({ origin: VERIFIED })).toBeNull()
        expect(
          await ask({
            origin: VERIFIED,
            [SITE_ASSERTION_HEADER]: await assertion({ key: strangerKey }),
          }),
        ).toBeNull()
      })

      it('takes no argument, so a caller cannot name a tenant or a value', async () => {
        const { env } = withFlags()
        const res = await gateway.fetch(
          post(
            { query: '{ rolloutFlags(host: "other.example") { apiRead } }' },
            { [SITE_ASSERTION_HEADER]: await assertion() },
          ),
          env,
        )
        const body = (await res.json()) as {
          data?: unknown
          errors?: unknown[]
        }
        expect(body.errors?.length).toBeGreaterThan(0)
        expect(body.data ?? null).toBeNull()
      })

      it('routes the conference label to D1 on the flag, per resolved tenant', async () => {
        for (const [origin, routed] of [
          ['https://conf.example', 1],
          ['https://other.example', 0],
        ] as const) {
          const { env, conference } = withFlags()
          await gateway.fetch(post(SUBGRAPH_QUERY, { origin }), env)
          expect(conference).toHaveLength(routed)
        }
      })
    })
  })
})

describe('conference subgraph', () => {
  it('composes into the public contract without an id argument', () => {
    const sdl = compose()
    expect(sdl).toMatch(/conference: Conference/)
    expect(sdl).not.toMatch(/conference\(id/)
  })

  it('reaches konf-conference over its binding with the minted envelope', async () => {
    const { env, conference } = makeEnv()
    // org_a's conference has d1_override, so the `conference` label is on.
    ;(env as unknown as { DIRECTORY: unknown }).DIRECTORY = {
      fetch: async () =>
        Response.json({
          data: { tenantByHost: { ...TENANT, flags: { d1Override: true } } },
        }),
    }
    const res = await gateway.fetch(
      post({ query: '{ conference { id } }' }, { origin: VERIFIED }),
      env,
    )
    expect(await res.json()).toEqual({ data: { conference: { id: 'conf_a' } } })
    expect(conference).toHaveLength(1)
    const envelope = await verifyEnvelope(
      conference[0]!,
      envelopeKeys.publicPem,
    )
    expect(envelope).toMatchObject({ typ: 'tenant', ...TENANT, userId: null })
  })
})

describe('operator lane (#1892 phase 4)', () => {
  const OPS = 'https://my.konf.app'
  const opsJwt = () => jwt({ claims: { [SESSION_ORIGIN_CLAIM]: OPS } })

  function opsEnv(
    platformOperator = true,
    allow = true,
    orgRole: string | null = 'admin',
  ) {
    const made = makeEnv({ orgRole }, allow)
    const env = made.env as Env & Record<string, unknown>
    env.OPERATOR_ORIGIN = OPS
    env.DIRECTORY.fetch = vi.fn(env.DIRECTORY.fetch)
    env.MEMBERSHIP.principal = vi.fn(async () => ({
      orgRole,
      platformOperator,
    }))
    return { ...made, env }
  }

  const call = async (
    env: Env,
    headers: Record<string, string>,
    query = SUBGRAPH_QUERY,
  ) => gateway.fetch(post(query, headers), env)

  it('mints a PlatformContext for an operator with no tenant named', async () => {
    const { env, envelopes } = opsEnv()
    await call(env, { origin: OPS, authorization: `Bearer ${await opsJwt()}` })
    expect(await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem)).toEqual(
      { typ: 'platform', userId: 'user_1', platformRole: 'operator' },
    )
  })

  it('mints a tenant envelope with the operator scope and own orgRole for a named tenant', async () => {
    const { env, envelopes } = opsEnv()
    await call(env, {
      origin: OPS,
      authorization: `Bearer ${await opsJwt()}`,
      [OPERATOR_TENANT_HEADER]: 'conf.example',
    })
    expect(env.MEMBERSHIP.principal).toHaveBeenCalledWith('user_1', 'org_a')
    expect(await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem)).toEqual(
      {
        typ: 'tenant',
        ...TENANT,
        userId: 'user_1',
        orgRole: 'admin',
        scopes: [OPERATOR_SCOPE],
        plan: 'free',
        orgKind: 'customer',
      },
    )
  })

  // #2168: identity's CLI token is the same JWT plus `cli: true` and a jti.
  it('accepts a CLI operator token and refuses it once expired', async () => {
    const iat = Math.floor(Date.now() / 1000)
    const cli = await jwt({
      iat,
      claims: { [SESSION_ORIGIN_CLAIM]: OPS, cli: true, jti: 'j1' },
    })
    const { env, envelopes } = opsEnv()
    const ok = await call(env, { origin: OPS, authorization: `Bearer ${cli}` })
    expect(ok.status).not.toBe(401)
    expect(await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem)).toEqual(
      { typ: 'platform', userId: 'user_1', platformRole: 'operator' },
    )
    vi.useFakeTimers({ now: (iat + 301 + 5) * 1000 })
    try {
      const late = await call(opsEnv().env, {
        origin: OPS,
        authorization: `Bearer ${cli}`,
      })
      expect(late.status).toBe(401)
    } finally {
      vi.useRealTimers()
    }
  })

  it('mints the named tenant plan on the operator lane (#2129)', async () => {
    const { env, envelopes } = opsEnv()
    env.DIRECTORY.fetch = vi.fn(async () =>
      Response.json({ data: { tenantByHost: { ...TENANT, plan: 'basic' } } }),
    )
    await call(env, {
      origin: OPS,
      authorization: `Bearer ${await opsJwt()}`,
      [OPERATOR_TENANT_HEADER]: 'conf.example',
    })
    expect(
      await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem),
    ).toMatchObject({ typ: 'tenant', plan: 'basic' })
  })

  it('gives a non-operator with no tenant named a UserContext only (#2036)', async () => {
    const { env, envelopes } = opsEnv(false)
    await call(env, {
      origin: OPS,
      authorization: `Bearer ${await opsJwt()}`,
    })
    expect(envelopes).toHaveLength(1)
    const e = await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem)
    expect(e).toEqual({ typ: 'user', userId: expect.any(String) })
  })

  it('marks a non-operator CLI token on the UserContext (#2163)', async () => {
    const { env, envelopes } = opsEnv(false)
    const cli = await jwt({
      iat: Math.floor(Date.now() / 1000),
      claims: { [SESSION_ORIGIN_CLAIM]: OPS, cli: true, jti: 'j2' },
    })
    await call(env, { origin: OPS, authorization: `Bearer ${cli}` })
    expect(await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem)).toEqual(
      { typ: 'user', userId: expect.any(String), cli: true },
    )
  })

  it('refuses an anonymous caller', async () => {
    const { env, envelopes } = opsEnv()
    const res = await call(env, {
      origin: OPS,
      [OPERATOR_TENANT_HEADER]: 'nowhere.example', // 401, not the lookup's 400
    })
    expect(res.status).toBe(401)
    expect(envelopes).toEqual([])
    expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
    expect(env.DIRECTORY.fetch).not.toHaveBeenCalled()
  })

  it('gives an operator with no role in the tenant orgRole null (no write)', async () => {
    const { env, envelopes } = opsEnv(true, true, null)
    await call(env, {
      origin: OPS,
      authorization: `Bearer ${await opsJwt()}`,
      [OPERATOR_TENANT_HEADER]: 'conf.example',
    })
    expect(
      await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem),
    ).toMatchObject({ typ: 'tenant', orgRole: null })
  })

  describe('conference by id (#2150)', () => {
    const askedFor = (env: Env) =>
      (env.DIRECTORY.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        ([, init]) =>
          JSON.parse((init as RequestInit).body as string).variables,
      )
    const byId = (env: Env) => {
      env.DIRECTORY.fetch = vi.fn(async (_: unknown, init?: RequestInit) => {
        const { conferenceId } = JSON.parse(init!.body as string).variables
        // The directory resolves only conf_b of the host's org (worker.test).
        if (conferenceId && conferenceId !== 'conf_b')
          return Response.json({ data: { tenantByHost: null } })
        return Response.json({
          data: {
            tenantByHost: {
              ...TENANT,
              conferenceId: conferenceId ?? TENANT.conferenceId,
            },
          },
        })
      }) as unknown as Fetcher['fetch']
    }

    it("mints the named conference into an operator's envelope", async () => {
      const { env, envelopes } = opsEnv()
      byId(env)
      await call(env, {
        origin: OPS,
        authorization: `Bearer ${await opsJwt()}`,
        [OPERATOR_TENANT_HEADER]: 'conf.example',
        [OPERATOR_CONFERENCE_HEADER]: 'conf_b',
      })
      expect(askedFor(env)).toEqual([
        { host: 'conf.example', conferenceId: 'conf_b' },
      ])
      expect(
        await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem),
      ).toMatchObject({
        typ: 'tenant',
        orgId: TENANT.orgId,
        conferenceId: 'conf_b',
      })
    })

    it("refuses another org's conference id (the directory resolves none)", async () => {
      const { env, envelopes } = opsEnv()
      byId(env)
      const res = await call(env, {
        origin: OPS,
        authorization: `Bearer ${await opsJwt()}`,
        [OPERATOR_TENANT_HEADER]: 'conf.example',
        [OPERATOR_CONFERENCE_HEADER]: 'conf_other_org',
      })
      expect(res.status).toBe(400)
      expect(envelopes).toEqual([])
    })

    it('refuses an org admin who is not a platform operator', async () => {
      const { env, envelopes } = opsEnv(false)
      byId(env)
      const res = await call(env, {
        origin: OPS,
        authorization: `Bearer ${await opsJwt()}`,
        [OPERATOR_TENANT_HEADER]: 'conf.example',
        [OPERATOR_CONFERENCE_HEADER]: 'conf_b',
      })
      expect(res.status).toBe(403)
      expect(envelopes).toEqual([])
    })

    it('is ignored off the operator lane', async () => {
      const { env } = opsEnv()
      byId(env)
      await call(env, {
        origin: 'https://conf.example',
        [OPERATOR_CONFERENCE_HEADER]: 'conf_b',
      })
      expect(askedFor(env)).toEqual([
        { host: 'conf.example', conferenceId: null },
      ])
    })
  })

  it('refuses an unknown tenant host', async () => {
    const { env, envelopes } = opsEnv()
    const res = await call(env, {
      origin: OPS,
      authorization: `Bearer ${await opsJwt()}`,
      [OPERATOR_TENANT_HEADER]: 'nowhere.example',
    })
    expect(res.status).toBe(400)
    expect(envelopes).toEqual([])
  })

  it('refuses a tenant-site session on the operator lane', async () => {
    const { env, envelopes } = opsEnv()
    const res = await call(env, {
      origin: OPS,
      authorization: `Bearer ${await jwt()}`, // session origin is the tenant site
    })
    expect(res.status).toBe(401)
    expect(envelopes).toEqual([])
  })

  it('never enters the operator lane through a site assertion', async () => {
    const { env, envelopes } = opsEnv()
    const assertion = await new SignJWT({ host: 'my.konf.app' })
      .setProtectedHeader({ alg: 'EdDSA', kid: 's1' })
      .setIssuer('konf-site')
      .setAudience('konf-gateway')
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(siteKeys.s1)
    await call(env, {
      [SITE_ASSERTION_HEADER]: assertion,
      authorization: `Bearer ${await opsJwt()}`,
    })
    expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
    expect(envelopes.filter(Boolean)).toEqual([])
  })

  it('refuses an operator token replayed on a tenant site host', async () => {
    const { env, envelopes } = opsEnv()
    const res = await call(env, {
      origin: VERIFIED,
      authorization: `Bearer ${await opsJwt()}`,
      [OPERATOR_TENANT_HEADER]: 'conf.example',
    })
    expect(res.status).toBe(401)
    expect(envelopes).toEqual([])
  })

  it('never puts the operator scope on a tenant-site envelope (#1921)', async () => {
    // A platform operator signed in on the tenant site, naming a tenant.
    const { env, envelopes } = opsEnv()
    await call(env, {
      origin: VERIFIED,
      authorization: `Bearer ${await jwt()}`,
      [OPERATOR_TENANT_HEADER]: 'conf.example',
    })
    expect(
      await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem),
    ).toMatchObject({ typ: 'tenant', scopes: [] })
  })

  it('is off when OPERATOR_ORIGIN is unset', async () => {
    const { env, envelopes } = opsEnv()
    delete (env as Record<string, unknown>).OPERATOR_ORIGIN
    await call(env, { origin: OPS, authorization: `Bearer ${await opsJwt()}` })
    expect(envelopes).toEqual([null])
    expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
  })

  it('spends the per-user budget before Membership', async () => {
    const { env, envelopes } = opsEnv(true, false)
    const res = await call(env, {
      origin: OPS,
      authorization: `Bearer ${await opsJwt()}`,
    })
    expect(res.status).toBe(429)
    expect(env.API_LIMITER.limit).toHaveBeenCalledWith({ key: 'user:user_1' })
    expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
    expect(envelopes).toEqual([])
  })

  const preflight = (origin: string, headers: string) =>
    new Request('http://api.test/graphql', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': headers,
      },
    })

  it('answers the operator preflight before auth, tenant or Membership work', async () => {
    const { env } = opsEnv()
    const res = await gateway.fetch(
      preflight(OPS, `authorization, content-type, ${OPERATOR_TENANT_HEADER}`),
      env,
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(OPS)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    expect(
      res.headers.get('access-control-allow-headers')?.split(', '),
    ).toEqual([
      'authorization',
      'content-type',
      OPERATOR_TENANT_HEADER,
      OPERATOR_CONFERENCE_HEADER,
    ])
    expect(env.DIRECTORY.fetch).not.toHaveBeenCalled()
    expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
  })

  it('gives another origin no CORS grant for the operator header', async () => {
    const { env } = opsEnv()
    const res = await gateway.fetch(
      preflight(VERIFIED, `authorization, ${OPERATOR_TENANT_HEADER}`),
      env,
    )
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('access-control-allow-headers')).toBeNull()
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
  })

  // #1954: a bad token never costs a directory read in the operator lane.
  it.each([
    ['missing', async () => 'Bearer'],
    ['invalid', async () => 'Bearer not.a.jwt'],
    [
      'expired',
      async () =>
        `Bearer ${await jwt({ claims: { [SESSION_ORIGIN_CLAIM]: OPS }, iat: Math.floor(Date.now() / 1000) - 600 })}`,
    ],
  ])('resolves no operator tenant for a %s token', async (_, authorization) => {
    const { env, envelopes } = opsEnv()
    const res = await call(env, {
      origin: OPS,
      authorization: await authorization(),
      [OPERATOR_TENANT_HEADER]: 'conf.example',
    })
    expect(res.status).toBe(401)
    expect(env.DIRECTORY.fetch).not.toHaveBeenCalled()
    expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
    expect(envelopes).toEqual([])
  })

  it('resolves the operator tenant after a valid token', async () => {
    const { env } = opsEnv()
    await call(env, {
      origin: OPS,
      authorization: `Bearer ${await opsJwt()}`,
      [OPERATOR_TENANT_HEADER]: 'conf.example',
    })
    expect(env.DIRECTORY.fetch).toHaveBeenCalledTimes(1)
  })

  // #1948: only the exact serialized origin is an operator origin.
  it.each([
    'https://my.konf.app.evil.example',
    'https://MY.konf.app',
    'https://my.konf.app/',
    'https://my.konf.app:443',
    'http://my.konf.app',
    'https://my.konf.app.',
  ])('does not treat %s as an operator origin', async (origin) => {
    const { env, envelopes } = opsEnv()
    const res = await gateway.fetch(
      preflight(origin, `authorization, ${OPERATOR_TENANT_HEADER}`),
      env,
    )
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
    await call(env, {
      origin,
      authorization: `Bearer ${await opsJwt()}`,
      [OPERATOR_TENANT_HEADER]: 'conf.example',
    })
    expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
    expect(envelopes.every((e) => e === null)).toBe(true)
  })

  it.each(['', ',,', ' , '])(
    'never treats an empty Origin as an operator origin (OPERATOR_ORIGIN %j)',
    async (list) => {
      const { env, envelopes } = opsEnv()
      env.OPERATOR_ORIGIN = list
      // No session: the operator lane would refuse with 401; any other lane
      // answers this anonymous query.
      const res = await call(env, { origin: '' })
      expect(res.status).toBe(200)
      expect(envelopes).toEqual([null])
      expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
    },
  )

  it.each([
    'http://my.konf.app',
    'https://MY.konf.app',
    'https://my.konf.app:443',
    'https://my.konf.app/',
  ])(
    'refuses a session handed off to %s: the claim must equal the operator Origin exactly',
    async (claim) => {
      const { env, envelopes } = opsEnv()
      const token = await jwt({ claims: { [SESSION_ORIGIN_CLAIM]: claim } })
      // A named tenant, so a lookup ahead of the claim check would fetch.
      const res = await call(env, {
        origin: OPS,
        authorization: `Bearer ${token}`,
        [OPERATOR_TENANT_HEADER]: 'conf.example',
      })
      expect(res.status).toBe(401)
      expect(envelopes).toEqual([])
      // Guard before fetch: no directory read, no Membership call.
      expect(env.DIRECTORY.fetch).not.toHaveBeenCalled()
      expect(env.MEMBERSHIP.principal).not.toHaveBeenCalled()
    },
  )

  it('accepts any exact entry of a comma-separated OPERATOR_ORIGIN', async () => {
    const { env, envelopes } = opsEnv()
    env.OPERATOR_ORIGIN = `https://other.example, ${OPS}`
    await call(env, { origin: OPS, authorization: `Bearer ${await opsJwt()}` })
    expect(await verifyEnvelope(envelopes[0]!, envelopeKeys.publicPem)).toEqual(
      { typ: 'platform', userId: 'user_1', platformRole: 'operator' },
    )
  })
})
