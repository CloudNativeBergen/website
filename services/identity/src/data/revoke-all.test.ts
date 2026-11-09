// revokeAll (docs/AUTHORIZATION.md §3.6) and the operator-write audit sink,
// against a real D1 (Miniflare) with the shipped migrations.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Envelope } from '@runkonf/tenancy'
import type { AuthEnv } from './auth'
import { createMembers } from './members'
import { recordOperatorWrite } from './push'

const authEnv: AuthEnv = {
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
async function user(operator = false) {
  const id = `u-${++n}`
  await run(
    'INSERT INTO user (id, name, email, platformOperator) VALUES (?, ?, ?, ?)',
    id,
    'T',
    `${id}@example.com`,
    operator ? 1 : 0,
  )
  await run(
    'INSERT INTO session (id, expiresAt, token, userId) VALUES (?, ?, ?, ?)',
    `s-${id}`,
    Date.now() + 3_600_000,
    `t-${id}`,
    id,
  )
  return id
}
async function org(...members: [string, string][]) {
  const orgId = `org-${++n}`
  await run(
    'INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)',
    orgId,
    orgId,
    orgId,
  )
  for (const [userId, role] of members)
    await run(
      'INSERT INTO member (id, organizationId, userId, role) VALUES (?, ?, ?, ?)',
      `${orgId}-${userId}`,
      orgId,
      userId,
      role,
    )
  return orgId
}

const platform = (userId: string): Envelope => ({
  typ: 'platform',
  userId,
  platformRole: 'operator',
})

describe('revokeAll', () => {
  it('removes memberships, sessions and the operator flag in one audited batch, keeping a last ownership', async () => {
    const op = await user(true)
    const target = await user(true)
    const other = await user()
    const shared = await org([target, 'owner'], [other, 'Owner'])
    const sole = await org([target, ' owner ,admin'])
    const asAdmin = await org([target, 'admin'], [other, 'owner'])
    const result = await createMembers({ ...authEnv, DB: d1 }).revokeAll(
      platform(op),
      target,
    )
    expect(result).toEqual({
      membersRemoved: 2,
      sessionsRevoked: 1,
      keptLastOwnerOf: [sole],
    })
    expect(
      await all('SELECT organizationId FROM member WHERE userId = ?', target),
    ).toEqual([{ organizationId: sole }])
    expect(await all('SELECT 1 FROM session WHERE userId = ?', target)).toEqual(
      [],
    )
    expect(
      await all('SELECT platformOperator FROM user WHERE id = ?', target),
    ).toEqual([{ platformOperator: 0 }])
    // The others are untouched.
    expect(
      await all(
        'SELECT organizationId FROM member WHERE userId = ? ORDER BY 1',
        other,
      ),
    ).toEqual(
      [{ organizationId: shared }, { organizationId: asAdmin }].sort((a, b) =>
        a.organizationId.localeCompare(b.organizationId),
      ),
    )
    expect(
      await all('SELECT 1 FROM session WHERE userId = ?', op),
    ).toHaveLength(1)
    expect(
      await all(
        "SELECT userId, subject_user_id, detail FROM audit_event WHERE action = 'user.revoke_all' AND subject_user_id = ?",
        target,
      ),
    ).toEqual([
      {
        userId: op,
        subject_user_id: target,
        detail: JSON.stringify({ operator: true, keptLastOwnerOf: [sole] }),
      },
    ])
  })

  const refused: [string, Envelope | null][] = [
    ['no envelope', null],
    ['a UserContext', { typ: 'user', userId: 'x' }],
    [
      'a tenant owner',
      {
        typ: 'tenant',
        orgId: 'o',
        conferenceId: null,
        userId: 'x',
        orgRole: 'owner',
        scopes: [],
      },
    ],
    [
      'a tenant-lane operator',
      {
        typ: 'tenant',
        orgId: 'o',
        conferenceId: null,
        userId: 'x',
        orgRole: null,
        scopes: ['platform:operator'],
      },
    ],
    [
      'the site lane',
      {
        typ: 'tenant',
        orgId: 'o',
        conferenceId: null,
        userId: null,
        orgRole: null,
        scopes: ['site:server'],
      },
    ],
  ]
  it.each(refused)('refuses %s before any read', async (_, envelope) => {
    const target = await user()
    await org([target, 'admin'], [await user(), 'owner'])
    const prepare = vi.fn(d1.prepare.bind(d1))
    const batch = vi.fn(d1.batch.bind(d1))
    const spy = new Proxy(d1, {
      get: (t, k) =>
        k === 'prepare' ? prepare : k === 'batch' ? batch : Reflect.get(t, k),
    })
    await expect(
      createMembers({ ...authEnv, DB: spy }).revokeAll(envelope, target),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(prepare).not.toHaveBeenCalled()
    expect(batch).not.toHaveBeenCalled()
    // The action did not happen.
    expect(
      await all('SELECT 1 FROM member WHERE userId = ?', target),
    ).toHaveLength(1)
    expect(
      await all('SELECT 1 FROM session WHERE userId = ?', target),
    ).toHaveLength(1)
  })
})

describe('operator-write audit sink', () => {
  it('records an operator.write row with ids and field names only', async () => {
    await recordOperatorWrite(d1, {
      type: 'operator.write',
      actorId: 'op-1',
      organizationId: 'org-a',
      conferenceId: 'conf-a',
      fields: ['title', 'titoEventSlug'],
    })
    expect(
      await all(
        "SELECT userId, detail FROM audit_event WHERE action = 'operator.write' AND userId = 'op-1'",
      ),
    ).toEqual([
      {
        userId: 'op-1',
        detail: JSON.stringify({
          operator: true,
          orgId: 'org-a',
          conferenceId: 'conf-a',
          fields: ['title', 'titoEventSlug'],
        }),
      },
    ])
  })

  it('refuses a malformed event and writes nothing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      recordOperatorWrite(d1, {
        type: 'member.removed',
        actorId: 'op-2',
      } as never),
    ).rejects.toThrow('malformed')
    await expect(
      recordOperatorWrite(d1, {
        type: 'operator.write',
        actorId: '',
        organizationId: 'o',
        conferenceId: null,
        fields: [],
      }),
    ).rejects.toThrow('malformed')
    expect(
      await all("SELECT 1 FROM audit_event WHERE userId IN ('op-2', '')"),
    ).toEqual([])
    expect(err).toHaveBeenCalledWith(expect.stringContaining('audit.rejected'))
    err.mockRestore()
  })

  it('throws when the insert fails (#2141)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = {
      prepare: () => ({
        bind: () => ({ run: () => Promise.reject(new Error('d1 down')) }),
      }),
    } as unknown as D1Database
    await expect(
      recordOperatorWrite(broken, {
        type: 'operator.write',
        actorId: 'op-3',
        organizationId: 'org-a',
        conferenceId: null,
        fields: ['plan'],
      }),
    ).rejects.toThrow('d1 down')
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('audit.write_failed'),
    )
    err.mockRestore()
  })
})
