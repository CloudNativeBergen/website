// Speaker profile (#2093) through the subgraph against a real D1 (Miniflare):
// owner-only reads and writes, the organizer directory, validation, erasure.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import {
  ENVELOPE_HEADER,
  createSigner,
  generateEnvelopeKeyPair,
  type Envelope,
} from '@runkonf/tenancy'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DataEnv } from './data'
import { schema } from './subgraph'
import graph from './worker'

// vitest.config.ts stubs `jose`; load the real one so envelopes verify.
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
let env: DataEnv

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
  env = {
    DB: d1,
    DIRECTORY: {} as Fetcher,
    BETTER_AUTH_URL: 'http://identity.test',
    IDENTITY_ISSUER: 'https://id.test',
    BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
    GITHUB_CLIENT_ID: 'gh',
    GITHUB_CLIENT_SECRET: 'gh',
    LINKEDIN_CLIENT_ID: 'li',
    LINKEDIN_CLIENT_SECRET: 'li',
  } as DataEnv
})
afterAll(() => mf?.dispose())

let n = 0
async function newUser() {
  const id = `u-${++n}-${crypto.randomUUID()}`
  await d1
    .prepare('INSERT INTO user (id, name, email) VALUES (?1, ?2, ?3)')
    .bind(id, `User ${n}`, `${id}@example.com`)
    .run()
  return id
}

const tenant = (
  userId: string | null,
  orgRole: string | null = null,
): Envelope => ({
  typ: 'tenant',
  orgId: 'org-x',
  conferenceId: null,
  userId,
  orgRole,
  scopes: [],
})
const platform = (userId: string): Envelope => ({
  typ: 'platform',
  userId,
  platformRole: 'operator',
})

async function gql(
  envelope: Envelope | null,
  query: string,
  variables?: Record<string, unknown>,
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (envelope) headers[ENVELOPE_HEADER] = await signer.sign(envelope)
  const res = await graph.fetch(
    new Request('http://identity/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    }),
    { ...env, GATEWAY_PUBLIC_KEY: keys.publicPem },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary GraphQL JSON
  return (await res.json()) as any
}

const FIELDS = 'id name bio photoKey links topics visibility'
const UPDATE = `mutation($input: SpeakerProfileInput!) { updateMyProfile(input: $input) { ${FIELDS} } }`
const MINE = `{ myProfile { ${FIELDS} } }`
const DIR = `query($first: Int, $after: String, $q: String) { speakerDirectory(first: $first, after: $after, query: $q) { nodes { ${FIELDS} } endCursor hasNextPage } }`

const update = (who: Envelope, input: Record<string, unknown>) =>
  gql(who, UPDATE, { input })

describe('myProfile / updateMyProfile', () => {
  it('creates on first update with network default, and reads only the caller', async () => {
    const a = await newUser()
    const b = await newUser()
    const r = await update(tenant(a), { name: 'Ada', bio: 'Hi' })
    expect(r.errors).toBeUndefined()
    expect(r.data.updateMyProfile).toMatchObject({
      name: 'Ada',
      visibility: 'network',
    })
    expect((await gql(tenant(a), MINE)).data.myProfile.name).toBe('Ada')
    // b sees no profile of its own, never a's.
    expect((await gql(tenant(b), MINE)).data.myProfile).toBeNull()
    // b's update writes b's row; a's stays.
    await update(tenant(b), { name: 'Bob' })
    expect((await gql(tenant(a), MINE)).data.myProfile.name).toBe('Ada')
    const owners = await d1
      .prepare(
        'SELECT user_id, name FROM speaker_profile WHERE user_id IN (?1, ?2) ORDER BY name',
      )
      .bind(a, b)
      .all()
    expect(owners.results).toEqual([
      { user_id: a, name: 'Ada' },
      { user_id: b, name: 'Bob' },
    ])
  })

  it('merges a partial update over the stored profile', async () => {
    const a = await newUser()
    await update(tenant(a), { name: 'Ada', topics: ['rust'] })
    const r = await update(tenant(a), { bio: 'New' })
    expect(r.data.updateMyProfile).toMatchObject({
      name: 'Ada',
      bio: 'New',
      topics: ['rust'],
    })
  })

  it('refuses anonymous callers and takes no userId argument', async () => {
    for (const who of [null, tenant(null)]) {
      const mine = await gql(who, MINE)
      expect(mine.errors).toBeUndefined()
      expect(mine.data.myProfile).toBeNull()
      expect(
        (await update(who as Envelope, { name: 'X' })).errors?.[0].extensions
          .code,
      ).toBe('FORBIDDEN')
    }
    const r = await gql(
      tenant(await newUser()),
      'mutation { updateMyProfile(userId: "x", input: {name: "X"}) { id } }',
    )
    expect(r.errors?.[0].message).toMatch(/Unknown argument "userId"/)
  })
})

describe('validation', () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ['missing name', { bio: 'x' }, /Name is required/],
    ['long name', { name: 'x'.repeat(121) }, /Name too long/],
    ['long bio', { name: 'A', bio: 'x'.repeat(4001) }, /Bio too long/],
    ['http link', { name: 'A', links: ['http://a.example'] }, /https/],
    ['javascript link', { name: 'A', links: ['javascript:alert(1)'] }, /https/],
    ['userinfo link', { name: 'A', links: ['https://u:p@a.example'] }, /https/],
    [
      'too many links',
      { name: 'A', links: Array(11).fill('https://a.example') },
      /Too many links/,
    ],
    [
      'too many topics',
      { name: 'A', topics: Array(21).fill('t') },
      /Too many topics/,
    ],
    [
      'javascript photo',
      { name: 'A', photoKey: 'javascript:alert(1)' },
      /R2 object key/,
    ],
    [
      'data photo',
      { name: 'A', photoKey: 'data:image/png;base64,AAAA' },
      /R2 object key/,
    ],
    [
      'https photo',
      { name: 'A', photoKey: 'https://evil.example/p.png' },
      /R2 object key/,
    ],
    ['dotdot photo', { name: 'A', photoKey: 'a/../b' }, /R2 object key/],
    ['long topic', { name: 'A', topics: ['x'.repeat(61)] }, /Topic too long/],
  ]
  it.each(cases)('refuses %s and stores nothing', async (_, input, msg) => {
    const a = await newUser()
    const r = await update(tenant(a), input)
    expect(r.errors?.[0].message).toMatch(msg)
    expect(r.errors?.[0].extensions.code).toBe('BAD_USER_INPUT')
    expect((await gql(tenant(a), MINE)).data.myProfile).toBeNull()
  })
  it('refuses an unknown visibility (enum)', async () => {
    const r = await update(tenant(await newUser()), {
      name: 'A',
      visibility: 'everyone',
    })
    expect(r.errors?.[0].message).toMatch(/visibility/i)
  })
  it('the CHECK constraint refuses a bad visibility written directly', async () => {
    const a = await newUser()
    await expect(
      d1
        .prepare(
          "INSERT INTO speaker_profile (user_id, id, name, visibility, created_at, updated_at) VALUES (?1, ?2, 'A', 'everyone', 0, 0)",
        )
        .bind(a, crypto.randomUUID())
        .run(),
    ).rejects.toThrow(/CHECK/)
  })
  it('accepts an R2 object key', async () => {
    const r = await update(tenant(await newUser()), {
      name: 'A',
      photoKey: 'profiles/u1/photo-2.webp',
    })
    expect(r.data.updateMyProfile.photoKey).toBe('profiles/u1/photo-2.webp')
  })
  it('accepts valid https links', async () => {
    const r = await update(tenant(await newUser()), {
      name: 'A',
      links: ['https://a.example/x'],
    })
    expect(r.data.updateMyProfile.links).toEqual(['https://a.example/x'])
  })
})

describe('speakerDirectory', () => {
  it('gives anonymous and non-organizer callers null', async () => {
    const u = await newUser()
    // A network profile exists, so a missing guard would return a page.
    await update(tenant(u), { name: 'Visible' })
    for (const who of [null, tenant(null), tenant(u), tenant(u, 'member')]) {
      const r = await gql(who, DIR)
      expect(r.errors).toBeUndefined()
      expect(r.data.speakerDirectory).toBeNull()
    }
  })

  it('returns network and public profiles to organizers, never private', async () => {
    const tag = `t${crypto.randomUUID().slice(0, 8)}`
    for (const visibility of ['private', 'network', 'public'])
      await update(tenant(await newUser()), {
        name: `${tag} ${visibility}`,
        visibility,
      })
    const org = await newUser()
    for (const who of [
      tenant(org, 'admin'),
      tenant(org, 'owner'),
      platform(org),
    ]) {
      const r = await gql(who, DIR, { q: tag })
      expect(r.errors).toBeUndefined()
      expect(
        r.data.speakerDirectory.nodes
          .map((p: { visibility: string }) => p.visibility)
          .sort(),
      ).toEqual(['network', 'public'])
    }
  })

  it('the directory type carries no user id or email', () => {
    const t = schema.getType(
      'SpeakerProfile',
    ) as import('graphql').GraphQLObjectType
    expect(Object.keys(t.getFields()).sort()).toEqual([
      'bio',
      'id',
      'links',
      'name',
      'photoKey',
      'topics',
      'updatedAt',
      'visibility',
    ])
  })

  it('the opaque id is not the user id', async () => {
    const a = await newUser()
    const tag = `t${crypto.randomUUID().slice(0, 8)}`
    await update(tenant(a), { name: tag })
    const r = await gql(tenant(a, 'owner'), DIR, { q: tag })
    expect(r.data.speakerDirectory.nodes).toHaveLength(1)
    expect(r.data.speakerDirectory.nodes[0].id).not.toBe(a)
  })

  it('pages through more than 100 profiles within the parameter cap', async () => {
    const tag = `bulk${crypto.randomUUID().slice(0, 8)}`
    const users = await Promise.all(Array.from({ length: 130 }, newUser))
    await d1.batch(
      users.map((u, i) =>
        d1
          .prepare(
            'INSERT INTO speaker_profile (user_id, id, name, created_at, updated_at) VALUES (?1, ?2, ?3, 0, 0)',
          )
          .bind(u, crypto.randomUUID(), `${tag} ${i}`),
      ),
    )
    const org = tenant(await newUser(), 'admin')
    // first above the page cap is clamped to 100.
    const p1 = (await gql(org, DIR, { first: 500, q: tag })).data
      .speakerDirectory
    expect(p1.nodes).toHaveLength(100)
    expect(p1.hasNextPage).toBe(true)
    const p2 = (
      await gql(org, DIR, { first: 100, after: p1.endCursor, q: tag })
    ).data.speakerDirectory
    expect(p2.nodes).toHaveLength(30)
    expect(p2.hasNextPage).toBe(false)
    const ids = new Set(
      [...p1.nodes, ...p2.nodes].map((p: { id: string }) => p.id),
    )
    expect(ids.size).toBe(130)
  })
})

describe('erasure', () => {
  it('deleting the user deletes the profile', async () => {
    const a = await newUser()
    await update(tenant(a), { name: 'Gone' })
    await d1.prepare('DELETE FROM user WHERE id = ?1').bind(a).run()
    const r = await d1
      .prepare('SELECT count(*) AS n FROM speaker_profile WHERE user_id = ?1')
      .bind(a)
      .first<{ n: number }>()
    expect(r?.n).toBe(0)
  })
})

describe('SpeakerLink (cfp, #2078)', () => {
  it('returns provider keys, the email only when verified, and the profile', async () => {
    const { createSpeakerProfiles } = await import('./data/speaker-profiles')
    const sp = createSpeakerProfiles(d1)
    const a = await newUser()
    await d1
      .prepare(
        "INSERT INTO account (id, accountId, providerId, userId) VALUES (?1, '42', 'github', ?2)",
      )
      .bind(crypto.randomUUID(), a)
      .run()
    const unverified = await sp.speakerLink(a)
    expect(unverified).toEqual({
      providers: ['github:42'],
      emails: [],
      profile: null,
    })
    await d1
      .prepare('UPDATE user SET emailVerified = 1 WHERE id = ?1')
      .bind(a)
      .run()
    await sp.update(a, { name: 'A', bio: 'B', links: ['https://a.example'] })
    expect(await sp.speakerLink(a)).toEqual({
      providers: ['github:42'],
      emails: [`${a}@example.com`.toLowerCase()],
      profile: {
        name: 'A',
        bio: 'B',
        links: ['https://a.example/'],
        photoKey: null,
      },
    })
  })
})
