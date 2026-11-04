// Organizer membership rules (#1923) against a real D1 (Miniflare) with the
// shipped migrations: the last-owner trigger, the pending-invite index, and
// the organization plugin's config, role rules and audit hooks.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSignature } from 'better-auth/crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INVITATION_EXPIRES_IN, createAuth, type AuthEnv } from './auth'

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
    await expect(
      run('DELETE FROM member WHERE id = ?', owner.memberId),
    ).rejects.toThrow(/LAST_OWNER/)
    await expect(
      run("UPDATE member SET role = 'admin' WHERE id = ?", owner.memberId),
    ).rejects.toThrow(/LAST_OWNER/)
    await expect(
      run(
        "UPDATE member SET role = 'admin', organizationId = 'org-x' WHERE id = ?",
        owner.memberId,
      ),
    ).rejects.toThrow(/LAST_OWNER/)
    expect(await roleOf(owner.memberId)).toBe('owner')
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
    await auth.api.updateMemberRole({
      headers: owner.headers,
      body: { organizationId: orgId, memberId: owner2.memberId, role: 'admin' },
    })
    expect(await roleOf(owner2.memberId)).toBe('admin')
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
