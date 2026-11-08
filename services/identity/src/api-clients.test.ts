// The API credentials contract (#2115): schema shape, and authz before
// NOT_IMPLEMENTED on every operation. `data` is a Proxy that throws, so any
// lookup would fail the test: nothing is read before the refusal.
import type { Envelope } from '@runkonf/tenancy'
import { createYoga } from 'graphql-yoga'
import { describe, expect, it } from 'vitest'
import { schema } from './subgraph'

// Never import 'graphql' here: the test would get a second copy. Walk the
// schema through its own objects and execute through yoga.
type T = { name?: string; ofType?: T; getFields?: () => Record<string, F> }
type F = { name: string; type: T }
const named = (t: T): T => (t.ofType ? named(t.ofType) : t)
const data = new Proxy(
  {},
  {
    get() {
      throw new Error('data touched before the refusal')
    },
  },
)
const ctx = { envelope: null as Envelope | null, data }
const yoga = createYoga({ schema, context: () => ctx, logging: false })

const tenant = (orgRole: string | null, scopes: string[] = []): Envelope => ({
  typ: 'tenant',
  orgId: 'org-x',
  conferenceId: null,
  userId: 'u-1',
  orgRole,
  scopes,
})
const ENVELOPES: Record<string, Envelope | null> = {
  none: null,
  user: { typ: 'user', userId: 'u-1' } as Envelope,
  platform: { typ: 'platform', userId: 'u-op' } as Envelope,
  site: { ...tenant(null, ['site:server']), userId: null } as Envelope,
  member: tenant('member'),
  admin: tenant('admin'),
  owner: tenant('owner'),
  operator: tenant(null, ['platform:operator']),
}

const S = 'scopes'
const OPS: Record<string, { doc: string; allowed: string[] }> = {
  apiClients: {
    doc: `{ apiClients { id ${S} } }`,
    allowed: ['admin', 'owner', 'operator'],
  },
  myPersonalAccessTokens: {
    doc: `{ myPersonalAccessTokens { id } }`,
    allowed: ['member', 'admin', 'owner'],
  },
  createApiClient: {
    doc: `mutation { createApiClient(input: { name: "x", scopes: [CONFERENCE_READ] }) { clientSecret } }`,
    allowed: ['owner'],
  },
  rotateApiClientSecret: {
    doc: `mutation { rotateApiClientSecret(id: "c") { clientSecret } }`,
    allowed: ['owner'],
  },
  revokeApiClient: {
    doc: `mutation { revokeApiClient(id: "c") }`,
    allowed: ['owner', 'operator'],
  },
  createPersonalAccessToken: {
    doc: `mutation { createPersonalAccessToken(input: { name: "x", scopes: [PII_READ], expiresAt: "2027-01-01" }) { secret } }`,
    allowed: ['member', 'admin', 'owner'],
  },
  revokePersonalAccessToken: {
    doc: `mutation { revokePersonalAccessToken(id: "p") }`,
    allowed: ['member', 'admin', 'owner'],
  },
}

const cases = Object.entries(OPS).flatMap(([op, { doc, allowed }]) =>
  Object.keys(ENVELOPES).map(
    (who) =>
      [
        op,
        who,
        doc,
        allowed.includes(who) ? 'NOT_IMPLEMENTED' : 'FORBIDDEN',
      ] as const,
  ),
)

describe('API credential resolvers', () => {
  it.each(cases)('%s as %s -> %s', async (_, who, doc, code) => {
    ctx.envelope = ENVELOPES[who]
    const res = await yoga.fetch('http://x/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: doc }),
    })
    const r = (await res.json()) as {
      data?: unknown
      errors?: { extensions: { code: string } }[]
    }
    expect(r.errors?.map((e) => e.extensions.code)).toEqual([code])
    expect(Object.values(r.data ?? {}).filter((v) => v !== null)).toEqual([])
  })
})

/** Every field name reachable from a type (cycle-safe). */
function fieldsOf(name: string, seen = new Set<string>()) {
  const out: string[] = []
  const t = schema.getType(name) as T | undefined
  if (!t?.getFields || seen.has(name)) return out
  seen.add(name)
  for (const f of Object.values(t.getFields())) {
    out.push(`${name}.${f.name}`)
    out.push(...fieldsOf(named(f.type).name!, seen))
  }
  return out
}

describe('API credential schema shape', () => {
  const secretish = /secret|hash|token$/i
  it.each(['ApiClient', 'PersonalAccessToken'])(
    '%s carries no secret',
    (type) => {
      const leaks = fieldsOf(type).filter((f) =>
        secretish.test(f.split('.')[1]),
      )
      expect(leaks).toEqual([])
    },
  )

  it('the secret is only on the create and rotate payloads', () => {
    const q = schema.getQueryType()!.getFields() as unknown as Record<string, F>
    const m = schema.getMutationType()!.getFields() as unknown as Record<
      string,
      F
    >
    const payloadOf = (f: F) => named(f.type).name!
    expect(payloadOf(q.apiClients)).toBe('ApiClient')
    expect(payloadOf(q.myPersonalAccessTokens)).toBe('PersonalAccessToken')
    expect(payloadOf(m.createApiClient)).toBe('ApiClientSecretPayload')
    expect(payloadOf(m.rotateApiClientSecret)).toBe('ApiClientSecretPayload')
    expect(payloadOf(m.createPersonalAccessToken)).toBe(
      'PersonalAccessTokenPayload',
    )
    const withSecret = Object.entries({ ...q, ...m })
      .filter(([, f]) =>
        fieldsOf(payloadOf(f)).some((x) => /\.(clientSecret|secret)$/.test(x)),
      )
      .map(([n]) => n)
      .sort()
    expect(withSecret).toEqual([
      'createApiClient',
      'createPersonalAccessToken',
      'rotateApiClientSecret',
    ])
  })

  it('ApiScope has no platform scope and maps to resource:read|write', () => {
    const values = schema.getType('ApiScope')!.toConfig() as {
      values: Record<string, { description?: string | null }>
    }
    const wire = Object.values(values.values).map((v) => v.description)
    expect(wire.every((w) => /^[a-z]+:(read|write)$/.test(w ?? ''))).toBe(true)
    expect(wire.some((w) => w?.startsWith('platform'))).toBe(false)
  })
})
