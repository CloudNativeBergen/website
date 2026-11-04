// The organization write gate (#1923 removes it), exercised through the
// worker's fetch handler against a real D1 (Miniflare).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSignature } from 'better-auth/crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuth, createData, type AuthEnv, type DataEnv } from './data'

vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }))
const { default: worker } = await import('./index')

const BASE = 'http://identity.test'
const authEnv: AuthEnv = {
  BETTER_AUTH_URL: BASE,
  IDENTITY_ISSUER: 'https://id.test',
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
  GITHUB_CLIENT_ID: 'gh',
  GITHUB_CLIENT_SECRET: 'gh',
  LINKEDIN_CLIENT_ID: 'li',
  LINKEDIN_CLIENT_SECRET: 'li',
}

let mf: Miniflare
let d1: D1Database
let env: never
let cookie: string
let targetId: string

const rows = async () =>
  await d1
    .prepare(
      "SELECT (SELECT json_group_array(json_array(id, userId, role)) FROM (SELECT * FROM member WHERE organizationId = 'org-g' ORDER BY id)) AS m, (SELECT count(*) FROM invitation) AS i",
    )
    .first()

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
  for (const stmt of sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim())) {
    if (stmt) await d1.prepare(stmt).run()
  }
  env = {
    ...authEnv,
    DB: d1,
    HANDOFF_IP_LIMIT: { limit: async () => ({ success: true }) },
  } as never
  const auth = createAuth(d1, authEnv)
  const ctx = await auth.$context
  const admin = await ctx.internalAdapter.createUser(
    { email: 'admin@example.com', name: 'A', emailVerified: true },
    { method: 'admin' },
  )
  const target = await ctx.internalAdapter.createUser(
    { email: 'target@example.com', name: 'T', emailVerified: true },
    { method: 'admin' },
  )
  targetId = target.id
  await createData({ DB: d1 } as DataEnv).ensureOrganization('org-g', 'g')
  await d1
    .prepare(
      "INSERT INTO member (id, organizationId, userId, role) VALUES ('m-admin', 'org-g', ?, 'owner'), ('m-target', 'org-g', ?, 'member')",
    )
    .bind(admin.id, target.id)
    .run()
  const { token } = await ctx.internalAdapter.createSession(admin.id, false)
  cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`
})
afterAll(() => mf?.dispose())

const call = (path: string, body?: unknown) =>
  worker.fetch(
    new Request(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { cookie, origin: BASE, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  )

describe('organization write gate (until #1923)', () => {
  it.each([
    [
      '/api/auth/organization/invite-member',
      { email: 'new@example.com', role: 'admin', organizationId: 'org-g' },
    ],
    [
      '/api/auth/organization/update-member-role',
      { memberId: 'm-target', role: 'admin', organizationId: 'org-g' },
    ],
    [
      '/api/auth/organization/remove-member',
      { memberIdOrEmail: 'm-target', organizationId: 'org-g' },
    ],
    // Path spellings a lenient router might still dispatch.
    [
      '/api/auth//Organization/update-member-role/',
      { memberId: 'm-target', role: 'admin', organizationId: 'org-g' },
    ],
    [
      '/api/auth/organizatio%6E/remove-member',
      { memberIdOrEmail: 'm-target', organizationId: 'org-g' },
    ],
  ])('refuses %s to an owner session, no rows change', async (path, body) => {
    const before = await rows()
    const res = await call(path, body)
    // Rows first: a sabotaged gate must fail on the write landing.
    expect(await rows()).toEqual(before)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
    expect(before).toMatchObject({ i: 0 })
    expect(JSON.parse(String(before!.m))).toContainEqual([
      'm-target',
      targetId,
      'member',
    ])
  })

  it('still serves organization reads', async () => {
    const res = await call(
      '/api/auth/organization/list-members?organizationId=org-g',
    )
    expect(res.status).toBe(200)
    const { members } = (await res.json()) as { members: unknown[] }
    expect(members).toHaveLength(2)
  })

  it('leaves token issuance and social sign-in alone', async () => {
    const token = await call('/api/auth/token')
    expect(token.status).toBe(200)
    expect(await token.json()).toHaveProperty('token')
    const signIn = await call('/api/auth/sign-in/social', {
      provider: 'github',
      callbackURL: BASE,
    })
    expect(signIn.status).toBe(200)
    expect(await signIn.json()).toMatchObject({
      url: expect.stringContaining('github.com'),
    })
  })

  it('leaves the handoff route to the handoff handler', async () => {
    // A malformed state is the handoff's own 400, not the gate's 403.
    const res = await call('/handoff?provider=github&origin=x&state=bad')
    expect(res.status).toBe(400)
  })
})
