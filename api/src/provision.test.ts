// #1924: provisionOrganization is in the public schema (@tag(operator)) but
// only an operator with no tenant header reaches the data layer. Goes through
// gateway.fetch into the real tenant-directory worker; only its data layer is
// faked.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose'
import { generateEnvelopeKeyPair } from '@runkonf/tenancy'
import {
  createGateway,
  OPERATOR_TENANT_HEADER,
  SESSION_ORIGIN_CLAIM,
  type Env,
} from './gateway'
import { compose } from './supergraph'
import worker from '../../services/tenant-directory/src/worker'

vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const TENANT = { orgId: 'org_a', conferenceId: 'conf_a' }
const data = {
  resolveHost: vi.fn(),
  provision: vi.fn(),
}
vi.mock('../../services/tenant-directory/src/data', () => ({
  createData: () => data,
  scheduled: vi.fn(),
}))

const SITE = 'https://conf.example'
const OPS = 'https://my.konf.app'
const ARGS = {
  idempotencyKey: 'k1',
  orgId: 'org_new',
  orgSlug: 'new',
  conferenceId: 'conf_new',
}
const MUTATION = {
  query: `mutation { provisionOrganization(idempotencyKey: "k1", orgId: "org_new", orgSlug: "new", conferenceId: "conf_new") { id slug } }`,
}
const gateway = createGateway(compose())
let keys: { privatePem: string; publicPem: string }
let identityKey: CryptoKey
let jwks: unknown

beforeAll(async () => {
  keys = await generateEnvelopeKeyPair()
  const pair = await generateKeyPair('EdDSA', { extractable: true })
  identityKey = pair.privateKey
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] }
})

beforeEach(() => {
  data.resolveHost.mockImplementation(async (host: string) =>
    host === 'conf.example'
      ? {
          ...TENANT,
          flags: {
            apiRead: true,
            identityLogin: true,
            d1Write: true,
            d1Override: true,
          },
        }
      : null,
  )
  data.provision.mockResolvedValue({
    id: 'org_new',
    slug: 'new',
    name: 'New',
    status: 'active',
    plan: 'free',
  })
})

function env(platformOperator: boolean, orgRole: string | null) {
  const directory = {
    fetch: (url: string, init: RequestInit) =>
      worker.fetch(new Request(url, init), {
        GATEWAY_PUBLIC_KEY: keys.publicPem,
      } as never),
  }
  const ok = { limit: async () => ({ success: true }) }
  return {
    ENVELOPE_PRIVATE_KEY: keys.privatePem,
    IDENTITY_ISSUER: 'https://id.test',
    OPERATOR_ORIGIN: OPS,
    DIRECTORY: directory,
    CONTENT: {
      fetch: async () => Response.json({ data: { conference: { id: 'c' } } }),
    },
    CONFERENCE: {
      fetch: async () => Response.json({ data: { conference: { id: 'c' } } }),
    },
    IDENTITY: { fetch: async () => Response.json(jwks) },
    API_LIMITER: ok,
    API_IP_LIMITER: ok,
    API_SITE_LIMITER: ok,
    API_MUTATION_LIMITER: ok,
    CLIENT_IP_SECRET: 'ip-secret',
    SITE_PUBLIC_KEYS: '{}',
    MEMBERSHIP: {
      principal: vi.fn(async () => ({ orgRole, platformOperator })),
    },
  } as unknown as Env
}

const jwt = (origin: string) => {
  const iat = Math.floor(Date.now() / 1000)
  return new SignJWT({ [SESSION_ORIGIN_CLAIM]: origin })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setSubject('user_1')
    .setAudience('konf-gateway')
    .setIssuer('https://id.test')
    .setIssuedAt(iat)
    .setExpirationTime(iat + 300)
    .sign(identityKey)
}

const call = (e: Env, headers: Record<string, string>) =>
  gateway.fetch(
    new Request('http://api.test/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(MUTATION),
    }),
    e,
  )

describe('provisionOrganization (#1924)', () => {
  const refusals: [string, () => Promise<[Env, Record<string, string>]>][] = [
    ['an anonymous caller', async () => [env(false, null), { origin: SITE }]],
    ...(['owner', 'admin'] as const).map(
      (role) =>
        [
          `a tenant ${role}`,
          async () => [
            env(false, role),
            { origin: SITE, authorization: `Bearer ${await jwt(SITE)}` },
          ],
        ] as [string, () => Promise<[Env, Record<string, string>]>],
    ),
    [
      'an operator with a tenant header',
      async () => [
        env(true, 'owner'),
        {
          origin: OPS,
          authorization: `Bearer ${await jwt(OPS)}`,
          [OPERATOR_TENANT_HEADER]: 'conf.example',
        },
      ],
    ],
  ]

  // One test so the same-body check holds under vitest's shuffled order.
  it('refuses every non-platform caller with one generic body, never provisioning', async () => {
    const bodies: unknown[] = []
    for (const [, setup] of refusals) {
      const [e, headers] = await setup()
      bodies.push(await (await call(e, headers)).json())
    }
    expect(data.provision).not.toHaveBeenCalled()
    for (const body of bodies)
      expect(body).toEqual({
        data: { provisionOrganization: null },
        errors: [
          {
            message: 'Not allowed.',
            path: ['provisionOrganization'],
            extensions: { code: 'FORBIDDEN' },
          },
        ],
      })
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1)
  })

  it('lets an operator with no tenant header provision', async () => {
    const res = await call(env(true, null), {
      origin: OPS,
      authorization: `Bearer ${await jwt(OPS)}`,
    })
    expect(await res.json()).toEqual({
      data: { provisionOrganization: { id: 'org_new', slug: 'new' } },
    })
    expect(data.provision).toHaveBeenCalledWith({
      ...ARGS,
      createdBy: 'user_1',
    })
  })
})

// #1961: the schema keeps @tag(operator) fields, so introspection is for an
// operator holding a PlatformContext only.
describe('introspection (#1961)', () => {
  const ask = (e: Env, headers: Record<string, string>, query: string) =>
    gateway
      .fetch(
        new Request('http://api.test/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ query }),
        }),
        e,
      )
      .then((r) => r.json() as Promise<{ data?: unknown; errors?: unknown }>)
  const SCHEMA = '{ __schema { mutationType { fields { name } } } }'
  const TYPE = '{ __type(name: "Mutation") { fields { name args { name } } } }'

  it('refuses __schema and __type to anonymous, tenant and tenant-acting operator callers', async () => {
    const callers: [Env, Record<string, string>][] = [
      [env(false, null), { origin: SITE }],
      [
        env(false, 'owner'),
        { origin: SITE, authorization: `Bearer ${await jwt(SITE)}` },
      ],
      [
        env(true, 'owner'),
        {
          origin: OPS,
          authorization: `Bearer ${await jwt(OPS)}`,
          [OPERATOR_TENANT_HEADER]: 'conf.example',
        },
      ],
    ]
    // An operator asks first, so a per-document validation or parse cache
    // cannot carry their pass over to the callers below.
    const ops = { origin: OPS, authorization: `Bearer ${await jwt(OPS)}` }
    for (const query of [SCHEMA, TYPE])
      expect((await ask(env(true, null), ops, query)).errors).toBeUndefined()
    for (const [e, headers] of callers)
      for (const query of [SCHEMA, TYPE]) {
        const body = await ask(e, headers, query)
        expect(body.data).toBeUndefined()
        expect(JSON.stringify(body)).not.toContain('provisionOrganization')
        expect(JSON.stringify(body.errors)).toMatch(/introspection/i)
      }
  })

  it('answers the refusal 403 FORBIDDEN', async () => {
    const r = await gateway.fetch(
      new Request('http://api.test/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: SITE },
        body: JSON.stringify({ query: SCHEMA }),
      }),
      env(false, null),
    )
    expect(r.status).toBe(403)
    const body = (await r.json()) as {
      errors: { extensions?: { code?: string } }[]
    }
    expect(body.errors[0].extensions?.code).toBe('FORBIDDEN')
  })

  it('names no field or argument in suggestions to anonymous callers', async () => {
    for (const query of [
      'mutation { provisionOrganizatio }',
      // All required arguments given, so only the typo is reported; the
      // required-argument list itself is a known hole (#1961).
      `mutation { provisionOrganization(idempotencyKe: "k", ${Object.keys(ARGS)
        .map((k) => `${k}: "x"`)
        .join(', ')}) { id } }`,
    ]) {
      const body = await ask(env(false, null), { origin: SITE }, query)
      const text = (body.errors as { message: string }[])
        .map((e) => e.message)
        .join('\n')
      expect(text).toMatch(/Cannot query field|Unknown argument/)
      expect(text).not.toMatch(/Did you mean/)
      expect(text).not.toContain('"provisionOrganization"')
      expect(text).not.toContain('idempotencyKey')
    }
  })

  it('answers a near-miss name exactly like a nonsense one', async () => {
    const shape = async (query: string) => {
      const r = await gateway.fetch(
        new Request('http://api.test/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: SITE },
          body: JSON.stringify({ query }),
        }),
        env(false, null),
      )
      const body = (await r.json()) as {
        errors: { message: string; extensions?: unknown }[]
      }
      return {
        status: r.status,
        extensions: body.errors.map((e) => e.extensions),
        messages: body.errors.map((e) => e.message.replace(/"[^"]*"/, '"X"')),
      }
    }
    const args = Object.keys(ARGS)
      .map((k) => `${k}: "x"`)
      .join(', ')
    for (const [near, nonsense] of [
      ['mutation { provisionOrganisation }', 'mutation { zzzzzz }'],
      [
        `mutation { provisionOrganization(idempotencyKe: "k", ${args}) { id } }`,
        `mutation { provisionOrganization(zzzzzzzzzzzzz: "k", ${args}) { id } }`,
      ],
    ])
      expect(await shape(near)).toEqual(await shape(nonsense))
  })

  it('serves no GraphiQL to a browser', async () => {
    const r = await gateway.fetch(
      new Request('http://api.test/graphql', {
        headers: { accept: 'text/html', origin: SITE },
      }),
      env(false, null),
    )
    expect(await r.text()).not.toMatch(/graphiql/i)
  })

  it('shows provisionOrganization and its arguments to an operator with no tenant', async () => {
    const headers = { origin: OPS, authorization: `Bearer ${await jwt(OPS)}` }
    const schema = await ask(env(true, null), headers, SCHEMA)
    expect(JSON.stringify(schema.data)).toContain('provisionOrganization')
    const type = (await ask(env(true, null), headers, TYPE)) as {
      data: {
        __type: { fields: { name: string; args: { name: string }[] }[] }
      }
    }
    const field = type.data.__type.fields.find(
      (f) => f.name === 'provisionOrganization',
    )
    expect(field?.args.map((a) => a.name).sort()).toEqual(
      Object.keys(ARGS).sort(),
    )
  })

  it('still answers normal queries and __typename for everyone', async () => {
    const callers: [Env, Record<string, string>][] = [
      [env(false, null), { origin: SITE }],
      [
        env(false, 'owner'),
        { origin: SITE, authorization: `Bearer ${await jwt(SITE)}` },
      ],
      [
        env(true, null),
        { origin: OPS, authorization: `Bearer ${await jwt(OPS)}` },
      ],
    ]
    for (const [e, headers] of callers) {
      const body = await ask(
        e,
        headers,
        '{ __typename health rolloutFlags { apiRead } conference { id } }',
      )
      expect(body.errors).toBeUndefined()
      expect(body.data).toMatchObject({
        __typename: 'Query',
        health: 'ok',
        conference: { id: 'c' },
      })
    }
  })
})
