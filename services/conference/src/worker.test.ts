/**
 * @vitest-environment node
 *
 * The conference subgraph through its Worker fetch handler: real envelope
 * crypto and the real migration on an in-memory SQLite standing in for D1.
 */
import { readFileSync, readdirSync } from 'node:fs'
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
  const dir = new URL('../migrations/', import.meta.url)
  for (const f of readdirSync(dir).sort()) {
    sqlite.exec(readFileSync(new URL(f, dir), 'utf8'))
  }
  const insert = sqlite.prepare(
    'INSERT INTO conferences (conference_id, org_id, published, title, social_links) VALUES (?, ?, ?, ?, ?)',
  )
  insert.run('conf-a', 'org-a', 1, 'A 2026', '["https://a.example"]')
  insert.run('conf-b', 'org-b', 1, 'B 2026', '[]')
  insert.run('conf-a-draft', 'org-a', 0, 'A 2027', '[]')
  env = {
    DB: d1(sqlite),
    GATEWAY_PUBLIC_KEY: keys.publicPem,
    SANITY_PROJECT_ID: 'p',
    SANITY_DATASET: 'd',
    SANITY_API_TOKEN_READ: 't',
  }
})

const QUERY = '{ conference { id title socialLinks } }'

async function gql(
  as?: Envelope | string,
  query = QUERY,
  variables?: Record<string, unknown>,
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (as)
    headers[ENVELOPE_HEADER] =
      typeof as === 'string' ? as : await signer.sign(as)
  const res = await worker.fetch(
    new Request('http://conference/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
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

  it("resolves the Conference entity only for the envelope's own id", async () => {
    const entity = async (id: string, as: Envelope) =>
      (
        await gql(
          as,
          `{ _entities(representations: [{ __typename: "Conference", id: "${id}" }]) { ... on Conference { id title } } }`,
        )
      ).body.data._entities[0]
    expect(await entity('conf-a', tenant('org-a', 'conf-a'))).toEqual({
      id: 'conf-a',
      title: 'A 2026',
    })
    // Tenant B's id under A's envelope, member or not.
    expect(await entity('conf-b', tenant('org-a', 'conf-a'))).toBeNull()
    expect(
      await entity('conf-b', tenant('org-a', 'conf-a', 'admin')),
    ).toBeNull()
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

describe('updateConference', () => {
  const MUTATION =
    'mutation($input: ConferencePatch!) { updateConference(input: $input) { id title tagline startDate endDate visibility socialLinks } }'
  const update = (as: Envelope, input: Record<string, unknown>) =>
    gql(as, MUTATION, { input })
  const row = (id: string) =>
    sqlite
      .prepare('SELECT * FROM conferences WHERE conference_id = ?')
      .get(id) as Record<string, unknown>

  it("lets an owner or admin patch the envelope's Conference", async () => {
    for (const role of ['owner', 'admin', 'member,admin']) {
      const { body } = await update(tenant('org-a', 'conf-a', role), {
        title: `by ${role}`,
      })
      expect(body.errors).toBeUndefined()
      expect(body.data.updateConference).toMatchObject({
        id: 'conf-a',
        title: `by ${role}`,
      })
      expect(row('conf-a').title).toBe(`by ${role}`)
      expect(row('conf-a').updated_at).toMatch(/^\d{4}-/)
    }
  })

  it('sets published from the lifecycle, and refuses null', async () => {
    const admin = tenant('org-a', 'conf-a', 'admin')
    expect((await update(admin, { published: false })).body.errors).toBeUndefined()
    expect(row('conf-a').published).toBe(0)
    expect((await update(admin, { published: true })).body.errors).toBeUndefined()
    expect(row('conf-a').published).toBe(1)
    const { body } = await update(admin, { published: null })
    expect(body.errors[0].extensions.code).toBe('BAD_USER_INPUT')
    expect(row('conf-a').published).toBe(1)
  })

  it('refuses anonymous callers and members without a writing role', async () => {
    const noUser: Envelope = {
      ...tenant('org-a', 'conf-a', 'admin'),
      userId: null,
    } as Envelope
    for (const as of [
      tenant('org-a', 'conf-a'),
      noUser,
      tenant('org-a', 'conf-a', 'member'),
      tenant('org-a', 'conf-a', 'administrator'),
    ]) {
      const { body } = await update(as, { title: 'pwned' })
      expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
      expect(row('conf-a').title).toBe('A 2026')
    }
  })

  it('refuses before touching the database', async () => {
    const prepare = vi.spyOn(env.DB, 'prepare')
    await update(tenant('org-a', 'conf-a', 'member'), { title: 'x' })
    expect(prepare).not.toHaveBeenCalled()
  })

  it("never writes another tenant's row", async () => {
    // org-a's admin envelope naming org-b's conference id.
    const { body } = await update(tenant('org-a', 'conf-b', 'admin'), {
      title: 'pwned',
    })
    expect(body.errors[0].extensions.code).toBe('NOT_FOUND')
    expect(row('conf-b').title).toBe('B 2026')
    // An admin of A writes A only.
    await update(tenant('org-a', 'conf-a', 'admin'), { title: 'A!' })
    expect(row('conf-b').title).toBe('B 2026')
    expect(row('conf-a-draft').title).toBe('A 2027')
  })

  it('leaves omitted fields alone and unsets explicit nulls', async () => {
    sqlite.exec(
      "UPDATE conferences SET tagline = 'tag' WHERE conference_id = 'conf-a'",
    )
    await update(tenant('org-a', 'conf-a', 'owner'), { city: 'Bergen' })
    expect(row('conf-a')).toMatchObject({
      title: 'A 2026',
      tagline: 'tag',
      city: 'Bergen',
    })
    await update(tenant('org-a', 'conf-a', 'owner'), { tagline: null })
    expect(row('conf-a')).toMatchObject({
      title: 'A 2026',
      tagline: null,
      city: 'Bergen',
    })
  })

  it('rejects invalid input without writing', async () => {
    sqlite.exec(
      "UPDATE conferences SET start_date = '2026-06-10' WHERE conference_id = 'conf-a'",
    )
    for (const input of [
      { startDate: '2026-13-01' },
      { endDate: '10.06.2026' },
      { endDate: '2026-02-30' },
      { endDate: '2026-06-09' }, // before the stored startDate
      { startDate: '2026-06-12', endDate: '2026-06-11' },
      { primaryColor: 'red' },
      { accentColor: '#12345' },
      { visibility: 'secret' },
      { visibility: null },
      { socialLinks: null },
      { socialLinks: ['javascript:alert(1)'] },
      { registrationLink: 'not a url' },
    ]) {
      const { body } = await update(tenant('org-a', 'conf-a', 'admin'), input)
      expect(body.errors[0].extensions.code, JSON.stringify(input)).toBe(
        'BAD_USER_INPUT',
      )
    }
    expect(row('conf-a')).toMatchObject({
      start_date: '2026-06-10',
      end_date: null,
      updated_at: null,
    })
    const ok = await update(tenant('org-a', 'conf-a', 'admin'), {
      endDate: '2026-06-11',
      primaryColor: '#AbC',
      visibility: 'unlisted',
      socialLinks: ['https://x.example'],
    })
    expect(ok.body.data.updateConference).toMatchObject({
      endDate: '2026-06-11',
      visibility: 'unlisted',
      socialLinks: ['https://x.example'],
    })
  })
})
