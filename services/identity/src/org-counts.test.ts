// Operator-lane Organization counts (#2142) against a real D1 (Miniflare)
// with the shipped migrations, the way the router asks: `_entities` on
// Organization. Only a PlatformContext gets past the reference.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createYoga } from 'graphql-yoga'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Envelope } from '@runkonf/tenancy'
import { createData, type DataEnv } from './data'
import { schema } from './subgraph'

let mf: Miniflare
let d1: D1Database
let prepared = 0

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
  const run = (q: string, ...v: unknown[]) =>
    d1
      .prepare(q)
      .bind(...v)
      .run()
  const day = 86_400_000
  for (const org of ['org-a', 'org-b'])
    await run(
      'INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)',
      org,
      org,
      org,
    )
  for (const u of ['u1', 'u2', 'u3', 'u4'])
    await run(
      'INSERT INTO user (id, name, email) VALUES (?, ?, ?)',
      u,
      u,
      `${u}@example.com`,
    )
  // org-a: 3 members; org-b: 1, and u1 belongs to both.
  for (const [i, [org, u, role]] of [
    ['org-a', 'u1', 'owner'],
    ['org-a', 'u2', 'admin'],
    ['org-a', 'u3', 'member'],
    ['org-b', 'u1', 'owner'],
  ].entries())
    await run(
      'INSERT INTO member (id, organizationId, userId, role) VALUES (?, ?, ?, ?)',
      `m${i}`,
      org,
      u,
      role,
    )
  // org-a: one pending; expired, accepted and cancelled do not count.
  // org-b: two pending.
  for (const [i, [org, status, expires]] of [
    ['org-a', 'pending', Date.now() + day],
    ['org-a', 'pending', Date.now() - day],
    ['org-a', 'accepted', Date.now() + day],
    ['org-a', 'canceled', Date.now() + day],
    ['org-b', 'pending', Date.now() + day],
    ['org-b', 'pending', Date.now() + 2 * day],
  ].entries())
    await run(
      "INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId) VALUES (?, ?, ?, 'member', ?, ?, 'u1')",
      `i${i}`,
      org,
      `i${i}@example.com`,
      status,
      expires,
    )
})
afterAll(() => mf?.dispose())

async function counts(ids: string[], envelope: Envelope | null) {
  // Counts every statement prepared against D1: none may run on a refusal.
  const DB = new Proxy(d1, {
    get(t, k) {
      if (k === 'prepare') prepared++
      const v = Reflect.get(t, k)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  const data = createData({ DB } as unknown as DataEnv)
  const yoga = createYoga({
    schema,
    context: () => ({ envelope, data }),
    logging: false,
  })
  const reps = ids
    .map((id) => `{ __typename: "Organization", id: "${id}" }`)
    .join(', ')
  const res = await yoga.fetch('http://identity/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `{ _entities(representations: [${reps}]) { ... on Organization { id memberCount pendingInviteCount } } }`,
    }),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary GraphQL JSON
  return (await res.json()) as any
}

describe('operator organization counts (#2142)', () => {
  it('counts each org on its own, in two queries per page', async () => {
    prepared = 0
    const r = await counts(['org-a', 'org-b', 'org-x'], {
      typ: 'platform',
      userId: 'op',
      platformRole: 'operator',
    })
    expect(r.errors).toBeUndefined()
    expect(r.data._entities).toEqual([
      { id: 'org-a', memberCount: 3, pendingInviteCount: 1 },
      { id: 'org-b', memberCount: 1, pendingInviteCount: 2 },
      { id: 'org-x', memberCount: 0, pendingInviteCount: 0 },
    ])
    expect(prepared).toBe(2)
  })

  const tenant = (orgRole: string | null, scopes: string[] = []) =>
    ({
      typ: 'tenant',
      orgId: 'org-a',
      conferenceId: null,
      userId: 'u1',
      orgRole,
      scopes,
    }) as Envelope
  it.each([
    ['anonymous', null],
    ['a user-lane session', { typ: 'user', userId: 'u1' } as Envelope],
    ['the org owner', tenant('owner')],
    ['a tenant-lane operator', tenant(null, ['platform:operator'])],
  ])('refuses %s before any read', async (_, envelope) => {
    prepared = 0
    const r = await counts(['org-a'], envelope)
    // Null reference, no error: a deeper guard refusing would error instead.
    expect(r.errors).toBeUndefined()
    expect(r.data._entities).toEqual([null])
    expect(prepared).toBe(0)
  })
})
