import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import {
  ENVELOPE_HEADER,
  createSigner,
  generateEnvelopeKeyPair,
  type Envelope,
} from '@runkonf/tenancy'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { DataEnv } from './data'
import { recordJobStatus } from './data/job-status'
import graph from './worker'

// Exercise signed envelopes with the real verifier rather than the suite stub.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})
const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)
let mf: Miniflare
let d1: D1Database
let reads = 0
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
})
afterAll(() => mf?.dispose())
beforeEach(async () => {
  await d1.prepare('DELETE FROM job_status').run()
  reads = 0
})
const QUERY =
  '{ memberSyncStatus { ranAt status checked affected granted drifted { orgId missingInIdentity missingInSanity roleMismatch ownersBelowTwo } } }'
async function query(envelope: Envelope | null) {
  const db = new Proxy(d1, {
    get(target, property) {
      if (property === 'prepare')
        return (sql: string) => {
          if (/SELECT.*job_status/.test(sql)) reads++
          return target.prepare(sql)
        }
      return Reflect.get(target, property)
    },
  })
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (envelope) headers[ENVELOPE_HEADER] = await signer.sign(envelope)
  const result = await graph.fetch(
    new Request('http://identity/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: QUERY }),
    }),
    { DB: db, GATEWAY_PUBLIC_KEY: keys.publicPem } as DataEnv & {
      GATEWAY_PUBLIC_KEY: string
    },
  )
  return result.json() as Promise<{
    data: { memberSyncStatus: unknown } | null
    errors?: { extensions: { code: string } }[]
  }>
}
const tenant = {
  typ: 'tenant',
  orgId: 'org-a',
  conferenceId: null,
  userId: 'op',
  orgRole: 'owner',
  scopes: [],
} satisfies Envelope
const platform = {
  typ: 'platform',
  userId: 'op',
  platformRole: 'operator',
} satisfies Envelope
const seed = () =>
  recordJobStatus(d1, {
    job: 'identity.member_sync',
    ran_at: 1794000000000,
    status: 'drift',
    checked: 2,
    affected: 1,
    granted: 1,
    detail: JSON.stringify([
      {
        orgId: 'org-a',
        counts: {
          missingInIdentity: 2,
          missingInSanity: 0,
          roleMismatch: 1,
          ownersBelowTwo: 1,
        },
      },
    ]),
  })
describe('memberSyncStatus', () => {
  it('returns null before the first run to a platform envelope', async () => {
    expect(await query(platform)).toEqual({ data: { memberSyncStatus: null } })
    expect(reads).toBe(1)
  })
  it('returns concrete persisted counts and ISO time to a platform envelope', async () => {
    await seed()
    expect(await query(platform)).toEqual({
      data: {
        memberSyncStatus: {
          ranAt: new Date(1794000000000).toISOString(),
          status: 'drift',
          checked: 2,
          affected: 1,
          granted: 1,
          drifted: [
            {
              orgId: 'org-a',
              missingInIdentity: 2,
              missingInSanity: 0,
              roleMismatch: 1,
              ownersBelowTwo: 1,
            },
          ],
        },
      },
    })
    expect(reads).toBe(1)
  })
  it.each([
    tenant,
    { ...tenant, scopes: ['platform:operator'] },
    { typ: 'user', userId: 'op' } satisfies Envelope,
    null,
  ])('refuses non-platform envelope %j before reading', async (envelope) => {
    await seed()
    const result = await query(envelope)
    expect(result.errors?.[0].extensions.code).toBe('FORBIDDEN')
    expect(reads).toBe(0)
  })
})
