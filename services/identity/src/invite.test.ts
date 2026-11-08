// Identity invitation delivery and acceptance (#2130) against a real D1
// (Miniflare) with the shipped migrations.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSignature } from 'better-auth/crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createAuth, type AuthEnv } from './data/auth'
import { createMembers } from './data/members'
import { invitePage, KONTROLL_URL } from './invite-page'
import { orgWriteGate } from './org-write-gate'

const BASE = 'http://identity.test'
const siteMail = { invitation: vi.fn(async () => undefined) }
const limit = vi.fn(async () => ({ success: true }))
const env: AuthEnv = {
  BETTER_AUTH_URL: BASE,
  IDENTITY_ISSUER: 'https://id.test',
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
  GITHUB_CLIENT_ID: 'gh',
  GITHUB_CLIENT_SECRET: 'gh',
  LINKEDIN_CLIENT_ID: 'li',
  LINKEDIN_CLIENT_SECRET: 'li',
  SITE_MAIL: siteMail,
}

let mf: Miniflare
let d1: D1Database
let auth: ReturnType<typeof createAuth>
const pageEnv = () => ({
  ...env,
  DB: d1,
  HANDOFF_IP_LIMIT: { limit } as unknown as RateLimit,
})

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
  auth = createAuth(d1, env)
})
afterAll(() => mf?.dispose())
beforeEach(() => {
  siteMail.invitation.mockReset().mockResolvedValue(undefined)
  limit.mockReset().mockResolvedValue({ success: true })
})

const all = async <T>(q: string, ...v: unknown[]) =>
  (
    await d1
      .prepare(q)
      .bind(...v)
      .all<T>()
  ).results

let n = 0
async function user(email: string, emailVerified = true, name = 'T') {
  const ctx = await auth.$context
  const u = await ctx.internalAdapter.createUser(
    { email, name, emailVerified },
    { method: 'admin' },
  )
  const { token } = await ctx.internalAdapter.createSession(u.id, false)
  const signed = `${token}.${await makeSignature(token, ctx.secret)}`
  return { id: u.id, cookie: `${ctx.authCookies.sessionToken.name}=${signed}` }
}

/** An org with an owner who invites `email`; returns ids. */
async function invited(email: string) {
  const orgId = `org-${++n}`
  await d1
    .prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)')
    .bind(orgId, `Org ${n}`, orgId)
    .run()
  const owner = await user(`owner-${n}@example.com`, true, 'Ada')
  await d1
    .prepare(
      'INSERT INTO member (id, organizationId, userId, role) VALUES (?, ?, ?, ?)',
    )
    .bind(`${orgId}-m`, orgId, owner.id, 'owner')
    .run()
  const members = createMembers({ ...env, DB: d1 })
  const inv = await (
    await members.asMember(owner.id, orgId)
  ).invite(email, 'member')
  return { orgId, owner, invitationId: inv.id }
}

const get = (id: string, cookie?: string) =>
  invitePage(
    new Request(`${BASE}/invite/${id}`, {
      headers: cookie ? { cookie } : {},
    }),
    pageEnv(),
  )
const accept = (id: string, cookie?: string, origin = BASE) =>
  invitePage(
    new Request(`${BASE}/invite/${id}`, {
      method: 'POST',
      headers: { origin, ...(cookie ? { cookie } : {}) },
    }),
    pageEnv(),
  )
const membersOf = (orgId: string) =>
  all<{ userId: string }>(
    'SELECT userId FROM member WHERE organizationId = ?',
    orgId,
  )

describe('delivery', () => {
  it('a member invite sends exactly one email with org, inviter and id', async () => {
    const { orgId, owner, invitationId } = await invited('a@example.com')
    expect(siteMail.invitation).toHaveBeenCalledTimes(1)
    expect(siteMail.invitation).toHaveBeenCalledWith({
      invitationId,
      email: 'a@example.com',
      orgId,
      orgName: expect.stringMatching(/^Org \d+$/),
      inviterName: 'Ada',
      inviterId: owner.id,
    })
  })

  it('an operator invite sends exactly one email', async () => {
    const { orgId } = await invited('first@example.com')
    siteMail.invitation.mockClear()
    const op = await user(`op-${n}@example.com`, true, 'Operator')
    const inv = await (
      await createMembers({ ...env, DB: d1 }).asOperator(op.id, orgId)
    ).invite('b@example.com', 'admin')
    expect(siteMail.invitation).toHaveBeenCalledTimes(1)
    expect(siteMail.invitation).toHaveBeenCalledWith({
      invitationId: inv.id,
      email: 'b@example.com',
      orgId,
      orgName: expect.stringMatching(/^Org \d+$/),
      inviterName: 'Operator',
      inviterId: op.id,
    })
  })

  it('a failed send keeps the invitation', async () => {
    siteMail.invitation.mockRejectedValue(new Error('site down'))
    const { invitationId } = await invited('c@example.com')
    expect(
      await all('SELECT id FROM invitation WHERE id = ?', invitationId),
    ).toHaveLength(1)
  })
})

describe('accept', () => {
  it('a matching verified email becomes a member, audited, and lands in Kontroll', async () => {
    const { orgId, invitationId } = await invited('d@example.com')
    const invitee = await user('d@example.com')
    const page = await get(invitationId, invitee.cookie)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('data-accept')
    const res = await accept(invitationId, invitee.cookie)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: `${KONTROLL_URL}/orgs/${orgId}` })
    expect((await membersOf(orgId)).map((m) => m.userId)).toContain(invitee.id)
    const audit = await all<{ detail: string }>(
      "SELECT detail FROM audit_event WHERE action = 'invite.accept' AND userId = ?",
      invitee.id,
    )
    expect(audit).toHaveLength(1)
    expect(JSON.parse(audit[0].detail)).toMatchObject({ orgId, invitationId })
  })

  it('a different email is refused and nothing is created', async () => {
    const { orgId, invitationId } = await invited('e@example.com')
    const other = await user(`other-${n}@example.com`)
    const res = await accept(invitationId, other.cookie)
    expect(res.status).toBe(404)
    expect(await membersOf(orgId)).toHaveLength(1)
    expect(
      await all<{ status: string }>(
        'SELECT status FROM invitation WHERE id = ?',
        invitationId,
      ),
    ).toEqual([{ status: 'pending' }])
  })

  it('an unverified matching email is refused', async () => {
    const { orgId, invitationId } = await invited('f@example.com')
    const invitee = await user('f@example.com', false)
    expect((await accept(invitationId, invitee.cookie)).status).toBe(404)
    expect(await membersOf(orgId)).toHaveLength(1)
  })

  it('an expired invitation is refused', async () => {
    const { orgId, invitationId } = await invited('g@example.com')
    await d1
      .prepare('UPDATE invitation SET expiresAt = ? WHERE id = ?')
      .bind(Date.now() - 1000, invitationId)
      .run()
    const invitee = await user('g@example.com')
    expect((await get(invitationId, invitee.cookie)).status).toBe(404)
    expect((await accept(invitationId, invitee.cookie)).status).toBe(404)
    expect(await membersOf(orgId)).toHaveLength(1)
  })

  it('a stranger cannot tell an unknown id from someone else’s', async () => {
    const { invitationId } = await invited('h@example.com')
    const stranger = await user(`stranger-${n}@example.com`)
    const mine = await get(invitationId, stranger.cookie)
    const none = await get('doesnotexist', stranger.cookie)
    expect(mine.status).toBe(none.status)
    const strip = (s: string) => s.replaceAll(/[0-9a-f]{32}/g, '')
    expect(strip(await mine.text())).toBe(strip(await none.text()))
    const a = await accept(invitationId, stranger.cookie)
    const b = await accept('doesnotexist', stranger.cookie)
    expect([a.status, await a.json()]).toEqual([b.status, await b.json()])
    // Signed out, the page names no org at all.
    expect(await (await get(invitationId)).text()).not.toMatch(/Org \d+/)
  })

  it('refuses a cross-origin POST and a rate-limited one before anything', async () => {
    const { orgId, invitationId } = await invited('i@example.com')
    const invitee = await user('i@example.com')
    expect(
      (await accept(invitationId, invitee.cookie, 'https://evil.test')).status,
    ).toBe(403)
    limit.mockResolvedValue({ success: false })
    expect((await accept(invitationId, invitee.cookie)).status).toBe(429)
    expect(limit).toHaveBeenCalledWith({
      key: expect.stringMatching(/^invite:/),
    })
    expect(await membersOf(orgId)).toHaveLength(1)
  })

  it('the org-write gate still blocks accept and other writes over HTTP', () => {
    for (const p of [
      'accept-invitation',
      'invite-member',
      'update-member-role',
    ])
      expect(
        orgWriteGate(
          new Request(`${BASE}/api/auth/organization/${p}`, { method: 'POST' }),
        )?.status,
      ).toBe(403)
  })
})
