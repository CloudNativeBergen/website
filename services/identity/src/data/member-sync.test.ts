// The organizer membership cron against a real D1 (Miniflare) and a stubbed
// Sanity HTTP API.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { evaluate, parse } from 'groq-js'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberId, syncMembers, type SyncEnv } from './member-sync'
import { memberSyncStatus } from './job-status'

const emit = vi.fn()
vi.mock('./push', () => ({ emit: (e: unknown) => emit(e) }))

const SLACK = 'https://hooks.slack.test/T/B/x'

let mf: Miniflare | undefined
afterAll(() => mf?.dispose())

/** A fresh D1 per test, with every SQL text it is asked to prepare recorded. */
async function freshDb() {
  await mf?.dispose()
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-08-01',
      d1Databases: ['DB'],
    }),
  )
  const d1 = (await mf.getD1Database('DB')) as unknown as D1Database
  const dir = join(import.meta.dirname, '../../migrations')
  const sql = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join(';\n')
  for (const s of sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim()))
    if (s) await d1.prepare(s).run()
  const seed = async (q: string, ...v: unknown[]) =>
    d1
      .prepare(q)
      .bind(...v)
      .run()
  for (const org of ['org-a', 'org-b'])
    await seed(
      'INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)',
      org,
      org,
      org,
    )
  const user = (id: string, email: string, verified: number) =>
    seed(
      'INSERT INTO user (id, name, email, emailVerified) VALUES (?, ?, ?, ?)',
      id,
      id,
      email,
      verified,
    )
  await user('u-owner', 'owner@example.com', 1)
  await user('u-ok', 'Ok@Example.com', 1)
  await user('u-unverified', 'unverified@example.com', 0)
  await seed(
    "INSERT INTO member (id, organizationId, userId, role) VALUES ('mem-cndn-owner-1', 'org-a', 'u-owner', 'owner')",
  )
  const seen: string[] = []
  const recording = new Proxy(d1, {
    get: (t, p) =>
      p === 'prepare'
        ? (q: string) => (seen.push(q), t.prepare(q))
        : Reflect.get(t, p).bind(t),
  })
  return { d1, seen, user, seed, env: { ...ENV, DB: recording } as SyncEnv }
}

const ENV = {
  SANITY_PROJECT_ID: 'p',
  SANITY_DATASET: 'd',
  SANITY_API_TOKEN_READ: 'tok',
}

let conferences: unknown[]
/** Raw speaker documents; the real SPEAKERS query runs over them in groq-js. */
let speakers: Record<string, unknown>[]
let slackStatus = 200
const slackPosts: string[] = []
async function defaultFetch(url: string, init: RequestInit) {
  if (url === SLACK) {
    slackPosts.push(String(init.body))
    return new Response('', { status: slackStatus })
  }
  const { query, params } = JSON.parse(String(init.body))
  const result = String(query).includes('"conference"')
    ? conferences
    : await (
        await evaluate(parse(query), {
          dataset: speakers.map((s) => ({ _type: 'speaker', ...s })),
          params,
        })
      ).get()
  return new Response(JSON.stringify({ result }))
}
const fetchMock = vi.fn(defaultFetch)
const logs: string[] = []

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  logs.length = 0
  slackPosts.length = 0
  slackStatus = 200
  for (const l of ['log', 'warn', 'error'] as const)
    vi.spyOn(console, l).mockImplementation((s: string) => {
      logs.push(s)
    })
  conferences = [
    { orgId: 'org-a', ids: ['sp-owner', 'sp-ok', 'sp-unverified'] },
    { orgId: 'org-b', ids: ['sp-ok'] },
  ]
  speakers = [
    { _id: 'sp-owner', knownEmails: ['owner@example.com'] },
    { _id: 'sp-ok', knownEmails: ['nope@x.test', ' ok@example.COM '] },
    { _id: 'sp-unverified', knownEmails: ['unverified@example.com'] },
  ]
})

const members = async (d1: D1Database) =>
  (
    await d1
      .prepare(
        'SELECT id, organizationId, userId, role FROM member ORDER BY id',
      )
      .all()
  ).results
const events = () => logs.map((l) => JSON.parse(l).event)

describe('syncMembers', () => {
  it('grants admin to verified matches only, idempotently, insert-only', async () => {
    const { d1, seen, env } = await freshDb()
    await syncMembers(env)
    await syncMembers(env)
    const rows = await members(d1)
    expect(rows).toEqual(
      [
        {
          id: 'mem-cndn-owner-1',
          organizationId: 'org-a',
          userId: 'u-owner',
          role: 'owner',
        },
        {
          id: await memberId('org-a', 'u-ok'),
          organizationId: 'org-a',
          userId: 'u-ok',
          role: 'admin',
        },
        {
          id: await memberId('org-b', 'u-ok'),
          organizationId: 'org-b',
          userId: 'u-ok',
          role: 'admin',
        },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    )
    // Owner pair untouched, unverified user never granted, second run no-op.
    expect(
      logs.filter((l) => l.includes('"identity.membership.granted"')),
    ).toHaveLength(2)
    expect(
      logs
        .map((l) => JSON.parse(l))
        .filter((e) => e.event === 'identity.membership.granted'),
    ).toEqual([
      {
        event: 'identity.membership.granted',
        orgId: 'org-a',
        userId: 'u-ok',
        memberId: await memberId('org-a', 'u-ok'),
      },
      {
        event: 'identity.membership.granted',
        orgId: 'org-b',
        userId: 'u-ok',
        memberId: await memberId('org-b', 'u-ok'),
      },
    ])
    expect(seen.length).toBeGreaterThan(0)
    for (const q of seen.filter((q) => !q.includes('job_status')))
      expect(q).not.toMatch(/\b(UPDATE|DELETE|REPLACE|UPSERT)\b/i)
    expect(seen.filter((q) => q.startsWith('INSERT INTO member '))).toEqual(
      Array(6).fill(
        'INSERT INTO member (id, organizationId, userId, role) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING',
      ),
    )
  })

  it('never counts an organizer-granted ticket address', async () => {
    const { d1, env, user } = await freshDb()
    // org-x organizer linked mallory's address to sp-ok, who organizes org-a/b.
    await user('u-mallory', 'mallory@evil.test', 1)
    speakers[1].knownEmails = [' Mallory@Evil.test ', 'ok@example.com']
    speakers[1].ticketEmailGrants = [{ email: 'mallory@evil.test' }]
    // Without its own address, sp-ok's grant alone must grant nothing.
    speakers.push({
      _id: 'sp-grant-only',
      knownEmails: ['mallory@evil.test'],
      ticketEmailGrants: [{ email: 'MALLORY@evil.test' }],
    })
    conferences[0] = { orgId: 'org-a', ids: ['sp-grant-only', 'sp-ok'] }
    await syncMembers(env)
    const rows = await members(d1)
    expect(rows.map((m) => m.userId)).not.toContain('u-mallory')
    expect(
      rows
        .filter((m) => m.role === 'admin')
        .map((m) => [m.organizationId, m.userId])
        .sort(),
    ).toEqual([
      ['org-a', 'u-ok'],
      ['org-b', 'u-ok'],
    ])
  })

  it('uses the #1909 id scheme', async () => {
    const { createHash } = await import('node:crypto')
    const want = `mem-bf-${createHash('sha256').update('org-a\0u-ok').digest('hex').slice(0, 24)}`
    expect(await memberId('org-a', 'u-ok')).toBe(want)
  })

  it('grants nothing when Sanity returns no organizers (unauthenticated read)', async () => {
    const { d1, env } = await freshDb()
    conferences = []
    await syncMembers(env)
    expect(await members(d1)).toHaveLength(1)
    expect(events()).toEqual(['identity.membership.sync_failed'])
  })

  it('grants nothing when the Sanity read fails', async () => {
    const { d1, env } = await freshDb()
    fetchMock.mockResolvedValueOnce(new Response('no', { status: 401 }))
    await syncMembers(env)
    expect(await members(d1)).toHaveLength(1)
    expect(events()).toEqual(['identity.membership.sync_failed'])
  })

  it('grants nothing and reads nothing without the token', async () => {
    const { d1, env } = await freshDb()
    await syncMembers({ ...env, SANITY_API_TOKEN_READ: undefined })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await members(d1)).toHaveLength(1)
    expect(events()).toEqual(['identity.membership.sync_failed'])
  })

  it('grant mode: published conferences with no organizers log only sync_failed', async () => {
    const { d1, env } = await freshDb()
    conferences = [{ orgId: 'org-a', ids: [] }]
    await syncMembers(env)
    expect(await members(d1)).toHaveLength(1)
    expect(events()).toEqual(['identity.membership.sync_failed'])
  })

  it('skips an org with no organizers and warns', async () => {
    const { d1, env } = await freshDb()
    conferences = [{ orgId: 'org-b', ids: ['sp-ok'] }]
    await syncMembers(env)
    expect((await members(d1)).map((m) => m.organizationId).sort()).toEqual([
      'org-a',
      'org-b',
    ])
    expect(events()).toContain('identity.membership.org_skipped')
  })

  it('skips verified emails that clash by case, logging counts only', async () => {
    const { d1, env, user } = await freshDb()
    await user('u-ok-2', 'ok@example.com', 1)
    await syncMembers(env)
    expect(await members(d1)).toHaveLength(1)
    const clash = logs
      .map((l) => JSON.parse(l))
      .find((e) => e.event === 'identity.membership.email_case_clash')
    expect(clash).toEqual({
      event: 'identity.membership.email_case_clash',
      count: 1,
    })
  })

  it('never logs an email', async () => {
    const { env, user } = await freshDb()
    await user('u-ok-2', 'ok@example.com', 1)
    await syncMembers(env)
    const { env: env2 } = await freshDb()
    await syncMembers(env2)
    expect(logs.length).toBeGreaterThan(0)
    for (const l of logs) expect(l).not.toMatch(/@/)
  })
})

describe('syncMembers drift mode (MEMBER_SOURCE_ORGS)', () => {
  /** org-a in drift: u-ok holds role `member`, u-stray is in identity only. */
  async function driftDb() {
    const db = await freshDb()
    await db.user('u-stray', 'stray@example.com', 1)
    await db.seed(
      "INSERT INTO member (id, organizationId, userId, role) VALUES ('m-ok', 'org-a', 'u-ok', 'member'), ('m-stray', 'org-a', 'u-stray', 'admin')",
    )
    return {
      ...db,
      env: {
        ...db.env,
        MEMBER_SOURCE_ORGS: ' org-a ,',
        SLACK_MEMBER_DRIFT_WEBHOOK_URL: SLACK,
      },
    }
  }
  const driftLog = () =>
    logs
      .map((l) => JSON.parse(l))
      .find((e) => e.event === 'identity.membership.drift')

  it('never inserts a member for a drift org; other orgs still grant', async () => {
    const { d1, seen, env } = await driftDb()
    const before = (await members(d1)).filter(
      (m) => m.organizationId === 'org-a',
    )
    await syncMembers(env)
    expect(
      (await members(d1)).filter((m) => m.organizationId === 'org-a'),
    ).toEqual(before)
    expect(
      (await members(d1))
        .filter((m) => m.organizationId === 'org-b')
        .map((m) => [m.userId, m.role]),
    ).toEqual([['u-ok', 'admin']])
    // Exactly one member insert: org-b's. None bound to org-a.
    expect(
      seen.filter((q) => q.startsWith('INSERT INTO member ')),
    ).toHaveLength(1)
    expect(
      logs
        .map((l) => JSON.parse(l))
        .filter((e) => e.event === 'identity.membership.granted'),
    ).toEqual([expect.objectContaining({ orgId: 'org-b', userId: 'u-ok' })])
  })

  it('computes drift both ways plus role mismatches, by id', async () => {
    const { env } = await driftDb()
    await syncMembers(env)
    expect(driftLog()).toEqual({
      event: 'identity.membership.drift',
      orgId: 'org-a',
      counts: {
        missingInIdentity: 1,
        missingInSanity: 1,
        roleMismatch: 1,
        ownersBelowTwo: 1,
      },
      missingInIdentity: ['sp-unverified'],
      missingInSanity: ['u-stray'],
      roleMismatch: ['u-ok'],
      ownersBelowTwo: 1,
    })
  })

  /** org-a with only Sanity organizers as members: drift is owners alone. */
  async function ownerDb(okRole: string) {
    const { env, d1 } = await freshDb()
    await d1
      .prepare(
        "INSERT INTO member (id, organizationId, userId, role) VALUES ('m-ok', 'org-a', 'u-ok', ?1)",
      )
      .bind(okRole)
      .run()
    speakers.pop()
    conferences[0] = { orgId: 'org-a', ids: ['sp-owner', 'sp-ok'] }
    return {
      d1,
      env: {
        ...env,
        MEMBER_SOURCE_ORGS: 'org-a',
        SLACK_MEMBER_DRIFT_WEBHOOK_URL: SLACK,
      },
    }
  }

  it('reports an org with one owner as owners below two, count only', async () => {
    const { env } = await ownerDb('admin')
    await syncMembers(env)
    expect(driftLog()).toMatchObject({
      counts: { ownersBelowTwo: 1 },
      ownersBelowTwo: 1,
    })
    expect(slackPosts).toHaveLength(1)
    const { text } = JSON.parse(slackPosts[0])
    expect(text).toContain('Owners below two: 1')
    expect(text).not.toContain('u-owner')
  })

  it('does not report an org with two owners (trigger-tolerant role)', async () => {
    const { env } = await ownerDb(' Admin ,\tOW NER\n')
    await syncMembers(env)
    expect(events()).toContain('identity.membership.drift_clean')
    expect(slackPosts).toEqual([])
  })

  it('changes the hash when the owner count crosses two', async () => {
    const { env, d1 } = await ownerDb('admin')
    const t0 = Date.parse('2026-11-04T10:00:00Z')
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    const hash = async () =>
      (
        await d1
          .prepare(
            "SELECT hash FROM member_drift_alert WHERE organizationId = 'org-a'",
          )
          .first<{ hash: string }>()
      )?.hash
    try {
      // Keep another drift category so the org never goes clean.
      await d1
        .prepare(
          "INSERT INTO member (id, organizationId, userId, role) VALUES ('m-x', 'org-a', 'u-unverified', 'member')",
        )
        .run()
      await syncMembers(env)
      const below = await hash()
      await d1
        .prepare("UPDATE member SET role = 'owner' WHERE id = 'm-ok'")
        .run()
      await syncMembers(env)
      const above = await hash()
      expect(below).toBeTruthy()
      expect(above).toBeTruthy()
      expect(above).not.toEqual(below)
      expect(slackPosts).toHaveLength(2)
    } finally {
      now.mockRestore()
    }
  })

  it('reports a clean org as clean and posts nothing', async () => {
    const { env, d1 } = await freshDb()
    await d1
      .prepare(
        "INSERT INTO member (id, organizationId, userId, role) VALUES ('m-ok', 'org-a', 'u-ok', 'admin,owner')",
      )
      .run()
    speakers.pop()
    conferences[0] = { orgId: 'org-a', ids: ['sp-owner', 'sp-ok'] }
    await syncMembers({
      ...env,
      MEMBER_SOURCE_ORGS: 'org-a',
      SLACK_MEMBER_DRIFT_WEBHOOK_URL: SLACK,
    })
    expect(events()).toContain('identity.membership.drift_clean')
    expect(slackPosts).toEqual([])
  })

  it('posts one Slack message with ids and counts, never an email', async () => {
    const { env } = await driftDb()
    await syncMembers(env)
    expect(slackPosts).toHaveLength(1)
    const { text } = JSON.parse(slackPosts[0])
    expect(text).toContain('org-a')
    expect(text).toContain('sp-unverified')
    expect(text).toContain('u-stray')
    expect(text).toContain('u-ok')
    for (const p of slackPosts) expect(p).not.toMatch(/@/)
    for (const l of logs) expect(l).not.toMatch(/@/)
  })

  it('dedupes: same drift posts once, a change posts again, a day re-posts', async () => {
    const { env, d1 } = await driftDb()
    const t0 = Date.parse('2026-11-04T10:00:00Z')
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    try {
      emit.mockReset()
      await syncMembers(env)
      now.mockReturnValue(t0 + 3600_000)
      await syncMembers(env)
      expect(slackPosts).toHaveLength(1)
      // The push event follows the Slack post's dedupe: once, ids only.
      expect(emit.mock.calls).toEqual([
        [{ type: 'membership.drift', organizationId: 'org-a' }],
      ])
      expect(events()).toContain('identity.membership.drift_deduped')
      // The drift set changes: post at once.
      await d1.prepare("DELETE FROM member WHERE id = 'm-stray'").run()
      await syncMembers(env)
      expect(slackPosts).toHaveLength(2)
      // Unchanged for a day: remind once.
      now.mockReturnValue(t0 + 3600_000 + 23 * 3600_000)
      await syncMembers(env)
      expect(slackPosts).toHaveLength(2)
      now.mockReturnValue(t0 + 3600_000 + 24 * 3600_000)
      await syncMembers(env)
      expect(slackPosts).toHaveLength(3)
    } finally {
      now.mockRestore()
    }
  })

  it('reports every member of a drift org whose conferences lost all organizers', async () => {
    const { env, d1 } = await driftDb()
    conferences = [
      { orgId: 'org-a', ids: [] },
      { orgId: 'org-b', ids: null },
    ]
    await syncMembers(env)
    await syncMembers(env)
    expect(driftLog()).toMatchObject({
      orgId: 'org-a',
      missingInSanity: ['u-ok', 'u-owner', 'u-stray'],
    })
    expect(slackPosts).toHaveLength(1)
    expect(events()).toContain('identity.membership.drift_deduped')
    // org-b grants nothing on an empty roster, exactly as before.
    expect(
      (await members(d1)).filter((m) => m.organizationId === 'org-b'),
    ).toEqual([])
    expect(events()).not.toContain('identity.membership.granted')
    expect(events()).not.toContain('identity.membership.synced')
  })

  it('a globally empty read stays sync_failed: no drift, no grants', async () => {
    const { env, d1 } = await driftDb()
    const before = await members(d1)
    conferences = []
    await syncMembers(env)
    expect(await members(d1)).toEqual(before)
    expect(slackPosts).toEqual([])
    expect(events()).toEqual(['identity.membership.sync_failed'])
  })

  it('only logs when the webhook is unset', async () => {
    const { env } = await driftDb()
    await syncMembers({ ...env, SLACK_MEMBER_DRIFT_WEBHOOK_URL: undefined })
    expect(driftLog()).toBeDefined()
    expect(fetchMock.mock.calls.map(([u]) => u)).not.toContain(SLACK)
  })

  it('isolates a Slack failure: logged without emails, sync finishes, retried next run', async () => {
    const { d1, env } = await driftDb()
    slackStatus = 500
    await syncMembers(env)
    expect(events()).toContain('identity.membership.drift_alert_failed')
    expect(events().at(-1)).toBe('identity.membership.synced')
    expect((await members(d1)).some((m) => m.organizationId === 'org-b')).toBe(
      true,
    )
    slackStatus = 200
    await syncMembers(env)
    expect(slackPosts).toHaveLength(2)
    for (const l of logs) expect(l).not.toMatch(/@/)
  })

  it('isolates a thrown Slack error', async () => {
    const { env } = await driftDb()
    // Sanity keeps working; only Slack throws.
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if (url === SLACK) throw new TypeError('network ann@example.org')
      return defaultFetch(url, init)
    })
    await syncMembers(env)
    expect(events()).toContain('identity.membership.drift_failed')
    expect(events().at(-1)).toBe('identity.membership.synced')
    for (const l of logs) expect(l).not.toMatch(/@/)
  })

  it('an empty MEMBER_SOURCE_ORGS runs exactly the grant path', async () => {
    const a = await freshDb()
    await syncMembers({ ...a.env, SLACK_MEMBER_DRIFT_WEBHOOK_URL: SLACK })
    const rowsA = await members(a.d1)
    const seenA = [...a.seen]
    const logsA = [...logs]
    logs.length = 0
    const b = await freshDb()
    await syncMembers({
      ...b.env,
      MEMBER_SOURCE_ORGS: '',
      SLACK_MEMBER_DRIFT_WEBHOOK_URL: SLACK,
    })
    expect(await members(b.d1)).toEqual(rowsA)
    expect(b.seen).toEqual(seenA)
    expect(logs).toEqual(logsA)
    expect(slackPosts).toEqual([])
    for (const q of b.seen) expect(q).not.toMatch(/member_drift_alert/)
  })
})

describe('member sync status', () => {
  const failingDb = (db: D1Database, query: string, error: Error) =>
    new Proxy(db, {
      get(target, property) {
        if (property === 'prepare')
          return (sql: string) => {
            if (sql.includes(query)) throw error
            return target.prepare(sql)
          }
        return Reflect.get(target, property)
      },
    })

  it('records and replaces a clean run with concrete counts', async () => {
    const { env, d1 } = await freshDb()
    const now = vi.spyOn(Date, 'now').mockReturnValue(1794000000000)
    try {
      await expect(syncMembers(env)).resolves.toBeUndefined()
      expect(await memberSyncStatus(d1)).toEqual({
        job: 'identity.member_sync',
        ran_at: 1794000000000,
        status: 'ok',
        checked: 2,
        affected: 0,
        granted: 2,
        detail: '[]',
      })
      await syncMembers(env)
      expect(await memberSyncStatus(d1)).toMatchObject({
        status: 'ok',
        granted: 0,
        detail: '[]',
      })
      expect(
        (await d1.prepare('SELECT * FROM job_status').all()).results,
      ).toHaveLength(1)
    } finally {
      now.mockRestore()
    }
  })

  it('persists drift org ids and counts without identities or emails', async () => {
    const { env, d1 } = await freshDb()
    await syncMembers({ ...env, MEMBER_SOURCE_ORGS: 'org-a' })
    const row = await memberSyncStatus(d1)
    expect(row).toMatchObject({
      status: 'drift',
      checked: 2,
      affected: 1,
      granted: 1,
    })
    expect(JSON.parse(row!.detail!)).toEqual([
      {
        orgId: 'org-a',
        counts: {
          missingInIdentity: 2,
          missingInSanity: 0,
          roleMismatch: 0,
          ownersBelowTwo: 1,
        },
      },
    ])
  })

  it('records a failed drift read while preserving the existing completion log', async () => {
    const { env, d1 } = await freshDb()
    await syncMembers({
      ...env,
      MEMBER_SOURCE_ORGS: 'org-a',
      DB: failingDb(d1, 'SELECT userId, role', new Error('read')),
    })
    expect(await memberSyncStatus(d1)).toMatchObject({
      status: 'failed',
      checked: 2,
      affected: 0,
      granted: 1,
      detail: '[]',
    })
    expect(events()).toContain('identity.membership.drift_failed')
    expect(events().at(-1)).toBe('identity.membership.synced')
  })

  it('gives failed alerts precedence over computed drift', async () => {
    const { env, d1 } = await freshDb()
    slackStatus = 500
    await syncMembers({
      ...env,
      MEMBER_SOURCE_ORGS: 'org-a',
      SLACK_MEMBER_DRIFT_WEBHOOK_URL: SLACK,
    })
    expect(await memberSyncStatus(d1)).toMatchObject({
      status: 'failed',
      affected: 1,
      granted: 1,
    })
    expect(events()).toContain('identity.membership.drift_alert_failed')
  })

  it('records early failures and propagates the original uncaught error', async () => {
    const { env, d1 } = await freshDb()
    await syncMembers({ ...env, SANITY_API_TOKEN_READ: undefined })
    expect(await memberSyncStatus(d1)).toMatchObject({
      status: 'failed',
      checked: 0,
      granted: 0,
      detail: '[]',
    })
    const error = new Error('original')
    await expect(
      syncMembers({ ...env, DB: failingDb(d1, 'SELECT id, email', error) }),
    ).rejects.toBe(error)
    expect(await memberSyncStatus(d1)).toMatchObject({
      status: 'failed',
      checked: 0,
      granted: 0,
    })
  })

  it('status write failure preserves the full existing log sequence and outcome', async () => {
    const { env, d1 } = await freshDb()
    await syncMembers({
      ...env,
      DB: failingDb(d1, 'job_status', new Error('write')),
    })
    expect(events()).toEqual([
      'identity.membership.granted',
      'identity.membership.granted',
      'identity.membership.synced',
      'job_status.write_failed',
    ])
    expect(JSON.parse(logs.at(-1)!)).toEqual({
      event: 'job_status.write_failed',
      job: 'identity.member_sync',
    })
    expect((await members(d1)).filter((r) => r.role === 'admin')).toHaveLength(
      2,
    )
  })
})
