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
import { allowedRecipients } from '@runkonf/tenancy'
import { createAuth, type AuthEnv } from './data/auth'
import { inviterDisplayName } from './data/invitations'
import { createMembers } from './data/members'
import { invitePage, KONTROLL_URL } from './invite-page'
import { orgWriteGate } from './org-write-gate'

const BASE = 'http://identity.test'
const resend = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', resend)
/** The Resend calls made, as parsed bodies (fetch may get a Request). */
const sent = () =>
  Promise.all(
    resend.mock.calls
      .map(([u, init]) => new Request(u as RequestInfo, init))
      .filter((r) => r.url === 'https://api.resend.com/emails')
      .map(async (r) => {
        expect(r.headers.get('authorization')).toBe('Bearer re_test')
        return JSON.parse(await r.clone().text())
      }),
  )
const limit = vi.fn(async () => ({ success: true }))
const env: AuthEnv = {
  BETTER_AUTH_URL: BASE,
  IDENTITY_ISSUER: 'https://id.test',
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
  GITHUB_CLIENT_ID: 'gh',
  GITHUB_CLIENT_SECRET: 'gh',
  LINKEDIN_CLIENT_ID: 'li',
  LINKEDIN_CLIENT_SECRET: 'li',
  RESEND_API_KEY: 're_test',
  INVITE_FROM: 'Konf <no-reply@konf.app>',
}

let mf: Miniflare
let d1: D1Database
let auth: ReturnType<typeof createAuth>
let cap: string | undefined
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
  resend.mockReset().mockResolvedValue(Response.json({ id: 'e1' }))
  limit.mockReset().mockResolvedValue({ success: true })
  cap = undefined
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
async function invited(email: string, inviterName = 'Ada') {
  const orgId = `org-${++n}`
  await d1
    .prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)')
    .bind(orgId, `Org ${n}`, orgId)
    .run()
  const owner = await user(`owner-${n}@example.com`, true, inviterName)
  await d1
    .prepare(
      'INSERT INTO member (id, organizationId, userId, role) VALUES (?, ?, ?, ?)',
    )
    .bind(`${orgId}-m`, orgId, owner.id, 'owner')
    .run()
  const members = createMembers({ ...env, INVITE_DAILY_CAP: cap, DB: d1 })
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
  const expectMail = (
    m: Record<string, unknown>,
    to: string,
    invitationId: string,
    inviter: string,
  ) => {
    expect(m.from).toBe('Konf <no-reply@konf.app>')
    expect(m.to).toEqual([to])
    expect(m.subject).toMatch(/^You've been invited to join Org \d+$/)
    const link = `${BASE}/invite/${invitationId}`
    for (const body of [m.text, m.html]) {
      expect(body).toContain(link)
      expect(body).toContain(inviter)
    }
  }

  it('a member invite sends exactly one email, reply-to the verified inviter', async () => {
    const { owner, invitationId } = await invited('a@example.com')
    const mails = await sent()
    expect(mails).toHaveLength(1)
    expectMail(mails[0], 'a@example.com', invitationId, 'Ada')
    expect(mails[0].reply_to).toBe(`owner-${n}@example.com`)
    expect(owner.id).toBeTruthy()
  })

  // #2150: a demo org mails only its members, but a prospect is invited to
  // become one, so invites are exempt from allowedRecipients by design.
  it('a demo org still mails its invite to the non-member prospect', async () => {
    const { orgId, invitationId } = await invited('prospect@example.com')
    const memberEmails = (
      await all<{ email: string }>(
        'SELECT u.email FROM member m JOIN user u ON u.id = m.userId WHERE m.organizationId = ?',
        orgId,
      )
    ).map((r) => r.email)
    expect(
      allowedRecipients('demo', ['prospect@example.com'], memberEmails),
    ).toEqual([])
    const mails = await sent()
    expect(mails).toHaveLength(1)
    expectMail(mails[0], 'prospect@example.com', invitationId, 'Ada')
  })

  it('an operator invite sends exactly one email; an unverified inviter gets no reply-to', async () => {
    const { orgId } = await invited('first@example.com')
    resend.mockClear()
    const op = await user(`op-${n}@example.com`, false, 'Operator')
    const inv = await (
      await createMembers({ ...env, DB: d1 }).asOperator(op.id, orgId)
    ).invite('b@example.com', 'admin')
    const mails = await sent()
    expect(mails).toHaveLength(1)
    expectMail(mails[0], 'b@example.com', inv.id, 'Operator')
    expect(mails[0]).not.toHaveProperty('reply_to')
  })

  it('a failed send keeps the invitation', async () => {
    resend.mockResolvedValue(new Response('no', { status: 500 }))
    const { invitationId } = await invited('c@example.com')
    expect(
      await all('SELECT id FROM invitation WHERE id = ?', invitationId),
    ).toHaveLength(1)
  })

  it('without RESEND_API_KEY the invite succeeds and nothing is sent', async () => {
    const orgId = `org-${++n}`
    await d1
      .prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)')
      .bind(orgId, orgId, orgId)
      .run()
    const op = await user(`op2-${n}@example.com`)
    const inv = await (
      await createMembers({
        ...env,
        RESEND_API_KEY: undefined,
        DB: d1,
      }).asOperator(op.id, orgId)
    ).invite('nokey@example.com', 'member')
    expect(await sent()).toHaveLength(0)
    expect(
      await all('SELECT id FROM invitation WHERE id = ?', inv.id),
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

describe('hardening (#2136)', () => {
  it('an unverified session with the matching email sees no org name', async () => {
    const { invitationId } = await invited('uv@example.com')
    const invitee = await user('uv@example.com', false)
    const res = await get(invitationId, invitee.cookie)
    expect(res.status).toBe(404)
    expect(await res.text()).not.toMatch(/Org \d+/)
  })

  it('caps invitation emails per org per day, resends included', async () => {
    cap = '2'
    const { orgId, owner } = await invited('cap1@example.com')
    await d1
      .prepare('UPDATE session SET activeOrganizationId = ? WHERE userId = ?')
      .bind(orgId, owner.id)
      .run()
    const capped = createAuth(d1, { ...env, INVITE_DAILY_CAP: cap })
    const resendTo = (email: string) =>
      capped.api.createInvitation({
        headers: new Headers({ cookie: owner.cookie }),
        body: { email, role: 'member', organizationId: orgId, resend: true },
      })
    // Send 2 is a resend: it is mailed and counts.
    await resendTo('cap1@example.com')
    expect(await sent()).toHaveLength(2)
    resend.mockClear()
    // Past the cap: a new invite is created but not mailed, nor is a resend.
    const third = await (
      await createMembers({ ...env, INVITE_DAILY_CAP: cap, DB: d1 }).asMember(
        owner.id,
        orgId,
      )
    ).invite('cap3@example.com', 'member')
    await resendTo('cap1@example.com')
    expect(await sent()).toHaveLength(0)
    expect(
      await all('SELECT id FROM invitation WHERE id = ?', third.id),
    ).toHaveLength(1)
    expect(
      await all<{ n: number }>(
        'SELECT n FROM invite_send_count WHERE org_id = ?',
        orgId,
      ),
    ).toEqual([{ n: 4 }])
    // Another org has its own allowance.
    await invited('cap4@example.com')
    expect(await sent()).toHaveLength(1)
  })

  it('the cap defaults to 50 when unset', async () => {
    const { orgId } = await invited('dflt@example.com')
    await d1
      .prepare('UPDATE invite_send_count SET n = 50 WHERE org_id = ?')
      .bind(orgId)
      .run()
    resend.mockClear()
    const op = await user(`op-d-${n}@example.com`)
    await (
      await createMembers({ ...env, DB: d1 }).asOperator(op.id, orgId)
    ).invite('dflt2@example.com', 'member')
    expect(await sent()).toHaveLength(0)
  })

  it('the inviter name in the email carries no URL or phone number', async () => {
    await invited(
      'ph@example.com',
      'Support https://evil.example/login call +47 912 34 567 evil.com',
    )
    const [m] = await sent()
    for (const body of [m.text, m.html]) {
      expect(body).not.toMatch(/evil|https?:\/\/(?!identity\.test)|912/)
      expect(body).toContain('Support call')
    }
  })

  it('inviterDisplayName caps length and falls back', () => {
    expect([...inviterDisplayName('x'.repeat(200))]).toHaveLength(64)
    expect(inviterDisplayName('www.evil.no')).toBe('A member')
    expect(inviterDisplayName('Line\r\nBreak')).toBe('Line Break')
    expect(inviterDisplayName('Åse Ødegård')).toBe('Åse Ødegård')
  })

  it('email case variants match; Unicode look-alikes do not', async () => {
    const a = await invited('Mixed.Case@Example.com')
    const upper = await user('MIXED.CASE@example.COM')
    expect((await get(a.invitationId, upper.cookie)).status).toBe(200)
    expect((await accept(a.invitationId, upper.cookie)).status).toBe(200)
    // A non-ASCII address cannot be invited at all (z.email()).
    await expect(invited('j\u00f8rn@example.com')).rejects.toThrow()
    // ASCII invited; ø, combining-stroke and Cyrillic look-alikes refused.
    const b = await invited('jorn@example.com')
    for (const spoof of [
      'j\u00f8rn@example.com',
      'jo\u0338rn@example.com',
      'jorn@ex\u0430mple.com',
    ]) {
      const s = await user(spoof)
      expect((await get(b.invitationId, s.cookie)).status).toBe(404)
      expect((await accept(b.invitationId, s.cookie)).status).toBe(404)
    }
    expect(await membersOf(b.orgId)).toHaveLength(1)
  })

  it('a user whose provider gave no email cannot open or accept', async () => {
    const { orgId, invitationId } = await invited('noemail@example.com')
    const u = await user(`blank-${n}@example.com`)
    await d1.prepare("UPDATE user SET email = '' WHERE id = ?").bind(u.id).run()
    expect((await get(invitationId, u.cookie)).status).toBe(404)
    expect((await accept(invitationId, u.cookie)).status).toBe(404)
    expect(await membersOf(orgId)).toHaveLength(1)
  })

  it('an account linked after the invite does not change whose invite it is', async () => {
    const { orgId, invitationId } = await invited('linked@example.com')
    const other = await user(`linker-${n}@example.com`)
    await d1
      .prepare(
        "INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, 'github', ?, ?, ?)",
      )
      .bind(`acc-${n}`, `gh-${n}`, other.id, Date.now(), Date.now())
      .run()
    expect((await get(invitationId, other.cookie)).status).toBe(404)
    expect((await accept(invitationId, other.cookie)).status).toBe(404)
    // The real owner of the address, linking an account later, still can.
    const invitee = await user('linked@example.com')
    await d1
      .prepare(
        "INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, 'linkedin', ?, ?, ?)",
      )
      .bind(`acc2-${n}`, `li-${n}`, invitee.id, Date.now(), Date.now())
      .run()
    expect((await accept(invitationId, invitee.cookie)).status).toBe(200)
    expect((await membersOf(orgId)).map((m) => m.userId)).toContain(invitee.id)
  })
})
