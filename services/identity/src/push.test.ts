// Web push (kontroll#61): subscription mutations through the subgraph against
// a real D1 (Miniflare), and the identity push events with their payloads.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSignature } from 'better-auth/crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import {
  ENVELOPE_HEADER,
  createSigner,
  generateEnvelopeKeyPair,
  type Envelope,
} from '@runkonf/tenancy'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createAuth, createData, type DataEnv } from './data'
import graph from './worker'

// vitest.config.ts stubs `jose`; load the real one so envelopes verify.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})
const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)

const cf = vi.hoisted(() => ({
  env: {
    PUSH_WEBHOOK_URL: 'https://kontroll.test/api/push/events',
    PUSH_WEBHOOK_SECRET: 's',
  },
  pending: [] as Promise<unknown>[],
}))
vi.mock('cloudflare:workers', () => ({
  env: cf.env,
  waitUntil: (p: Promise<unknown>) => cf.pending.push(p),
}))

let mf: Miniflare
let d1: D1Database
let env: DataEnv

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-08-01',
      d1Databases: ['DB'],
    }),
  )
  d1 = (await mf.getD1Database('DB')) as unknown as D1Database
  const dir = join(import.meta.dirname, '../migrations')
  const sql = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join(';\n')
  for (const s of sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim()))
    if (s) await d1.prepare(s).run()
  env = {
    DB: d1,
    DIRECTORY: {} as Fetcher,
    BETTER_AUTH_URL: 'http://identity.test',
    IDENTITY_ISSUER: 'https://id.test',
    BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
    GITHUB_CLIENT_ID: 'gh',
    GITHUB_CLIENT_SECRET: 'gh',
    LINKEDIN_CLIENT_ID: 'li',
    LINKEDIN_CLIENT_SECRET: 'li',
  } as DataEnv
})
afterAll(() => mf?.dispose())

let sent: Record<string, unknown>[]
beforeEach(() => {
  sent = []
  cf.pending.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)))
      return new Response(null, { status: 204 })
    }),
  )
  return () => vi.unstubAllGlobals()
})
const flushed = async () => {
  // emit() loads cloudflare:workers lazily: let that import settle first.
  await new Promise((r) => setTimeout(r))
  await Promise.all(cf.pending)
  return sent
}

let n = 0
async function newUser() {
  const ctx = await (await auth()).$context
  const u = await ctx.internalAdapter.createUser(
    { email: `push-${++n}@example.com`, name: 'T', emailVerified: true },
    { method: 'admin' },
  )
  return u.id
}
const auth = async () => createAuth(d1, env)
async function headers(userId: string) {
  const ctx = await (await auth()).$context
  const { token } = await ctx.internalAdapter.createSession(userId, false)
  const signed = `${token}.${await makeSignature(token, ctx.secret)}`
  return new Headers({
    cookie: `${ctx.authCookies.sessionToken.name}=${signed}`,
  })
}

const tenant = (userId: string | null): Envelope => ({
  typ: 'tenant',
  orgId: 'org-x',
  conferenceId: null,
  userId,
  orgRole: null,
  scopes: [],
})
const platform = (userId: string): Envelope => ({
  typ: 'platform',
  userId,
  platformRole: 'operator',
})

async function gql(
  envelope: Envelope | null,
  query: string,
  variables?: Record<string, unknown>,
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (envelope) headers[ENVELOPE_HEADER] = await signer.sign(envelope)
  const res = await graph.fetch(
    new Request('http://identity/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    }),
    { ...env, GATEWAY_PUBLIC_KEY: keys.publicPem },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary GraphQL JSON
  return (await res.json()) as any
}

const SUB =
  'mutation($input: PushSubscriptionInput!) { subscribePush(input: $input) }'
const UNSUB = 'mutation($e: String!) { unsubscribePush(endpoint: $e) }'
const PRUNE =
  'mutation($e: [String!]!) { prunePushSubscriptions(endpoints: $e) }'
const P256DH = 'B'.repeat(87)
const AUTH = 'A'.repeat(22)
let e = 0
const endpoint = () => `https://push.example/send/${++e}`
const input = (ep: string, p256dh = P256DH, a = AUTH) => ({
  input: { endpoint: ep, keys: { p256dh, auth: a } },
})
const rows = async (ep: string) =>
  (
    await d1
      .prepare(
        'SELECT id, user_id, p256dh FROM push_subscription WHERE endpoint = ?',
      )
      .bind(ep)
      .all<{ id: string; user_id: string; p256dh: string }>()
  ).results

describe('subscribePush / unsubscribePush', () => {
  it('stores the session user, never anyone else; anonymous is refused', async () => {
    const a = await newUser()
    const ep = endpoint()
    expect((await gql(tenant(a), SUB, input(ep))).errors).toBeUndefined()
    expect((await rows(ep)).map((r) => r.user_id)).toEqual([a])
    for (const env of [null, tenant(null)]) {
      const r = await gql(env, SUB, input(endpoint()))
      expect(r.errors[0].extensions.code).toBe('FORBIDDEN')
    }
    // There is no userId argument to name another user.
    const r = await gql(
      tenant(a),
      'mutation { subscribePush(userId: "x", input: {endpoint: "https://p.example/1", keys: {p256dh: "B", auth: "A"}}) }',
    )
    expect(r.errors[0].message).toMatch(/Unknown argument "userId"/)
  })

  it("takeover: another user's endpoint is deleted and re-inserted for the caller", async () => {
    const [a, b] = [await newUser(), await newUser()]
    const ep = endpoint()
    await gql(tenant(a), SUB, input(ep))
    const [before] = await rows(ep)
    await gql(platform(b), SUB, input(ep, 'C'.repeat(87)))
    const after = await rows(ep)
    expect(after).toEqual([
      { id: expect.any(String), user_id: b, p256dh: 'C'.repeat(87) },
    ])
    expect(after[0].id).not.toBe(before.id)
    // A cannot remove B's row by naming the endpoint.
    expect((await gql(tenant(a), UNSUB, { e: ep })).data.unsubscribePush).toBe(
      false,
    )
    expect(await rows(ep)).toHaveLength(1)
    expect((await gql(tenant(b), UNSUB, { e: ep })).data.unsubscribePush).toBe(
      true,
    )
    expect(await rows(ep)).toEqual([])
  })

  it.each([
    ['http endpoint', 'http://push.example/x', P256DH, AUTH],
    ['not a URL', 'push.example/x', P256DH, AUTH],
    ['userinfo', 'https://u:p@push.example/x', P256DH, AUTH],
    ['long endpoint', `https://push.example/${'x'.repeat(2048)}`, P256DH, AUTH],
    ['p256dh not base64url', 'https://push.example/v1', 'a+b/', AUTH],
    ['p256dh too long', 'https://push.example/v2', 'B'.repeat(129), AUTH],
    ['auth empty', 'https://push.example/v3', P256DH, ''],
    ['auth too long', 'https://push.example/v4', P256DH, 'A'.repeat(65)],
  ])('refuses %s and stores nothing', async (_, ep, p256dh, a) => {
    const r = await gql(tenant(await newUser()), SUB, input(ep, p256dh, a))
    expect(r.errors[0].extensions.code).toBe('BAD_USER_INPUT')
    expect(await rows(ep)).toEqual([])
  })
})

describe('prunePushSubscriptions', () => {
  it('needs a PlatformContext; a tenant envelope deletes nothing', async () => {
    const a = await newUser()
    const ep = endpoint()
    await gql(tenant(a), SUB, input(ep))
    const r = await gql(tenant(a), PRUNE, { e: [ep] })
    expect(r.errors[0].extensions.code).toBe('FORBIDDEN')
    expect(await rows(ep)).toHaveLength(1)
    const ok = await gql(platform('op'), PRUNE, { e: [ep, endpoint()] })
    expect(ok.data.prunePushSubscriptions).toBe(1)
    expect(await rows(ep)).toEqual([])
  })

  it('caps a call at 100 endpoints', async () => {
    const r = await gql(platform('op'), PRUNE, {
      e: Array.from({ length: 101 }, endpoint),
    })
    expect(r.errors[0].extensions.code).toBe('BAD_USER_INPUT')
  })
})

describe('identity push events', () => {
  async function org() {
    const orgId = `org-${++n}`
    await d1
      .prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)')
      .bind(orgId, orgId, orgId)
      .run()
    const owner = await newUser()
    await d1
      .prepare(
        "INSERT INTO member (id, organizationId, userId, role) VALUES (?, ?, ?, 'owner')",
      )
      .bind(`${orgId}-m0`, orgId, owner)
      .run()
    return { orgId, owner }
  }

  it('member path: invited, accepted, role_changed carry ids and the actor only', async () => {
    const { orgId, owner } = await org()
    const a = await auth()
    const ctx = await a.$context
    const invitee = await ctx.internalAdapter.createUser(
      { email: `inv-${orgId}@example.com`, name: 'T', emailVerified: true },
      { method: 'admin' },
    )
    const inv = await a.api.createInvitation({
      headers: await headers(owner),
      body: { organizationId: orgId, email: invitee.email, role: 'member' },
    })
    await a.api.acceptInvitation({
      headers: await headers(invitee.id),
      body: { invitationId: inv.id },
    })
    await (
      await createData(env).members().asMember(owner, orgId)
    ).changeRole(invitee.id, 'admin')
    expect(await flushed()).toEqual([
      {
        type: 'member.invited',
        organizationId: orgId,
        invitationId: inv.id,
        actorId: owner,
      },
      {
        type: 'invite.accepted',
        organizationId: orgId,
        invitationId: inv.id,
        userId: invitee.id,
      },
      {
        type: 'member.role_changed',
        organizationId: orgId,
        userId: invitee.id,
        actorId: owner,
      },
    ])
  })

  it('operator path: invited and role_changed', async () => {
    const { orgId } = await org()
    const opId = await newUser()
    const op = await createData(env).members().asOperator(opId, orgId)
    const inv = await op.invite(`op-${orgId}@example.com`, 'admin')
    const other = await newUser()
    await d1
      .prepare(
        "INSERT INTO member (id, organizationId, userId, role) VALUES (?, ?, ?, 'member')",
      )
      .bind(`${orgId}-m1`, orgId, other)
      .run()
    await op.changeRole(other, 'admin')
    expect(await flushed()).toEqual([
      {
        type: 'member.invited',
        organizationId: orgId,
        invitationId: inv.id,
        actorId: opId,
      },
      {
        type: 'member.role_changed',
        organizationId: orgId,
        userId: other,
        actorId: opId,
      },
    ])
  })

  it('a failed send never fails the mutation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }),
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { orgId } = await org()
    const op = await createData(env)
      .members()
      .asOperator(await newUser(), orgId)
    const inv = await op.invite(`fail-${orgId}@example.com`, 'admin')
    await flushed()
    expect(inv.status).toBe('pending')
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('push.webhook_failed'),
    )
    err.mockRestore()
  })
})
