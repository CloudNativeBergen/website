// RunKonf/kontroll#85: provisionConference through gateway.fetch into the
// real tenant-directory worker; only its data layer is faked, so these pin
// who reaches it, with which org, and what of a refusal the client sees.
// services/tenant-directory/src/worker.test.ts covers the data layer
// (copyFrom, idempotency, domains) against an in-memory D1 and a fake site.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
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
  provisionConference: vi.fn(),
}
vi.mock('../../services/tenant-directory/src/data', () => ({
  createData: () => data,
  scheduled: vi.fn(),
}))

const SITE = 'https://conf.example'
const OPS = 'https://my.konf.app'
const INPUT = {
  title: 'Nova 2027',
  startDate: '2027-05-01',
  endDate: '2027-05-02',
}
const mutation = (orgId?: string) => ({
  query: `mutation($input: ProvisionConferenceInput!, $orgId: ID) { provisionConference(input: $input, idempotencyKey: "k1", orgId: $orgId) { conferenceId } }`,
  variables: { input: INPUT, orgId },
})
const gateway = createGateway(compose())
// tenant-directory's own graphql-yoga copy, so its yoga treats the error as
// the data layer's real one rather than masking an unexpected error.
const { createGraphQLError } = await import(
  pathToFileURL(
    createRequire(
      new URL('../../services/tenant-directory/src/worker.ts', import.meta.url),
    ).resolve('graphql-yoga'),
  ).href
)
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
  data.provisionConference.mockResolvedValue({ conferenceId: 'conf_new' })
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

const call = (e: Env, headers: Record<string, string>, orgId?: string) =>
  gateway.fetch(
    new Request('http://api.test/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(mutation(orgId)),
    }),
    e,
  )

const tenant = async (role: string | null) =>
  [
    env(false, role),
    { origin: SITE, authorization: `Bearer ${await jwt(SITE)}` },
  ] as const
const operatorLane = async () =>
  [
    env(true, null),
    { origin: OPS, authorization: `Bearer ${await jwt(OPS)}` },
  ] as const
const FORBIDDEN = {
  data: { provisionConference: null },
  errors: [
    {
      message: 'Not allowed.',
      path: ['provisionConference'],
      extensions: { code: 'FORBIDDEN' },
    },
  ],
}

describe('provisionConference (kontroll#85)', () => {
  it.each(['owner', 'admin'])(
    "a tenant %s creates an edition in the envelope's org",
    async (role) => {
      const res = await call(...(await tenant(role)))
      expect(await res.json()).toEqual({
        data: { provisionConference: { conferenceId: 'conf_new' } },
      })
      expect(data.provisionConference).toHaveBeenCalledWith(
        'org_a',
        { ...INPUT, copyFrom: null },
        'k1',
        'user_1',
      )
    },
  )

  it.each<[string, () => Promise<readonly [Env, Record<string, string>]>]>([
    ['an anonymous caller', async () => [env(false, null), { origin: SITE }]],
    ['a member', () => tenant('member')],
    ['a conference organizer', () => tenant('organizer')],
    [
      'an operator with a tenant header',
      async () => [
        env(true, null),
        {
          origin: OPS,
          authorization: `Bearer ${await jwt(OPS)}`,
          [OPERATOR_TENANT_HEADER]: 'conf.example',
        },
      ],
    ],
  ])('refuses %s, never reaching the data layer', async (_, setup) => {
    const res = await call(...(await setup()))
    expect(await res.json()).toEqual(FORBIDDEN)
    expect(data.provisionConference).not.toHaveBeenCalled()
  })

  it('refuses orgId on the tenant lane, even from an owner', async () => {
    const res = await call(...(await tenant('owner')), 'org_b')
    expect(await res.json()).toEqual(FORBIDDEN)
    expect(data.provisionConference).not.toHaveBeenCalled()
  })

  it('an operator on the platform lane provisions the org it names', async () => {
    const res = await call(...(await operatorLane()), 'org_b')
    expect(await res.json()).toEqual({
      data: { provisionConference: { conferenceId: 'conf_new' } },
    })
    expect(data.provisionConference).toHaveBeenCalledWith(
      'org_b',
      { ...INPUT, copyFrom: null },
      'k1',
      'user_1',
    )
  })

  it('passes reason and field of a BAD_USER_INPUT through, and nothing else', async () => {
    data.provisionConference.mockRejectedValue(
      createGraphQLError('copyFrom is not an edition of this organization', {
        extensions: {
          code: 'BAD_USER_INPUT',
          reason: 'COPY_FROM_NOT_IN_ORG',
          field: 'copyFrom',
          orgId: 'org_secret',
          http: { status: 418 },
        },
      }),
    )
    const res = await call(...(await tenant('owner')))
    expect(((await res.json()) as { errors: unknown }).errors).toEqual([
      {
        message: 'copyFrom is not an edition of this organization',
        path: ['provisionConference'],
        extensions: {
          code: 'BAD_USER_INPUT',
          reason: 'COPY_FROM_NOT_IN_ORG',
          field: 'copyFrom',
        },
      },
    ])
  })

  it.each([
    ['an unknown reason on BAD_USER_INPUT', 'BAD_USER_INPUT', 'ORG_EXISTS'],
    ['a known reason on another code', 'FORBIDDEN', 'DOMAIN_TAKEN'],
  ])('drops %s', async (_, code, reason) => {
    data.provisionConference.mockRejectedValue(
      createGraphQLError('refused', { extensions: { code, reason } }),
    )
    const res = await call(...(await tenant('owner')))
    const [error] = (
      (await res.json()) as { errors: { extensions: unknown }[] }
    ).errors
    expect(error.extensions).toEqual({ code })
  })
})
