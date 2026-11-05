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
    CONTENT: { fetch: async () => Response.json({}) },
    CONFERENCE: { fetch: async () => Response.json({}) },
    IDENTITY: { fetch: async () => Response.json(jwks) },
    API_LIMITER: ok,
    API_IP_LIMITER: ok,
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
            message: 'Unexpected error.',
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
    expect(data.provision).toHaveBeenCalledWith(ARGS)
  })
})
