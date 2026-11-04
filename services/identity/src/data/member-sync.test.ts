// The organizer membership cron against a real D1 (Miniflare) and a stubbed
// Sanity HTTP API.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { evaluate, parse } from 'groq-js'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberId, syncMembers, type SyncEnv } from './member-sync'

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
  return { d1, seen, user, env: { ...ENV, DB: recording } as SyncEnv }
}

const ENV = {
  SANITY_PROJECT_ID: 'p',
  SANITY_DATASET: 'd',
  SANITY_API_TOKEN_READ: 'tok',
}

let conferences: unknown[]
/** Raw speaker documents; the real SPEAKERS query runs over them in groq-js. */
let speakers: Record<string, unknown>[]
const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
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
})
const logs: string[] = []

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  logs.length = 0
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
    for (const q of seen)
      expect(q).not.toMatch(/\b(UPDATE|DELETE|REPLACE|UPSERT)\b/i)
    expect(seen.filter((q) => q.startsWith('INSERT'))).toEqual(
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
