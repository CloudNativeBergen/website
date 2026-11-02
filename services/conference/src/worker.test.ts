/**
 * @vitest-environment node
 *
 * The conference subgraph through its Worker fetch handler: real envelope
 * crypto and the real migration on an in-memory SQLite standing in for D1.
 */
import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ENVELOPE_HEADER,
  createSigner,
  generateEnvelopeKeyPair,
  type Envelope,
} from '@runkonf/tenancy'

// vitest.config.ts stubs `jose`; load the real one so signatures are checked.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const { default: worker } = await import('./worker')

/** The slice of D1 that drizzle-orm/d1 uses, over node:sqlite. */
function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...p: SQLInputValue[]) => stmt(sql, p),
    all: async () => ({
      results: db.prepare(sql).all(...params),
      success: true,
    }),
    raw: async () => {
      const s = db.prepare(sql)
      s.setReturnArrays(true)
      return s.all(...params)
    },
    first: async () => db.prepare(sql).get(...params) ?? null,
  })
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database
}

const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)
const tenant = (
  orgId: string,
  conferenceId: string | null,
  orgRole: string | null = null,
): Envelope => ({
  typ: 'tenant',
  orgId,
  conferenceId,
  userId: orgRole ? 'u' : null,
  orgRole,
  scopes: [],
})

let sqlite: DatabaseSync
let env: Parameters<typeof worker.fetch>[1]

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    readFileSync(
      new URL('../migrations/0001_init.sql', import.meta.url),
      'utf8',
    ),
  )
  const insert = sqlite.prepare(
    'INSERT INTO conferences (conference_id, org_id, published, title, social_links) VALUES (?, ?, ?, ?, ?)',
  )
  insert.run('conf-a', 'org-a', 1, 'A 2026', '["https://a.example"]')
  insert.run('conf-b', 'org-b', 1, 'B 2026', '[]')
  insert.run('conf-a-draft', 'org-a', 0, 'A 2027', '[]')
  env = { DB: d1(sqlite), GATEWAY_PUBLIC_KEY: keys.publicPem }
})

const QUERY = '{ conference { id title socialLinks } }'

async function gql(as?: Envelope | string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (as)
    headers[ENVELOPE_HEADER] =
      typeof as === 'string' ? as : await signer.sign(as)
  const res = await worker.fetch(
    new Request('http://conference/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: QUERY }),
    }),
    env,
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary GraphQL JSON
  return { status: res.status, body: (await res.json()) as any }
}

describe('conference', () => {
  it("resolves the envelope's published Conference", async () => {
    const { body } = await gql(tenant('org-a', 'conf-a'))
    expect(body.data.conference).toEqual({
      id: 'conf-a',
      title: 'A 2026',
      socialLinks: ['https://a.example'],
    })
  })

  it("never returns another tenant's Conference", async () => {
    // org-a's envelope naming org-b's conference id: no row matches both.
    for (const as of [
      tenant('org-a', 'conf-b'),
      tenant('org-a', 'conf-b', 'admin'),
    ]) {
      expect((await gql(as)).body.data.conference).toBeNull()
    }
  })

  it('hides an unpublished Conference from anonymous callers only', async () => {
    expect(
      (await gql(tenant('org-a', 'conf-a-draft'))).body.data.conference,
    ).toBeNull()
    expect(
      (await gql(tenant('org-a', 'conf-a-draft', 'admin'))).body.data
        .conference,
    ).toMatchObject({ id: 'conf-a-draft' })
  })

  it('returns null for an org-level envelope', async () => {
    expect((await gql(tenant('org-a', null))).body.data.conference).toBeNull()
  })

  it('rejects a missing or forged envelope before any resolver runs', async () => {
    expect((await gql()).status).toBe(401)
    expect((await gql('not-a-jwt')).status).toBe(403)
  })

  it('refuses a PlatformContext', async () => {
    const { body } = await gql({
      typ: 'platform',
      userId: 'op',
      platformRole: 'operator',
    })
    expect(body.data.conference).toBeNull()
    expect(body.errors).toHaveLength(1)
  })
})
