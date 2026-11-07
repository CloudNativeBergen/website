// Organizer membership rules (#1923) against a real D1 (Miniflare) with the
// shipped migrations: the last-owner trigger, the pending-invite index, and
// the organization plugin's config, role rules and audit hooks.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSignature } from 'better-auth/crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INVITATION_EXPIRES_IN, createAuth, type AuthEnv } from './auth'
import { createMembers } from './members'

const env: AuthEnv = {
  BETTER_AUTH_URL: 'http://identity.test',
  IDENTITY_ISSUER: 'https://id.test',
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
  GITHUB_CLIENT_ID: 'gh',
  GITHUB_CLIENT_SECRET: 'gh',
  LINKEDIN_CLIENT_ID: 'li',
  LINKEDIN_CLIENT_SECRET: 'li',
}

let mf: Miniflare
let d1: D1Database
let auth: ReturnType<typeof createAuth>

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
  const dir = join(import.meta.dirname, '../../migrations')
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

const run = (q: string, ...v: unknown[]) =>
  d1
    .prepare(q)
    .bind(...v)
    .run()
const all = async <T>(q: string, ...v: unknown[]) =>
  (
    await d1
      .prepare(q)
      .bind(...v)
      .all<T>()
  ).results

let n = 0
/** A fresh org with members of the given roles; returns ids and cookies. */
async function org(...roles: string[]) {
  const orgId = `org-${++n}`
  await run(
    'INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)',
    orgId,
    orgId,
    orgId,
  )
  const ctx = await auth.$context
  const members = []
  for (const [i, role] of roles.entries()) {
    const u = await ctx.internalAdapter.createUser(
      { email: `${orgId}-${i}@example.com`, name: 'T', emailVerified: true },
      { method: 'admin' },
    )
    const memberId = `${orgId}-m${i}`
    await run(
      'INSERT INTO member (id, organizationId, userId, role) VALUES (?, ?, ?, ?)',
      memberId,
      orgId,
      u.id,
      role,
    )
    members.push({ userId: u.id, memberId, headers: await headers(u.id) })
  }
  return { orgId, members }
}

async function headers(userId: string) {
  const ctx = await auth.$context
  const { token } = await ctx.internalAdapter.createSession(userId, false)
  const signed = `${token}.${await makeSignature(token, ctx.secret)}`
  return new Headers({
    cookie: `${ctx.authCookies.sessionToken.name}=${signed}`,
  })
}

async function newUser(email: string, emailVerified = true) {
  const ctx = await auth.$context
  const u = await ctx.internalAdapter.createUser(
    { email, name: 'T', emailVerified },
    { method: 'admin' },
  )
  return { userId: u.id, headers: await headers(u.id) }
}

const roleOf = async (memberId: string) =>
  (
    await all<{ role: string }>(
      'SELECT role FROM member WHERE id = ?',
      memberId,
    )
  )[0]?.role

describe('last-owner trigger', () => {
  it('refuses deleting or demoting the only owner; other changes pass', async () => {
    const { orgId, members } = await org('owner', 'admin')
    const [owner, admin] = members
    const { orgId: otherOrg } = await org('admin')
    await expect(
      run('DELETE FROM member WHERE id = ?', owner.memberId),
    ).rejects.toThrow(/LAST_OWNER/)
    await expect(
      run("UPDATE member SET role = 'admin' WHERE id = ?", owner.memberId),
    ).rejects.toThrow(/LAST_OWNER/)
    await expect(
      run(
        'UPDATE member SET organizationId = ? WHERE id = ?',
        otherOrg,
        owner.memberId,
      ),
    ).rejects.toThrow(/LAST_OWNER/)
    expect(await roleOf(owner.memberId)).toBe('owner')
    expect(
      await all(
        'SELECT id FROM member WHERE id = ? AND organizationId = ?',
        owner.memberId,
        orgId,
      ),
    ).toHaveLength(1)
    // A role list that keeps owner, and changes to non-owners, pass.
    await run(
      "UPDATE member SET role = 'owner,admin' WHERE id = ?",
      owner.memberId,
    )
    await run("UPDATE member SET role = 'member' WHERE id = ?", admin.memberId)
    await run('DELETE FROM member WHERE id = ?', admin.memberId)
    expect(
      await all('SELECT id FROM member WHERE organizationId = ?', orgId),
    ).toHaveLength(1)
  })

  it('a second owner allows demoting the first, then guards the second', async () => {
    const { members } = await org('owner', 'owner')
    const [a, b] = members
    await run("UPDATE member SET role = 'admin' WHERE id = ?", a.memberId)
    expect(await roleOf(a.memberId)).toBe('admin')
    await expect(
      run('DELETE FROM member WHERE id = ?', b.memberId),
    ).rejects.toThrow(/LAST_OWNER/)
  })

  it('refuses demoting both owners at once, and rolls back the whole statement', async () => {
    const { orgId, members } = await org('owner', 'owner')
    await expect(
      run("UPDATE member SET role = 'admin' WHERE organizationId = ?", orgId),
    ).rejects.toThrow(/LAST_OWNER/)
    expect(await roleOf(members[0].memberId)).toBe('owner')
    expect(await roleOf(members[1].memberId)).toBe('owner')
  })

  it('treats role case and whitespace variants (tab included) as owner', async () => {
    const { members } = await org('Owner', 'admin')
    const [owner, admin] = members
    await expect(
      run('DELETE FROM member WHERE id = ?', owner.memberId),
    ).rejects.toThrow(/LAST_OWNER/)
    await expect(
      run("UPDATE member SET role = 'admin' WHERE id = ?", owner.memberId),
    ).rejects.toThrow(/LAST_OWNER/)
    await run(
      "UPDATE member SET role = ' OWNER' || char(9) WHERE id = ?",
      admin.memberId,
    )
    await run("UPDATE member SET role = 'admin' WHERE id = ?", owner.memberId)
    await expect(
      run("UPDATE member SET role = 'admin' WHERE id = ?", admin.memberId),
    ).rejects.toThrow(/LAST_OWNER/)
  })

  it("never blocks inserts, including the sync's ON CONFLICT insert", async () => {
    const { orgId } = await org()
    const u = await newUser(`ins-${orgId}@example.com`)
    await run(
      "INSERT INTO member (id, organizationId, userId, role) VALUES ('ins-1', ?, ?, 'admin') ON CONFLICT DO NOTHING",
      orgId,
      u.userId,
    )
    expect(await roleOf('ins-1')).toBe('admin')
  })

  it('lets an organization delete cascade past its owner', async () => {
    const { orgId } = await org('owner')
    await run('DELETE FROM organization WHERE id = ?', orgId)
    expect(
      await all('SELECT id FROM member WHERE organizationId = ?', orgId),
    ).toHaveLength(0)
  })
})

describe('pending invitations', () => {
  it('allow one pending invite per org and address, case-insensitively', async () => {
    const { orgId, members } = await org('owner')
    const ins = (id: string, email: string, status = 'pending') =>
      run(
        "INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId) VALUES (?, ?, ?, 'admin', ?, ?, ?)",
        id,
        orgId,
        email,
        status,
        Date.now() + 1e6,
        members[0].userId,
      )
    await ins(`${orgId}-i1`, 'dup@example.com')
    await expect(ins(`${orgId}-i2`, 'DUP@example.com')).rejects.toThrow(
      /UNIQUE/,
    )
    await ins(`${orgId}-i3`, 'dup@example.com', 'canceled')
  })

  it('expire after 30 days, are refused once expired, and can be re-sent', async () => {
    const { orgId, members } = await org('owner')
    const invitee = await newUser(`late-${orgId}@example.com`)
    const inv = await auth.api.createInvitation({
      headers: members[0].headers,
      body: {
        organizationId: orgId,
        email: `late-${orgId}@example.com`,
        role: 'admin',
      },
    })
    const days = (new Date(inv.expiresAt).getTime() - Date.now()) / 1000 / 86400
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThanOrEqual(INVITATION_EXPIRES_IN / 86400)
    // A second invite while the first is live is refused.
    await expect(
      auth.api.createInvitation({
        headers: members[0].headers,
        body: {
          organizationId: orgId,
          email: `late-${orgId}@example.com`,
          role: 'admin',
        },
      }),
    ).rejects.toThrow()

    await run(
      'UPDATE invitation SET expiresAt = ? WHERE id = ?',
      Date.now() - 1000,
      inv.id,
    )
    await expect(
      auth.api.acceptInvitation({
        headers: invitee.headers,
        body: { invitationId: inv.id },
      }),
    ).rejects.toThrow()
    // The expired row would block a new pending one; the hook retires it.
    const again = await auth.api.createInvitation({
      headers: members[0].headers,
      body: {
        organizationId: orgId,
        email: `late-${orgId}@example.com`,
        role: 'admin',
      },
    })
    expect(again.id).not.toBe(inv.id)
  })

  it('cannot be accepted with an unverified email', async () => {
    const { orgId, members } = await org('owner')
    const email = `unv-${orgId}@example.com`
    const invitee = await newUser(email, false)
    const inv = await auth.api.createInvitation({
      headers: members[0].headers,
      body: { organizationId: orgId, email, role: 'admin' },
    })
    await expect(
      auth.api.acceptInvitation({
        headers: invitee.headers,
        body: { invitationId: inv.id },
      }),
    ).rejects.toThrow()
  })

  it('only lists pending invitations whose expiresAt is in the future (#1979)', async () => {
    const { orgId, members } = await org('owner')
    const activeId = `${orgId}-active`
    const expiredId = `${orgId}-expired`
    const ins = (id: string, email: string, expiresAt: number) =>
      run(
        "INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId) VALUES (?, ?, ?, 'admin', 'pending', ?, ?)",
        id,
        orgId,
        email,
        expiresAt,
        members[0].userId,
      )
    await ins(activeId, 'active@example.com', Date.now() + 86_400_000)
    await ins(expiredId, 'expired@example.com', Date.now() - 1000)

    const pending = await createMembers({ ...env, DB: d1 }).pendingInvitations(
      orgId,
    )
    const ids = pending.map((i) => i.id)
    expect(ids).toContain(activeId)
    expect(ids).not.toContain(expiredId)
  })
})

describe('role rules', () => {
  it('admins manage admins', async () => {
    const { orgId, members } = await org('owner', 'admin', 'admin')
    const [, admin, other] = members
    await auth.api.createInvitation({
      headers: admin.headers,
      body: {
        organizationId: orgId,
        email: `a-${orgId}@example.com`,
        role: 'admin',
      },
    })
    await auth.api.updateMemberRole({
      headers: admin.headers,
      body: { organizationId: orgId, memberId: other.memberId, role: 'member' },
    })
    await auth.api.removeMember({
      headers: admin.headers,
      body: { organizationId: orgId, memberIdOrEmail: other.memberId },
    })
    expect(await roleOf(other.memberId)).toBeUndefined()
  })

  it('only owners invite, demote, remove or un-invite an owner', async () => {
    const { orgId, members } = await org('owner', 'admin', 'owner')
    const [owner, admin, owner2] = members
    await expect(
      auth.api.createInvitation({
        headers: admin.headers,
        body: {
          organizationId: orgId,
          email: `o-${orgId}@example.com`,
          role: 'owner',
        },
      }),
    ).rejects.toThrow()
    await expect(
      auth.api.updateMemberRole({
        headers: admin.headers,
        body: {
          organizationId: orgId,
          memberId: owner2.memberId,
          role: 'admin',
        },
      }),
    ).rejects.toThrow()
    await expect(
      auth.api.updateMemberRole({
        headers: admin.headers,
        body: {
          organizationId: orgId,
          memberId: admin.memberId,
          role: 'owner',
        },
      }),
    ).rejects.toThrow()
    await expect(
      auth.api.removeMember({
        headers: admin.headers,
        body: { organizationId: orgId, memberIdOrEmail: owner2.memberId },
      }),
    ).rejects.toThrow()
    const inv = await auth.api.createInvitation({
      headers: owner.headers,
      body: {
        organizationId: orgId,
        email: `o-${orgId}@example.com`,
        role: 'owner',
      },
    })
    await expect(
      auth.api.cancelInvitation({
        headers: admin.headers,
        body: { invitationId: inv.id },
      }),
    ).rejects.toThrow(/owner invitation/)
    expect(
      (
        await all<{ status: string }>(
          'SELECT status FROM invitation WHERE id = ?',
          inv.id,
        )
      )[0].status,
    ).toBe('pending')
    await auth.api.cancelInvitation({
      headers: owner.headers,
      body: { invitationId: inv.id },
    })
    await expect(
      auth.api.cancelInvitation({
        headers: owner.headers,
        body: { invitationId: inv.id },
      }),
    ).rejects.toThrow(/Only a pending invitation/)
    await auth.api.updateMemberRole({
      headers: owner.headers,
      body: { organizationId: orgId, memberId: owner2.memberId, role: 'admin' },
    })
    expect(await roleOf(owner2.memberId)).toBe('admin')
  })
})

describe('resending an invitation', () => {
  const state = (id: string) =>
    all<{ status: string; expiresAt: number }>(
      'SELECT status, expiresAt FROM invitation WHERE id = ?',
      id,
    ).then((r) => r[0])
  const resends = (id: string) =>
    all<{ userId: string; detail: string }>(
      "SELECT userId, detail FROM audit_event WHERE action = 'invite.resend' AND detail LIKE ?",
      `%"${id}"%`,
    )
  // The probe from the #1941 review: the plugin's resend path checks only
  // the role in the body and returns before any organization hook.
  const resend = (h: Headers, orgId: string, email: string) =>
    auth.api.createInvitation({
      headers: h,
      body: { organizationId: orgId, email, role: 'admin', resend: true },
    })

  it('refuses an admin resending an owner invite, over the API and HTTP', async () => {
    const { orgId, members } = await org('owner', 'admin')
    const [owner, admin] = members
    const email = `ro-${orgId}@example.com`
    const inv = await auth.api.createInvitation({
      headers: owner.headers,
      body: { organizationId: orgId, email, role: 'owner' },
    })
    const before = await state(inv.id)
    await expect(
      resend(admin.headers, orgId, email.toUpperCase()),
    ).rejects.toThrow(/owner invitation/)
    const h = new Headers(admin.headers)
    h.set('content-type', 'application/json')
    h.set('origin', env.BETTER_AUTH_URL)
    const res = await auth.handler(
      new Request(
        `${env.BETTER_AUTH_URL}/api/auth/organization/invite-member`,
        {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            organizationId: orgId,
            email,
            role: 'admin',
            resend: true,
          }),
        },
      ),
    )
    expect(res.status).toBe(403)
    expect(await res.text()).toMatch(/owner invitation/)
    expect(await state(inv.id)).toEqual(before)
    expect(await resends(inv.id)).toHaveLength(0)

    await run(
      'UPDATE invitation SET expiresAt = ? WHERE id = ?',
      Date.now() + 1000,
      inv.id,
    )
    const r = await resend(owner.headers, orgId, email)
    expect(r.id).toBe(inv.id)
    expect((await state(inv.id)).expiresAt).toBeGreaterThan(Date.now() + 1e9)
    const rows = await resends(inv.id)
    expect(rows.map((x) => [x.userId, JSON.parse(x.detail)])).toEqual([
      [owner.userId, { actorId: owner.userId, orgId, invitationId: inv.id }],
    ])
  })

  // The second #1941 probe: the plugin resolves the org with `||`, so an
  // empty or missing organizationId falls back to the active org.
  it.each([
    ['empty', { organizationId: '' }],
    ['omitted', {}],
  ])(
    'refuses an admin resending an owner invite with organizationId %s',
    async (_, org_) => {
      const { orgId, members } = await org('owner', 'admin')
      const [owner, admin] = members
      const email = `re-${orgId}@example.com`
      const inv = await auth.api.createInvitation({
        headers: owner.headers,
        body: { organizationId: orgId, email, role: 'owner' },
      })
      await auth.api.setActiveOrganization({
        headers: admin.headers,
        body: { organizationId: orgId },
      })
      const before = await state(inv.id)
      const body = { ...org_, email, role: 'admin' as const, resend: true }
      await expect(
        auth.api.createInvitation({ headers: admin.headers, body }),
      ).rejects.toThrow(/owner invitation/)
      const h = new Headers(admin.headers)
      h.set('content-type', 'application/json')
      h.set('origin', env.BETTER_AUTH_URL)
      const res = await auth.handler(
        new Request(
          `${env.BETTER_AUTH_URL}/api/auth/organization/invite-member`,
          { method: 'POST', headers: h, body: JSON.stringify(body) },
        ),
      )
      expect(res.status).toBe(403)
      expect(await res.text()).toMatch(/owner invitation/)
      expect(await state(inv.id)).toEqual(before)
      expect(await resends(inv.id)).toHaveLength(0)
    },
  )

  const post = async (h: Headers, body: object) => {
    const hh = new Headers(h)
    hh.set('content-type', 'application/json')
    hh.set('origin', env.BETTER_AUTH_URL)
    const res = await auth.handler(
      new Request(
        `${env.BETTER_AUTH_URL}/api/auth/organization/invite-member`,
        { method: 'POST', headers: hh, body: JSON.stringify(body) },
      ),
    )
    return [res.status, await res.text()]
  }

  // Guard before fetch: a non-member's refusal must not depend on whether a
  // pending owner invite exists for the email.
  it('gives a non-member the same refusal whether or not an owner invite exists', async () => {
    const { orgId, members } = await org('owner')
    const email = `ox-${orgId}@example.com`
    const inv = await auth.api.createInvitation({
      headers: members[0].headers,
      body: { organizationId: orgId, email, role: 'owner' },
    })
    const outsider = await newUser(`out-${orgId}@example.com`)
    const body = (e: string) => ({
      organizationId: orgId,
      email: e,
      role: 'admin',
      resend: true,
    })
    const before = await state(inv.id)
    const withInvite = await post(outsider.headers, body(email))
    const without = await post(
      outsider.headers,
      body(`none-${orgId}@example.com`),
    )
    expect(withInvite[0]).toBeGreaterThanOrEqual(400)
    expect(withInvite).toEqual(without)
    expect(await state(inv.id)).toEqual(before)
    expect(await resends(inv.id)).toHaveLength(0)
  })

  // Pins the expiry filter: an expired owner invite is not the plugin's
  // resend target, so the hook must not refuse an admin over it.
  it('ignores an expired owner invite when an admin resends', async () => {
    const { orgId, members } = await org('owner', 'admin')
    const [owner, admin] = members
    const email = `rx-${orgId}@example.com`
    const inv = await auth.api.createInvitation({
      headers: owner.headers,
      body: { organizationId: orgId, email, role: 'owner' },
    })
    await run(
      'UPDATE invitation SET expiresAt = ? WHERE id = ?',
      Date.now() - 1000,
      inv.id,
    )
    const r = await resend(admin.headers, orgId, email)
    expect(r.id).not.toBe(inv.id)
    expect(r.role).toBe('admin')
    expect(await resends(inv.id)).toHaveLength(0)
  })

  it('lets an owner resend with the org omitted and a mixed-case email', async () => {
    const { orgId, members } = await org('owner')
    const owner = members[0]
    const email = `rm-${orgId}@example.com`
    const inv = await auth.api.createInvitation({
      headers: owner.headers,
      body: { organizationId: orgId, email, role: 'owner' },
    })
    await auth.api.setActiveOrganization({
      headers: owner.headers,
      body: { organizationId: orgId },
    })
    const r = await auth.api.createInvitation({
      headers: owner.headers,
      body: {
        email: email[0].toUpperCase() + email.slice(1),
        role: 'owner',
        resend: true,
      },
    })
    expect(r.id).toBe(inv.id)
    expect(await resends(inv.id)).toHaveLength(1)
  })

  it('lets an admin resend an admin invite, with an audit row', async () => {
    const { orgId, members } = await org('owner', 'admin')
    const admin = members[1]
    const email = `ra-${orgId}@example.com`
    const inv = await auth.api.createInvitation({
      headers: admin.headers,
      body: { organizationId: orgId, email, role: 'admin' },
    })
    expect((await resend(admin.headers, orgId, email)).id).toBe(inv.id)
    const rows = await resends(inv.id)
    expect(rows.map((x) => [x.userId, JSON.parse(x.detail)])).toEqual([
      [admin.userId, { actorId: admin.userId, orgId, invitationId: inv.id }],
    ])
    expect(JSON.stringify(rows)).not.toContain('@')
  })
})

describe('membership audit', () => {
  it('writes ids-only rows for every member and invitation change', async () => {
    const { orgId, members } = await org('owner', 'admin', 'admin')
    const [owner, admin, leaver] = members
    const email = `aud-${orgId}@example.com`
    const invitee = await newUser(email)
    const inv = await auth.api.createInvitation({
      headers: admin.headers,
      body: { organizationId: orgId, email, role: 'admin' },
    })
    const accepted = await auth.api.acceptInvitation({
      headers: invitee.headers,
      body: { invitationId: inv.id },
    })
    const inv2 = await auth.api.createInvitation({
      headers: owner.headers,
      body: {
        organizationId: orgId,
        email: `gone-${orgId}@example.com`,
        role: 'admin',
      },
    })
    await auth.api.cancelInvitation({
      headers: owner.headers,
      body: { invitationId: inv2.id },
    })
    await auth.api.updateMemberRole({
      headers: owner.headers,
      body: { organizationId: orgId, memberId: admin.memberId, role: 'owner' },
    })
    await auth.api.removeMember({
      headers: owner.headers,
      body: { organizationId: orgId, memberIdOrEmail: accepted!.member.id },
    })
    await auth.api.leaveOrganization({
      headers: leaver.headers,
      body: { organizationId: orgId },
    })

    const rows = await all<{ action: string; userId: string; detail: string }>(
      'SELECT action, userId, detail FROM audit_event WHERE detail LIKE ? ORDER BY id',
      `%"${orgId}"%`,
    )
    expect(rows.map((r) => [r.action, r.userId, JSON.parse(r.detail)])).toEqual(
      [
        [
          'invite.create',
          admin.userId,
          { actorId: admin.userId, orgId, invitationId: inv.id, to: 'admin' },
        ],
        [
          'invite.accept',
          invitee.userId,
          {
            actorId: invitee.userId,
            orgId,
            invitationId: inv.id,
            memberId: accepted!.member.id,
            to: 'admin',
          },
        ],
        [
          'invite.create',
          owner.userId,
          { actorId: owner.userId, orgId, invitationId: inv2.id, to: 'admin' },
        ],
        [
          'invite.cancel',
          owner.userId,
          { actorId: owner.userId, orgId, invitationId: inv2.id },
        ],
        [
          'member.role',
          admin.userId,
          {
            actorId: owner.userId,
            orgId,
            memberId: admin.memberId,
            from: 'admin',
            to: 'owner',
          },
        ],
        [
          'member.remove',
          invitee.userId,
          {
            actorId: owner.userId,
            orgId,
            memberId: accepted!.member.id,
            from: 'admin',
          },
        ],
        [
          'member.leave',
          leaver.userId,
          { actorId: leaver.userId, orgId, memberId: leaver.memberId },
        ],
      ],
    )
    expect(JSON.stringify(rows)).not.toContain('@')
  })
})

describe('operator role change (#1967)', () => {
  const opAudits = async (orgId: string) =>
    (
      await all<{ action: string; detail: string }>(
        "SELECT action, detail FROM audit_event WHERE action = 'member.role' AND detail LIKE ? ORDER BY id",
        `%"${orgId}"%`,
      )
    ).map((r) => JSON.parse(r.detail))

  it('audits the role it actually replaced', async () => {
    const { orgId, members } = await org('owner', 'owner', 'admin')
    const ops = await createMembers({ ...env, DB: d1 }).asOperator(
      'op-1',
      orgId,
    )
    await ops.changeRole(members[2].userId, 'member')
    expect(await roleOf(members[2].memberId)).toBe('member')
    expect(await opAudits(orgId)).toEqual([
      {
        actorId: 'op-1',
        operator: true,
        orgId,
        memberId: members[2].memberId,
        from: 'admin',
        to: 'member',
      },
    ])
  })

  it('refuses, writing nothing, when the role changed after it was read', async () => {
    const { orgId, members } = await org('owner', 'owner', 'admin')
    const target = members[2]
    // A concurrent operator change lands between the read and the batch.
    const raced = new Proxy(d1, {
      get(t, p) {
        if (p === 'batch')
          return async (stmts: D1PreparedStatement[]) => {
            await run(
              "UPDATE member SET role = 'owner' WHERE id = ?",
              target.memberId,
            )
            return t.batch(stmts)
          }
        const v = Reflect.get(t, p) as unknown
        return typeof v === 'function' ? v.bind(t) : v
      },
    }) as D1Database
    const ops = await createMembers({ ...env, DB: raced }).asOperator(
      'op-1',
      orgId,
    )
    await expect(ops.changeRole(target.userId, 'member')).rejects.toMatchObject(
      {
        code: 'BAD_USER_INPUT',
        message: "The member's role changed meanwhile; reload and try again",
      },
    )
    // The concurrent change stands, and no row claims "from: admin".
    expect(await roleOf(target.memberId)).toBe('owner')
    expect(await opAudits(orgId)).toEqual([])
  })
})

describe('members list above the D1 parameter cap (#2018)', () => {
  it('returns every provider for 150 members in at most 2 queries', async () => {
    const { orgId, members } = await org(
      'owner',
      ...Array<string>(149).fill('member'),
    )
    for (const m of members)
      await run(
        "INSERT INTO account (id, accountId, providerId, userId) VALUES (?, ?, 'github', ?)",
        `a-${m.userId}`,
        `gh-${m.userId}`,
        m.userId,
      )
    let queries = 0
    const DB = new Proxy(d1, {
      get: (t, k) =>
        k === 'prepare'
          ? (q: string) => (queries++, t.prepare(q))
          : (Reflect.get(t, k).bind?.(t) ?? Reflect.get(t, k)),
    })
    const rows = await createMembers({ ...env, DB }).list(orgId, true)
    expect(rows).toHaveLength(150)
    expect(rows.every((r) => r.providers.join() === 'github')).toBe(true)
    expect(queries).toBeLessThanOrEqual(2)
  })
})
