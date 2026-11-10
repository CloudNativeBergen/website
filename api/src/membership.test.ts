// #1923 PR 3: membership mutations through gateway.fetch into the real
// identity subgraph on a real D1 (Miniflare, shipped migrations). Tenants are
// `<orgId>.example`; the gateway's orgRole is identity's live lookup.
import { readFileSync, readdirSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { generateEnvelopeKeyPair } from '@runkonf/tenancy'
import {
  createGateway,
  OPERATOR_TENANT_HEADER,
  SESSION_ORIGIN_CLAIM,
  type Env,
} from './gateway'
import { compose } from './supergraph'
import graph from '../../services/identity/src/worker'
import { createData } from '../../services/identity/src/data'

vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const OPS = 'https://my.konf.app'
const gateway = createGateway(compose())
let mf: Miniflare
let d1: D1Database
let env: Env
let identityKey: CryptoKey
/** D1 statements the identity subgraph prepared (not the gateway's lookup). */
let graphQueries = 0

const all = async <T>(q: string, ...v: unknown[]) =>
  (
    await d1
      .prepare(q)
      .bind(...v)
      .all<T>()
  ).results

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
  const dir = new URL('../../services/identity/migrations/', import.meta.url)
  for (const f of readdirSync(dir).sort())
    for (const s of readFileSync(new URL(f, dir), 'utf8')
      .split(/;\s*\n/)
      .map((s) => s.replace(/^--.*$/gm, '').trim()))
      if (s) await d1.prepare(s).run()

  const keys = await generateEnvelopeKeyPair()
  const pair = await generateKeyPair('EdDSA', { extractable: true })
  identityKey = pair.privateKey
  const jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] }
  const identityEnv = {
    BETTER_AUTH_URL: 'http://identity.test',
    IDENTITY_ISSUER: 'https://id.test',
    BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
    GITHUB_CLIENT_ID: 'gh',
    GITHUB_CLIENT_SECRET: 'gh',
    LINKEDIN_CLIENT_ID: 'li',
    LINKEDIN_CLIENT_SECRET: 'li',
    GATEWAY_PUBLIC_KEY: keys.publicPem,
    DB: d1,
  }
  const counted = new Proxy(d1, {
    get: (t, k) =>
      k === 'prepare'
        ? (q: string) => (graphQueries++, t.prepare(q))
        : Reflect.get(t, k).bind(t),
  })
  const ok = { limit: async () => ({ success: true }) }
  env = {
    ENVELOPE_PRIVATE_KEY: keys.privatePem,
    IDENTITY_ISSUER: 'https://id.test',
    OPERATOR_ORIGIN: OPS,
    DIRECTORY: {
      fetch: async (_: string, init: RequestInit) => {
        const { host } = JSON.parse(String(init.body)).variables
        const orgId = String(host).replace(/\.example$/, '')
        const [org] = await all(
          'SELECT id FROM organization WHERE id = ?',
          orgId,
        )
        return Response.json({
          data: {
            tenantByHost: org
              ? { orgId, conferenceId: null, flags: null }
              : null,
          },
        })
      },
    },
    IDENTITY: { fetch: async () => Response.json(jwks) },
    IDENTITY_GRAPH: {
      fetch: (url: string, init: RequestInit) =>
        graph.fetch(new Request(url, init), {
          ...identityEnv,
          DB: counted,
        } as never),
    },
    CONTENT: { fetch: async () => Response.json({}) },
    CONFERENCE: { fetch: async () => Response.json({}) },
    API_LIMITER: ok,
    API_IP_LIMITER: ok,
    API_SITE_LIMITER: ok,
    API_MUTATION_LIMITER: ok,
    CLIENT_IP_SECRET: 'ip-secret',
    SITE_PUBLIC_KEYS: '{}',
    MEMBERSHIP: createData(identityEnv as never),
  } as unknown as Env
})
afterAll(() => mf?.dispose())

let n = 0
/** A fresh org with one user per role; returns the org id and user ids. */
async function org(...roles: string[]) {
  const orgId = `org${++n}`
  await d1
    .prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)')
    .bind(orgId, orgId, orgId)
    .run()
  const users: string[] = []
  for (const [i, role] of roles.entries()) {
    const userId = await newUser(`${orgId}-u${i}`)
    await d1
      .prepare(
        'INSERT INTO member (id, organizationId, userId, role) VALUES (?, ?, ?, ?)',
      )
      .bind(`${orgId}-m${i}`, orgId, userId, role)
      .run()
    users.push(userId)
  }
  return { orgId, users }
}

async function newUser(id: string, operator = false) {
  await d1
    .prepare(
      'INSERT INTO user (id, name, email, emailVerified, platformOperator) VALUES (?, ?, ?, 1, ?)',
    )
    .bind(id, 'T', `${id}@example.com`, operator ? 1 : 0)
    .run()
  return id
}

async function jwt(userId: string, origin: string) {
  const iat = Math.floor(Date.now() / 1000)
  return new SignJWT({ [SESSION_ORIGIN_CLAIM]: origin })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setSubject(userId)
    .setAudience('konf-gateway')
    .setIssuer('https://id.test')
    .setIssuedAt(iat)
    .setExpirationTime(iat + 300)
    .sign(identityKey)
}

type Body = {
  data?: Record<string, unknown> | null
  errors?: { message: string; extensions?: { code?: string } }[]
}

/** One mutation as `userId` on the org's own host. */
async function as(userId: string, orgId: string, mutation: string) {
  const origin = `https://${orgId}.example`
  return call(mutation, {
    origin,
    authorization: `Bearer ${await jwt(userId, origin)}`,
  })
}

/** One mutation as `userId` in the operator lane, no tenant header. */
async function asOps(userId: string, mutation: string, tenant?: string) {
  return call(mutation, {
    origin: OPS,
    authorization: `Bearer ${await jwt(userId, OPS)}`,
    ...(tenant ? { [OPERATOR_TENANT_HEADER]: tenant } : {}),
  })
}

async function call(mutation: string, headers: Record<string, string>) {
  const res = await gateway.fetch(
    new Request('http://api.test/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query: `mutation { ${mutation} }` }),
    }),
    env,
  )
  return (await res.json()) as Body
}

const code = (b: Body) => b.errors?.[0]?.extensions?.code
const roleOf = async (orgId: string, userId: string) =>
  (
    await all<{ role: string }>(
      'SELECT role FROM member WHERE organizationId = ? AND userId = ?',
      orgId,
      userId,
    )
  )[0]?.role
const invite = (email: string, role: string) =>
  `inviteMember(email: "${email}", role: ${role}) { id role status }`
const invitationId = async (orgId: string, email: string) =>
  (
    await all<{ id: string }>(
      "SELECT id FROM invitation WHERE organizationId = ? AND email = ? AND status = 'pending'",
      orgId,
      email,
    )
  )[0]?.id

describe('tenant path: role rules', () => {
  it('lets an owner invite, cancel, change roles and remove, owners included', async () => {
    const { orgId, users } = await org('owner', 'owner', 'member')
    const [owner, owner2, mem] = users
    const inv = await as(owner, orgId, invite('new@example.com', 'owner'))
    expect(inv).toEqual({
      data: {
        inviteMember: {
          id: expect.any(String),
          role: 'owner',
          status: 'pending',
        },
      },
    })
    const id = await invitationId(orgId, 'new@example.com')
    expect(
      await as(owner, orgId, `cancelInvitation(invitationId: "${id}")`),
    ).toEqual({ data: { cancelInvitation: true } })
    expect(
      await as(owner, orgId, `changeMemberRole(userId: "${mem}", role: admin)`),
    ).toEqual({ data: { changeMemberRole: true } })
    expect(await roleOf(orgId, mem)).toBe('admin')
    expect(await as(owner, orgId, `removeMember(userId: "${owner2}")`)).toEqual(
      { data: { removeMember: true } },
    )
    expect(await roleOf(orgId, owner2)).toBeUndefined()
    // Audit rows carry the actor and ids, never the address.
    const rows = await all<{ action: string; detail: string }>(
      'SELECT action, detail FROM audit_event WHERE detail LIKE ? ORDER BY id',
      `%"orgId":"${orgId}"%`,
    )
    expect(rows.map((r) => r.action)).toEqual([
      'invite.create',
      'invite.cancel',
      'member.role',
      'member.remove',
    ])
    for (const r of rows) {
      expect(JSON.parse(r.detail).actorId).toBe(owner)
      expect(r.detail).not.toContain('@')
    }
  })

  it('lets an admin manage members and admins', async () => {
    const { orgId, users } = await org('owner', 'admin', 'member', 'admin')
    const [, admin, mem, admin2] = users
    expect(code(await as(admin, orgId, invite('a@example.com', 'admin')))).toBe(
      undefined,
    )
    expect(
      await as(admin, orgId, `changeMemberRole(userId: "${mem}", role: admin)`),
    ).toEqual({ data: { changeMemberRole: true } })
    expect(await as(admin, orgId, `removeMember(userId: "${admin2}")`)).toEqual(
      { data: { removeMember: true } },
    )
  })

  it('refuses a plain member every mutation, changing nothing', async () => {
    const { orgId, users } = await org('owner', 'member', 'member')
    const [owner, mem, other] = users
    for (const m of [
      invite('x@example.com', 'member'),
      `removeMember(userId: "${other}")`,
      `changeMemberRole(userId: "${other}", role: admin)`,
      `changeMemberRole(userId: "${mem}", role: owner)`,
    ])
      expect(code(await as(mem, orgId, m))).toBe('FORBIDDEN')
    expect(await roleOf(orgId, other)).toBe('member')
    expect(await roleOf(orgId, owner)).toBe('owner')
    expect(await invitationId(orgId, 'x@example.com')).toBeUndefined()
  })

  it('refuses an admin anything that touches an owner', async () => {
    const { orgId, users } = await org('owner', 'owner', 'admin', 'member')
    const [owner, owner2, admin, mem] = users
    await as(owner, orgId, invite('o@example.com', 'owner'))
    const ownerInvite = await invitationId(orgId, 'o@example.com')
    for (const m of [
      invite('p@example.com', 'owner'),
      `removeMember(userId: "${owner2}")`,
      `changeMemberRole(userId: "${owner2}", role: member)`,
      `changeMemberRole(userId: "${mem}", role: owner)`,
      `cancelInvitation(invitationId: "${ownerInvite}")`,
    ])
      expect((await as(admin, orgId, m)).errors).toEqual([
        {
          message: 'Not allowed.',
          path: [expect.any(String)],
          extensions: { code: 'FORBIDDEN' },
        },
      ])
    expect(await roleOf(orgId, owner2)).toBe('owner')
    expect(await roleOf(orgId, mem)).toBe('member')
    expect(await invitationId(orgId, 'o@example.com')).toBe(ownerInvite)
    expect(await invitationId(orgId, 'p@example.com')).toBeUndefined()
  })

  it('refuses removing or demoting the last owner as a clean BAD_USER_INPUT', async () => {
    const { orgId, users } = await org('owner', 'admin')
    const [owner] = users
    const ops = await newUser(`ops${n}`, true)
    for (const body of [
      await as(
        owner,
        orgId,
        `changeMemberRole(userId: "${owner}", role: admin)`,
      ),
      await as(owner, orgId, `removeMember(userId: "${owner}")`),
      // The operator path has only the trigger as its backstop.
      await asOps(
        ops,
        `operatorRemoveMember(orgId: "${orgId}", userId: "${owner}")`,
      ),
      await asOps(
        ops,
        `operatorChangeMemberRole(orgId: "${orgId}", userId: "${owner}", role: member)`,
      ),
    ]) {
      expect(code(body)).toBe('BAD_USER_INPUT')
      expect(body.errors![0].message).not.toMatch(/SQL|D1_|LAST_OWNER|trigger/i)
    }
    expect(await roleOf(orgId, owner)).toBe('owner')
  })

  it("closes the gap: a removed member's next write is refused", async () => {
    const { orgId, users } = await org('owner', 'admin', 'member')
    const [owner, admin, mem] = users
    expect(
      code(await as(owner, orgId, `removeMember(userId: "${admin}")`)),
    ).toBe(undefined)
    expect(code(await as(admin, orgId, `removeMember(userId: "${mem}")`))).toBe(
      'FORBIDDEN',
    )
    expect(await roleOf(orgId, mem)).toBe('member')
  })
})

describe('tenant path: the org is the envelope', () => {
  it('gives a foreign target the same refusal as an unknown one, changing nothing', async () => {
    const a = await org('owner')
    const b = await org('owner', 'member')
    const [bOwner, bMember] = b.users
    await as(bOwner, b.orgId, invite('b@example.com', 'member'))
    const bInvite = await invitationId(b.orgId, 'b@example.com')
    const [owner] = a.users
    const pairs = [
      ['removeMember(userId: "%")', bMember, 'nobody'],
      ['changeMemberRole(userId: "%", role: member)', bOwner, 'nobody'],
      ['cancelInvitation(invitationId: "%")', bInvite, 'nobody'],
    ]
    for (const [m, foreign, unknown] of pairs) {
      const f = await as(owner, a.orgId, m.replace('%', foreign!))
      const u = await as(owner, a.orgId, m.replace('%', unknown!))
      expect(code(f)).toBe('NOT_FOUND')
      expect(f).toEqual(u)
    }
    expect(await roleOf(b.orgId, bMember)).toBe('member')
    expect(await roleOf(b.orgId, bOwner)).toBe('owner')
    expect(await invitationId(b.orgId, 'b@example.com')).toBe(bInvite)
  })
})

describe('operator path', () => {
  it('works without membership and audits every write with operator: true', async () => {
    const { orgId, users } = await org('owner', 'member')
    const [owner, mem] = users
    const ops = await newUser(`ops${n}`, true)
    const inv = await asOps(
      ops,
      `operatorInviteMember(orgId: "${orgId}", email: "First@Example.com", role: owner) { id role status }`,
    )
    expect(inv.errors).toBeUndefined()
    const id = await invitationId(orgId, 'first@example.com')
    for (const m of [
      `operatorCancelInvitation(orgId: "${orgId}", invitationId: "${id}")`,
      `operatorChangeMemberRole(orgId: "${orgId}", userId: "${mem}", role: owner)`,
      `operatorRemoveMember(orgId: "${orgId}", userId: "${owner}")`,
    ])
      expect((await asOps(ops, m)).errors).toBeUndefined()
    expect(await roleOf(orgId, mem)).toBe('owner')
    expect(await roleOf(orgId, owner)).toBeUndefined()
    expect(await roleOf(orgId, ops)).toBeUndefined()
    const rows = await all<{ action: string; userId: string; detail: string }>(
      'SELECT action, userId, detail FROM audit_event WHERE detail LIKE ? ORDER BY id',
      `%"actorId":"${ops}"%`,
    )
    expect(rows.map((r) => [r.action, r.userId])).toEqual([
      ['invite.create', ops],
      ['invite.cancel', ops],
      ['member.role', mem],
      ['member.remove', owner],
    ])
    for (const r of rows) {
      expect(JSON.parse(r.detail)).toMatchObject({
        actorId: ops,
        operator: true,
        orgId,
      })
      expect(r.detail).not.toContain('@')
    }
  })

  it('refuses an invalid email and an existing member as clean BAD_USER_INPUT, writing nothing', async () => {
    const { orgId, users } = await org('owner')
    const ops = await newUser(`ops${n}`, true)
    for (const [email, msg] of [
      ['not-an-email', 'Invalid email address'],
      [
        `  ${users[0].toUpperCase()}@Example.com `,
        'This address already belongs to a member',
      ],
    ]) {
      const r = await asOps(
        ops,
        `operatorInviteMember(orgId: "${orgId}", email: "${email}", role: member) { id }`,
      )
      expect(code(r)).toBe('BAD_USER_INPUT')
      expect(r.errors?.[0]?.message).toBe(msg)
    }
    expect(
      await all('SELECT id FROM invitation WHERE organizationId = ?', orgId),
    ).toEqual([])
  })

  it('refuses every non-platform caller FORBIDDEN before identity reads anything', async () => {
    const { orgId, users } = await org('owner', 'member')
    const [owner, mem] = users
    const ops = await newUser(`ops${n}`, true)
    const host = `${orgId}.example`
    const ms = [
      `operatorInviteMember(orgId: "${orgId}", email: "z@example.com", role: owner) { id }`,
      `operatorCancelInvitation(orgId: "${orgId}", invitationId: "x")`,
      `operatorChangeMemberRole(orgId: "${orgId}", userId: "${mem}", role: owner)`,
      `operatorRemoveMember(orgId: "${orgId}", userId: "${owner}")`,
    ]
    for (const m of ms)
      for (const send of [
        () => as(owner, orgId, m),
        () => asOps(owner, m, host), // a member in Kontroll
        () => asOps(ops, m, host), // an operator acting for a tenant
      ]) {
        graphQueries = 0
        expect(code(await send())).toBe('FORBIDDEN')
        expect(graphQueries).toBe(0)
      }
    expect(await roleOf(orgId, owner)).toBe('owner')
    expect(await roleOf(orgId, mem)).toBe('member')
  })
})
