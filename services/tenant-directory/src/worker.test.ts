/**
 * @vitest-environment node
 *
 * The directory through its Worker fetch handler: real envelope crypto, the
 * real migration on an in-memory SQLite standing in for D1, and Cloudflare
 * custom hostnames mocked behind their interface.
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
import type { CustomHostnames } from './data/cloudflare'

// vitest.config.ts stubs `jose`; load the real one so signatures are checked.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})

const hostnames = {
  create: vi.fn<CustomHostnames['create']>(),
  get: vi.fn<CustomHostnames['get']>(),
  delete: vi.fn<CustomHostnames['delete']>(),
  find: vi.fn<CustomHostnames['find']>(),
}
const identity = {
  ensure: vi.fn(async () => undefined),
  syncMembers: vi.fn(async (): Promise<unknown> => undefined),
  memberships: vi.fn(async () => []),
}
vi.mock('./data/cloudflare', () => ({ cloudflareHostnames: () => hostnames }))

const { default: worker } = await import('./worker')

/** The slice of D1 that drizzle-orm/d1 uses, over node:sqlite. */
function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...p: SQLInputValue[]) => stmt(sql, p),
    all: async () => ({
      results: db.prepare(sql).all(...params),
      success: true,
    }),
    run: async () => {
      db.prepare(sql).run(...params)
      return { results: [], success: true }
    },
    raw: async () => {
      const s = db.prepare(sql)
      s.setReturnArrays(true)
      return s.all(...params)
    },
    first: async () => db.prepare(sql).get(...params) ?? null,
  })
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: ReturnType<typeof stmt>[]) => {
      db.exec('BEGIN')
      try {
        const out = []
        for (const s of stmts) out.push(await s.all())
        db.exec('COMMIT')
        return out
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  } as unknown as D1Database
}

const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)
const operator: Envelope = {
  typ: 'platform',
  userId: 'op',
  platformRole: 'operator',
}
const organizer: Envelope = {
  typ: 'tenant',
  orgId: 'org',
  conferenceId: null,
  userId: 'u',
  orgRole: 'admin',
  scopes: [],
}

/** Published Sanity documents by `_id`; what the GROQ stub answers from. */
type Docs = {
  orgs: Record<string, { slug: string | null; name: string | null }>
  confs: Record<
    string,
    {
      orgRef: string | null
      title: string | null
      startDate: string | null
      domains: string[] | null
    }
  >
}
const tenantDocs = (): Docs => {
  const docs: Docs = { orgs: {}, confs: {} }
  for (const org of ['acme', 'beta', 'other']) {
    docs.orgs[`organization.${org}`] = { slug: org, name: `Org ${org}` }
    docs.confs[`conference-${org}`] = {
      orgRef: `organization.${org}`,
      title: 'Conf 2026',
      startDate: '2026-10-01',
      domains: [`${org}-2026.konf.run`, `${org}.konf.run`, `conf.${org}.org`],
    }
  }
  return docs
}
let sanity: Docs
const sanityFetch = vi.fn<typeof fetch>()
let sanityRequests: Pick<Request, 'url' | 'headers' | 'json'>[] = []
vi.stubGlobal('fetch', sanityFetch)

let sqlite: DatabaseSync
let env: Parameters<typeof worker.fetch>[1]

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    readFileSync(
      new URL('../migrations/0001_init.sql', import.meta.url),
      'utf8',
    ) +
      readFileSync(
        new URL('../migrations/0002_rollout_flags.sql', import.meta.url),
        'utf8',
      ) +
      readFileSync(
        new URL('../migrations/0004_org_created_at.sql', import.meta.url),
        'utf8',
      ) +
      readFileSync(
        new URL('../migrations/0005_lifecycle_cancelled.sql', import.meta.url),
        'utf8',
      ),
  )
  env = {
    DB: d1(sqlite),
    GATEWAY_PUBLIC_KEY: keys.publicPem,
    CF_API_TOKEN: 'unused',
    CF_ZONE_ID: 'unused',
    IDENTITY: identity,
    SANITY_PROJECT_ID: 'p',
    SANITY_DATASET: 'd',
    SANITY_API_TOKEN_READ: 'token',
  }
  sanity = tenantDocs()
  sanityFetch.mockReset()
  sanityRequests = []
  sanityFetch.mockImplementation(async (url, init) => {
    // A Request at runtime; workers-types and Node disagree on its type.
    const req = new Request(url as unknown as string, init)
    sanityRequests.push(req.clone())
    const { params } = (await req.json()) as {
      params: { orgId: string; conferenceId: string }
    }
    const org = sanity.orgs[params.orgId] ?? null
    const conf = sanity.confs[params.conferenceId] ?? null
    return Response.json({ result: { org, conf } })
  })
  hostnames.create.mockReset()
  hostnames.get.mockReset()
  hostnames.delete.mockReset()
  identity.ensure.mockReset()
  identity.syncMembers.mockReset()
})

async function gql(
  query: string,
  variables: Record<string, unknown> = {},
  as?: Envelope | string,
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (as)
    headers[ENVELOPE_HEADER] =
      typeof as === 'string' ? as : await signer.sign(as)
  const res = await worker.fetch(
    new Request('http://directory/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    }),
    env,
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary GraphQL JSON
  return { status: res.status, body: (await res.json()) as any }
}

const PROVISION = `mutation($key: String!, $org: String!, $orgId: ID!, $conf: ID!) {
  provisionOrganization(idempotencyKey: $key, orgId: $orgId, orgSlug: $org,
    conferenceId: $conf) { id slug status }
}`
const vars = (org = 'acme', key = 'k1', over: Record<string, string> = {}) => ({
  key,
  org,
  orgId: `organization.${org}`,
  conf: `conference-${org}`,
  ...over,
})
const count = (table: string) =>
  (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number })
    .n
/** Provisions as an operator and expects a refusal with no D1 row written. */
async function refused(v: ReturnType<typeof vars>, code = 'BAD_USER_INPUT') {
  const { body } = await gql(PROVISION, v, operator)
  expect(body.errors?.[0]?.extensions.code).toBe(code)
  for (const t of [
    'organizations',
    'conferences',
    'domains',
    'provisioning_requests',
  ])
    expect(count(t)).toBe(0)
  return body.errors[0].message as string
}
const RESOLVE = `query($host: String!) { tenantByHost(host: $host) { orgId conferenceId kind } }`

/** Provisions, then publishes the Conference (provisioning leaves a draft). */
async function provision(org = 'acme', key = 'k1') {
  const { body } = await gql(PROVISION, vars(org, key), operator)
  const created = body.data.provisionOrganization as { id: string }
  sqlite
    .prepare("UPDATE conferences SET lifecycle = 'live' WHERE org_id = ?")
    .run(created.id)
  return created
}
const conferenceOf = (orgId: string) =>
  (
    sqlite
      .prepare('SELECT id FROM conferences WHERE org_id = ?')
      .get(orgId) as { id: string }
  ).id

describe('organizations (#1973)', () => {
  const ORGS = '{ organizations { id slug createdAt } }'
  const page = async (args: string) =>
    (
      await gql(`{ organizations(${args}) { slug } }`, {}, operator)
    ).body.data.organizations.map((o: { slug: string }) => o.slug)

  it('is tagged operator', async () => {
    const { body } = await gql('{ _service { sdl } }')
    expect(body.data._service.sdl).toMatch(
      /conferences\(first: Int = 100, after: ID, lifecycle: ConferenceLifecycle, flag: RolloutFlag\): \[OperatorConference!\] @tag\(name: "operator"\)/,
    )
    expect(body.data._service.sdl).toMatch(
      /organizations\(first: Int = 100, after: String\): \[Organization!\] @tag\(name: "operator"\)/,
    )
  })

  it('lists every org by slug, with createdAt, to a PlatformContext', async () => {
    await provision('beta')
    await provision('acme', 'k2')
    const { body } = await gql(ORGS, {}, operator)
    expect(
      body.data.organizations.map((o: { slug: string }) => o.slug),
    ).toEqual(['acme', 'beta'])
    for (const o of body.data.organizations)
      expect(new Date(o.createdAt).toISOString()).toBe(o.createdAt)
  })

  it('pages by slug and clamps first to 1..100', async () => {
    await provision('beta')
    await provision('acme', 'k2')
    expect(await page('first: 1')).toEqual(['acme'])
    expect(await page('first: 1, after: "acme"')).toEqual(['beta'])
    expect(await page('after: "beta"')).toEqual([])
    expect(await page('first: 0')).toEqual(['acme'])
    expect(await page('first: -5')).toEqual(['acme'])
    for (let i = 0; i < 101; i++)
      sqlite
        .prepare(
          "INSERT INTO organizations (id, slug, name) VALUES (?, ?, 'x')",
        )
        .run(`o${i}`, `z${String(i).padStart(3, '0')}`)
    expect(await page('first: 100000')).toHaveLength(100)
    // No first: the default is the cap.
    expect(await page('after: "a"')).toHaveLength(100)
  })

  it.each([
    ['no envelope', undefined],
    ['a tenant envelope', organizer],
    [
      'an operator acting for a tenant',
      { ...organizer, orgRole: null, scopes: ['platform:operator'] },
    ],
  ] as [string, Envelope | undefined][])(
    'refuses %s with FORBIDDEN before any D1 read',
    async (_, as) => {
      await provision()
      // Sign first: only the request itself may touch D1.
      const signed = as && (await signer.sign(as))
      const prepare = vi.spyOn(env.DB, 'prepare')
      // organizations (#1973) and the cross-org conferences list (#1985).
      for (const q of [ORGS, '{ conferences { id } }']) {
        const { body } = await gql(q, {}, signed)
        expect(Object.values(body.data ?? {}).filter(Boolean), q).toEqual([])
        expect(body.errors[0].extensions.code, q).toBe('FORBIDDEN')
      }
      expect(prepare).not.toHaveBeenCalled()
    },
  )
})

describe('provisioning', () => {
  it('tags provisionOrganization operator, leaves setConferenceLifecycle public and every other mutation internal', async () => {
    const { body } = await gql('{ _service { sdl } }')
    const mutation = /type Mutation[^}]*}/.exec(body.data._service.sdl)![0]
    const fields = mutation.split('\n').filter((l) => /^\s+\w+\(/.test(l))
    expect(fields).toHaveLength(6)
    for (const f of fields)
      if (f.includes('setConferenceLifecycle(')) expect(f).not.toContain('@tag')
      else
        expect(f).toContain(
          f.includes('provisionOrganization(')
            ? '@tag(name: "operator")'
            : '@tag(name: "internal")',
        )
  })

  it('creates the Organization with edition and alias hosts', async () => {
    const org = await provision()
    for (const host of ['https://acme-2026.konf.run', 'ACME.konf.run:443']) {
      const { body } = await gql(RESOLVE, { host })
      expect(body.data.tenantByHost).toMatchObject({ orgId: org.id })
    }
  })

  it('is idempotent on the key', async () => {
    const a = await provision('acme', 'same')
    const b = await provision('acme', 'same')
    expect(b.id).toBe(a.id)
    // A replay writes nothing and does not re-read Sanity.
    expect(sanityFetch).toHaveBeenCalledTimes(1)
    // identity's ensure runs on the retry too, so a failed one heals.
    expect(identity.ensure.mock.calls).toEqual([
      [a.id, 'acme'],
      [a.id, 'acme'],
    ])
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM organizations').get(),
    ).toEqual({ n: 1 })
  })

  it('registers the Sanity ids, names and year, verified before writing', async () => {
    const org = await provision()
    expect(org.id).toBe('organization.acme')
    expect(
      sqlite.prepare('SELECT id, org_id, slug, name FROM conferences').all(),
    ).toEqual([
      {
        id: 'conference-acme',
        org_id: 'organization.acme',
        slug: '2026',
        name: 'Conf 2026',
      },
    ])
    expect(
      sqlite.prepare('SELECT hostname FROM domains ORDER BY hostname').all(),
    ).toEqual([
      { hostname: 'acme-2026.konf.run' },
      { hostname: 'acme.konf.run' },
    ])
    // The raw key is never stored, only sha256(key).
    const { idempotency_key } = sqlite
      .prepare('SELECT idempotency_key FROM provisioning_requests')
      .get() as { idempotency_key: string }
    expect(idempotency_key).toMatch(/^[0-9a-f]{64}$/)
    const [req] = sanityRequests
    expect(req.url).toBe('https://p.api.sanity.io/v2023-05-03/data/query/d')
    expect(req.headers.get('authorization')).toBe('Bearer token')
    expect(((await req.json()) as { params: unknown }).params).toEqual({
      orgId: 'organization.acme',
      conferenceId: 'conference-acme',
    })
  })

  it('takes the edition year from the Sanity host, not startDate', async () => {
    sanity.confs['conference-acme'].startDate = '2027-01-15'
    await provision()
    expect(sqlite.prepare('SELECT slug FROM conferences').get()).toEqual({
      slug: '2026',
    })
  })

  it("refuses another org's conference", async () => {
    expect(
      await refused(vars('acme', 'k', { conf: 'conference-other' })),
    ).toContain('in this organization')
  })

  it('refuses a platform host missing from conference.domains', async () => {
    sanity.confs['conference-acme'].domains = ['acme-2026.konf.run']
    expect(await refused(vars())).toContain(
      'acme.konf.run is not in conference.domains',
    )
    sanity.confs['conference-acme'].domains = ['acme.konf.run']
    await refused(vars())
  })

  it('refuses a draft org or conference', async () => {
    // Only the drafts exist: the published-only query finds nothing.
    sanity = tenantDocs()
    delete sanity.orgs['organization.acme']
    await refused(vars())
    sanity = tenantDocs()
    delete sanity.confs['conference-acme']
    await refused(vars())
    // A draft id is refused before Sanity is asked.
    sanityFetch.mockClear()
    await refused(vars('acme', 'k', { conf: 'drafts.conference-acme' }))
    expect(sanityFetch).not.toHaveBeenCalled()
  })

  it('refuses an org whose Sanity slug differs', async () => {
    sanity.orgs['organization.acme'].slug = 'acme-old'
    await refused(vars())
  })

  it('fails closed on an empty, unauthorized or broken Sanity read', async () => {
    // Unauthenticated GROQ answers 200 with nothing in it.
    sanityFetch.mockResolvedValueOnce(
      Response.json({ result: { org: null, conf: null } }),
    )
    await refused(vars())
    sanityFetch.mockResolvedValueOnce(Response.json({ result: [] }))
    await refused(vars())
    sanityFetch.mockResolvedValueOnce(Response.json({}))
    expect(await refused(vars(), 'INTERNAL_SERVER_ERROR')).toMatch(
      /^Sanity read failed/,
    )
    sanityFetch.mockResolvedValueOnce(new Response('no', { status: 401 }))
    expect(await refused(vars(), 'INTERNAL_SERVER_ERROR')).toMatch(
      /^Sanity read failed/,
    )
    sanityFetch.mockRejectedValueOnce(new TypeError('network'))
    expect(await refused(vars(), 'INTERNAL_SERVER_ERROR')).toMatch(
      /^Sanity read failed/,
    )
  })

  it('refuses without a read token, before asking Sanity', async () => {
    delete env.SANITY_API_TOKEN_READ
    expect(await refused(vars(), 'INTERNAL_SERVER_ERROR')).toContain(
      'not configured',
    )
    expect(sanityFetch).not.toHaveBeenCalled()
  })

  it('refuses a conference without a start date', async () => {
    sanity.confs['conference-acme'].startDate = null
    expect(await refused(vars())).toContain('start date')
  })

  it('refuses an orgId that is not organization.<slug>', async () => {
    // Legacy ids go through the backfill only.
    await refused(
      vars('cloud-native-days', 'k', {
        orgId: 'organization-cloud-native-days',
      }),
    )
    await refused(vars('acme', 'k', { orgId: 'organization.other' }))
    expect(sanityFetch).not.toHaveBeenCalled()
  })

  it('refuses a replayed key with different arguments', async () => {
    await provision('acme', 'same')
    for (const v of [
      vars('other', 'same'),
      vars('acme', 'same', { conf: 'conference-other' }),
    ]) {
      const { body } = await gql(PROVISION, v, operator)
      expect(body.errors[0].extensions.code).toBe('CONFLICT')
    }
    expect(count('organizations')).toBe(1)
    expect(count('domains')).toBe(2)
  })

  it('refuses callers without a PlatformContext', async () => {
    for (const as of [undefined, organizer]) {
      const { body } = await gql(PROVISION, vars('acme', 'k'), as)
      expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
    }
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM organizations').get(),
    ).toEqual({ n: 0 })
  })

  it('rejects a forged envelope before any resolver runs', async () => {
    const { status } = await gql(
      RESOLVE,
      { host: 'acme.konf.run' },
      'not-a-jwt',
    )
    expect(status).toBe(403)
  })

  it('repoints the latest-edition alias', async () => {
    const org = await provision()
    sqlite
      .prepare(
        "INSERT INTO conferences (id, org_id, slug, name, lifecycle) VALUES ('c2', ?, '2027', 'Conf 2027', 'live')",
      )
      .run(org.id)
    await gql(
      `mutation { repointAlias(conferenceId: "c2") { id } }`,
      {},
      operator,
    )
    const { body } = await gql(RESOLVE, { host: 'acme.konf.run' })
    expect(body.data.tenantByHost.conferenceId).toBe('c2')
  })
})

describe('anonymous resolution', () => {
  it('hides a draft Conference and its hosts', async () => {
    const org = await provision()
    const confId = conferenceOf(org.id)
    sqlite
      .prepare("UPDATE conferences SET lifecycle = 'draft' WHERE id = ?")
      .run(confId)
    const conf = `query($id: ID!) { conference(id: $id) { id } }`
    expect((await gql(conf, { id: confId })).body.data.conference).toBeNull()
    const host = { host: 'acme-2026.konf.run' }
    expect((await gql(RESOLVE, host)).body.data.tenantByHost).toBeNull()
    expect(
      (await gql(conf, { id: confId }, operator)).body.data.conference,
    ).toEqual({ id: confId })
    expect(
      (await gql(RESOLVE, host, operator)).body.data.tenantByHost,
    ).toMatchObject({ orgId: org.id })
  })

  it('does not resolve an unverified custom domain', async () => {
    const org = await provision()
    hostnames.create.mockResolvedValue({ id: 'cf1', verification: 'pending' })
    const add = `mutation($c: ID!) { addCustomDomain(conferenceId: $c, hostname: "conf.acme.org") { verification } }`
    const { body } = await gql(add, { c: conferenceOf(org.id) }, operator)
    expect(body.data.addCustomDomain.verification).toBe('pending')
    expect(hostnames.create).toHaveBeenCalledWith('conf.acme.org')

    expect(
      (await gql(RESOLVE, { host: 'conf.acme.org' })).body.data.tenantByHost,
    ).toBeNull()
    expect(
      (await gql(RESOLVE, { host: 'conf.acme.org' }, operator)).body.data
        .tenantByHost,
    ).toMatchObject({ kind: 'custom' })

    hostnames.get.mockResolvedValue('verified')
    await gql(
      `mutation { refreshCustomDomain(hostname: "conf.acme.org") { verification } }`,
      {},
      operator,
    )
    expect(hostnames.get).toHaveBeenCalledWith('cf1')
    expect(
      (await gql(RESOLVE, { host: 'conf.acme.org' })).body.data.tenantByHost,
    ).toMatchObject({
      orgId: org.id,
    })
  })

  it('does not resolve hosts or conferences of a suspended Organization', async () => {
    const org = await provision()
    const confId = conferenceOf(org.id)
    sqlite
      .prepare("UPDATE organizations SET status = 'suspended' WHERE id = ?")
      .run(org.id)
    expect(
      (await gql(RESOLVE, { host: 'acme.konf.run' })).body.data.tenantByHost,
    ).toBeNull()
    const conf = `query($id: ID!) { conference(id: $id) { id } }`
    expect((await gql(conf, { id: confId })).body.data.conference).toBeNull()
    expect(
      (await gql(conf, { id: confId }, operator)).body.data.conference,
    ).toEqual({ id: confId })
  })

  it('returns null for unknown hosts', async () => {
    expect(
      (await gql(RESOLVE, { host: 'nope.example' })).body.data.tenantByHost,
    ).toBeNull()
  })
})

describe('custom domains', () => {
  it('enforces one routing claim per hostname', async () => {
    const a = await provision('acme', 'k1')
    const b = await provision('beta', 'k2')
    hostnames.create.mockResolvedValue({ id: 'cf1', verification: 'pending' })
    const add = `mutation($c: ID!) { addCustomDomain(conferenceId: $c, hostname: "conf.example.org") { hostname } }`
    expect(
      (await gql(add, { c: conferenceOf(a.id) }, operator)).body.errors,
    ).toBeUndefined()
    const { body } = await gql(add, { c: conferenceOf(b.id) }, operator)
    expect(body.errors[0].extensions.code).toBe('CONFLICT')
    expect(hostnames.create).toHaveBeenCalledTimes(1)
  })

  it('refuses platform hostnames and releases the claim when Cloudflare fails', async () => {
    const org = await provision()
    const c = conferenceOf(org.id)
    const add = `mutation($c: ID!, $h: String!) { addCustomDomain(conferenceId: $c, hostname: $h) { hostname } }`
    expect(
      (await gql(add, { c, h: 'evil.konf.run' }, operator)).body.errors[0]
        .extensions.code,
    ).toBe('BAD_USER_INPUT')

    hostnames.create.mockRejectedValueOnce(new Error('cloudflare down'))
    expect(
      (await gql(add, { c, h: 'conf.acme.org' }, operator)).body.errors,
    ).toBeDefined()
    hostnames.create.mockResolvedValue({ id: 'cf2', verification: 'pending' })
    expect(
      (await gql(add, { c, h: 'conf.acme.org' }, operator)).body.errors,
    ).toBeUndefined()
  })
})

describe('reserved slugs', () => {
  it.each(['auth', 'www', 'api'])('refuses org slug %s', async (org) => {
    const { body } = await gql(PROVISION, vars(org, org), operator)
    expect(body.errors[0]).toMatchObject({
      message: expect.stringContaining('reserved'),
      extensions: { code: 'BAD_USER_INPUT' },
    })
  })
})

describe('cron', () => {
  const at = (iso: string) =>
    ({ scheduledTime: Date.parse(iso) }) as ScheduledController
  const tick = () => worker.scheduled!(at('2026-11-04T10:05:00Z'), env)

  it('mirrors Cloudflare status for pending custom domains only', async () => {
    const org = await provision()
    const add = `mutation($c: ID!, $h: String!) { addCustomDomain(conferenceId: $c, hostname: $h) { hostname } }`
    const c = conferenceOf(org.id)
    hostnames.create.mockResolvedValueOnce({
      id: 'cf1',
      verification: 'pending',
    })
    await gql(add, { c, h: 'a.example.org' }, operator)
    hostnames.create.mockResolvedValueOnce({
      id: 'cf2',
      verification: 'pending',
    })
    await gql(add, { c, h: 'b.example.org' }, operator)
    hostnames.get.mockImplementation(async (id) => {
      if (id === 'cf2') throw new Error('cloudflare down')
      return 'verified'
    })

    await tick()
    expect(hostnames.get).toHaveBeenCalledTimes(2)
    const resolve = async (host: string) =>
      (await gql(RESOLVE, { host })).body.data.tenantByHost
    expect(await resolve('a.example.org')).toMatchObject({ orgId: org.id })
    expect(await resolve('b.example.org')).toBeNull()

    // Platform hosts and freshly verified domains are not polled; failures retry.
    hostnames.get.mockReset()
    hostnames.get.mockResolvedValue('verified')
    await tick()
    expect(hostnames.get.mock.calls).toEqual([['cf2']])

    // An hour later the verified one is re-checked, and a moved hostname
    // stops resolving.
    vi.useFakeTimers({ now: Date.now() + 61 * 60 * 1000, toFake: ['Date'] })
    try {
      hostnames.get.mockReset()
      hostnames.get.mockResolvedValue('failed')
      await tick()
      expect(hostnames.get.mock.calls.flat().sort()).toEqual(['cf1', 'cf2'])
    } finally {
      vi.useRealTimers()
    }
    expect(await resolve('a.example.org')).toBeNull()
  })
})

describe('cron: identity membership sync (#1907)', () => {
  const at = (iso: string) =>
    ({ scheduledTime: Date.parse(iso) }) as ScheduledController

  it('calls identity only on the run scheduled at minute 0, whatever the clock says', async () => {
    for (const m of ['05', '10', '55']) {
      await worker.scheduled!(at(`2026-11-04T10:${m}:00Z`), env)
    }
    expect(identity.syncMembers).not.toHaveBeenCalled()
    // A late start keeps its scheduledTime: still the hourly run.
    vi.useFakeTimers({
      now: Date.parse('2026-11-04T11:03:00Z'),
      toFake: ['Date'],
    })
    try {
      await worker.scheduled!(at('2026-11-04T11:00:00Z'), env)
    } finally {
      vi.useRealTimers()
    }
    expect(identity.syncMembers).toHaveBeenCalledTimes(1)
  })

  it('a throwing sync is logged without emails and the directory work still ran', async () => {
    const org = await provision()
    hostnames.create.mockResolvedValueOnce({
      id: 'cf1',
      verification: 'pending',
    })
    await gql(
      `mutation($c: ID!, $h: String!) { addCustomDomain(conferenceId: $c, hostname: $h) { hostname } }`,
      { c: conferenceOf(org.id), h: 'a.example.org' },
      operator,
    )
    hostnames.get.mockResolvedValue('verified')
    identity.syncMembers.mockRejectedValue(new Error('boom ann@example.org'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        worker.scheduled!(at('2026-11-04T12:00:00Z'), env),
      ).resolves.toBeUndefined()
      expect(hostnames.get).toHaveBeenCalledTimes(1)
      const logged = err.mock.calls.map((c) => String(c[0])).join('\n')
      expect(logged).toContain('"event":"identity.membership.sync_failed"')
      expect(logged).not.toContain('@')
    } finally {
      err.mockRestore()
    }
  })

  it('binds identity Organizations in every env and keeps one cron', () => {
    const cfg = readFileSync(
      new URL('../wrangler.jsonc', import.meta.url),
      'utf8',
    )
    expect(cfg.match(/"entrypoint": "Organizations"/g)).toHaveLength(3)
    expect(cfg).toContain('"service": "konf-identity-preview"')
    expect(cfg.match(/"crons"/g)).toHaveLength(1)
  })
})

describe('custom domain rollback and removal', () => {
  const add = `mutation($c: ID!, $h: String!) { addCustomDomain(conferenceId: $c, hostname: $h) { hostname } }`

  it('deletes the Cloudflare hostname when the D1 update fails, then retries cleanly', async () => {
    const c = conferenceOf((await provision()).id)
    hostnames.create.mockResolvedValue({ id: 'cf1', verification: 'pending' })
    sqlite.exec(`CREATE TRIGGER fail_update BEFORE UPDATE ON domains
      WHEN NEW.cf_custom_hostname_id IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'd1 down'); END`)
    expect(
      (await gql(add, { c, h: 'conf.acme.org' }, operator)).body.errors,
    ).toBeDefined()
    expect(hostnames.delete).toHaveBeenCalledWith('cf1')

    sqlite.exec('DROP TRIGGER fail_update')
    expect(
      (await gql(add, { c, h: 'conf.acme.org' }, operator)).body.errors,
    ).toBeUndefined()
  })

  it('removeCustomDomain deletes both sides and needs a PlatformContext', async () => {
    const c = conferenceOf((await provision()).id)
    hostnames.create.mockResolvedValue({ id: 'cf1', verification: 'pending' })
    await gql(add, { c, h: 'conf.acme.org' }, operator)
    const remove = `mutation { removeCustomDomain(hostname: "conf.acme.org") { hostname } }`

    expect(
      (await gql(remove, {}, organizer)).body.errors[0].extensions.code,
    ).toBe('FORBIDDEN')
    expect((await gql(remove, {}, operator)).body.errors).toBeUndefined()
    expect(hostnames.delete).toHaveBeenCalledWith('cf1')
    expect(
      (await gql(RESOLVE, { host: 'conf.acme.org' }, operator)).body.data
        .tenantByHost,
    ).toBeNull()
  })
})

describe('rollout flags (#1925)', () => {
  const FLAGS = `query($host: String!) { tenantByHost(host: $host) { conferenceId flags { apiRead identityLogin d1Write d1Override } } }`
  const off = {
    apiRead: false,
    identityLogin: false,
    d1Write: false,
    d1Override: false,
  }

  it("returns the host's own conference flags, never another's", async () => {
    const a = await provision('acme', 'ka')
    const b = await provision('beta', 'kb')
    sqlite
      .prepare(
        'UPDATE conferences SET api_read = 1, d1_override = 1 WHERE id = ?',
      )
      .run(conferenceOf(a.id))
    const got = async (host: string) =>
      (await gql(FLAGS, { host })).body.data.tenantByHost
    expect(await got('acme.konf.run')).toEqual({
      conferenceId: conferenceOf(a.id),
      flags: { ...off, apiRead: true, d1Override: true },
    })
    expect(await got('beta.konf.run')).toEqual({
      conferenceId: conferenceOf(b.id),
      flags: off,
    })
  })

  it('exposes no way to write a flag, and tags the field internal', async () => {
    const { body } = await gql('{ _service { sdl } }')
    const sdl: string = body.data._service.sdl
    const mutation = /type Mutation[^}]*}/.exec(sdl)![0]
    expect(mutation).not.toMatch(
      /apiRead|identityLogin|d1Write|d1Override|flags/i,
    )
    expect(sdl).not.toMatch(/^input /m)
    expect(sdl).toMatch(/flags: RolloutFlags @tag\(name: "internal"\)/)
  })

  it('backfills CNDN 2026 and nothing else', async () => {
    const org = await provision()
    sqlite
      .prepare(
        "INSERT INTO conferences (id, org_id, slug, name, lifecycle) VALUES ('eb7b16c6-00fa-44a0-adcd-4a480de34242', ?, '2026x', 'CNDN', 'live')",
      )
      .run(org.id)
    sqlite.exec(
      readFileSync(
        new URL(
          '../migrations/0003_backfill_cndn_2026_flags.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    const rows = sqlite
      .prepare(
        'SELECT id, api_read, identity_login, d1_write, d1_override FROM conferences ORDER BY id',
      )
      .all()
    expect(rows).toEqual(
      [
        {
          id: conferenceOf(org.id),
          api_read: 0,
          identity_login: 0,
          d1_write: 0,
          d1_override: 0,
        },
        {
          id: 'eb7b16c6-00fa-44a0-adcd-4a480de34242',
          api_read: 1,
          identity_login: 1,
          d1_write: 1,
          d1_override: 0,
        },
      ].sort((x, y) => x.id.localeCompare(y.id)),
    )
  })
})

describe('lifecycle override (#1997)', () => {
  const SET = `mutation($s: ConferenceLifecycleOverride) { setConferenceLifecycle(status: $s) { id lifecycleStatus } }`
  const READ = `{ conferenceLifecycle }`
  const lifecycle = (id: string) =>
    (
      sqlite
        .prepare('SELECT lifecycle FROM conferences WHERE id = ?')
        .get(id) as {
        lifecycle: string
      }
    ).lifecycle
  async function setup() {
    const org = await provision()
    const confId = conferenceOf(org.id)
    const as: Envelope = {
      typ: 'tenant',
      orgId: org.id,
      conferenceId: confId,
      userId: 'u',
      orgRole: 'admin',
      scopes: [],
    }
    return { org, confId, as }
  }

  it('lets an org admin cancel, archive and clear back to live', async () => {
    const { confId, as } = await setup()
    for (const s of ['cancelled', 'archived', null]) {
      const { body } = await gql(SET, { s }, as)
      expect(body.data.setConferenceLifecycle).toEqual({
        id: confId,
        lifecycleStatus: s ?? 'live',
      })
      expect(lifecycle(confId)).toBe(s ?? 'live')
    }
  })

  it('keeps a draft a draft when the override is cleared', async () => {
    const { confId, as } = await setup()
    sqlite
      .prepare("UPDATE conferences SET lifecycle = 'draft' WHERE id = ?")
      .run(confId)
    await gql(SET, { s: null }, as)
    expect(lifecycle(confId)).toBe('draft')
  })

  it.each([
    ['anonymous', undefined],
    ['a member without a writer role', { orgRole: 'member' }],
    ['no user', { userId: null }],
  ])('refuses %s before touching D1', async (_, over) => {
    const { confId, as } = await setup()
    const { body } = await gql(
      SET,
      { s: 'cancelled' },
      over && ({ ...as, ...over } as Envelope),
    )
    expect(body.errors?.[0]?.extensions.code).toBe('FORBIDDEN')
    expect(lifecycle(confId)).toBe('live')
  })

  it("never writes another org's conference", async () => {
    const { confId, as } = await setup()
    const { body } = await gql(
      SET,
      { s: 'cancelled' },
      { ...as, orgId: 'organization.beta' },
    )
    expect(body.data.setConferenceLifecycle).toBeNull()
    expect(lifecycle(confId)).toBe('live')
  })

  it('reads the override publicly, but a draft only for members', async () => {
    const { confId, as } = await setup()
    const anon = { ...as, userId: null, orgRole: null }
    await gql(SET, { s: 'cancelled' }, as)
    expect((await gql(READ, {}, anon)).body.data.conferenceLifecycle).toBe(
      'cancelled',
    )
    sqlite
      .prepare("UPDATE conferences SET lifecycle = 'draft' WHERE id = ?")
      .run(confId)
    expect((await gql(READ, {}, anon)).body.data.conferenceLifecycle).toBeNull()
    expect((await gql(READ, {}, as)).body.data.conferenceLifecycle).toBe(
      'draft',
    )
  })
})

describe('migration 0005', () => {
  it('rebuilds conferences keeping rows, flags and domain references', () => {
    const db = new DatabaseSync(':memory:')
    const m = (f: string) =>
      readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')
    db.exec(
      m('0001_init.sql') +
        m('0002_rollout_flags.sql') +
        m('0004_org_created_at.sql'),
    )
    db.exec(`INSERT INTO organizations (id, slug, name) VALUES ('o', 'o', 'O');
      INSERT INTO conferences (id, org_id, slug, name, lifecycle, d1_write) VALUES ('c', 'o', '2026', 'C', 'archived', 1);
      INSERT INTO domains (hostname, org_id, conference_id, kind, verification) VALUES ('h', 'o', 'c', 'custom', 'verified');`)
    db.exec('BEGIN')
    db.exec(m('0005_lifecycle_cancelled.sql'))
    db.exec('COMMIT')
    expect(
      db.prepare('SELECT id, lifecycle, d1_write FROM conferences').all(),
    ).toEqual([{ id: 'c', lifecycle: 'archived', d1_write: 1 }])
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    // foreign_key_check is also empty for an empty domains table: pin the row.
    expect(
      db
        .prepare(
          'SELECT hostname, org_id, conference_id, kind, verification FROM domains',
        )
        .all(),
    ).toEqual([
      {
        hostname: 'h',
        org_id: 'o',
        conference_id: 'c',
        kind: 'custom',
        verification: 'verified',
      },
    ])
    db.exec("UPDATE conferences SET lifecycle = 'cancelled'")
    expect(() => db.exec("UPDATE conferences SET lifecycle = 'gone'")).toThrow(
      /CHECK/,
    )
  })

  it('never destroys a domains_park left by a half-applied run', () => {
    const db = new DatabaseSync(':memory:')
    const m = (f: string) =>
      readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')
    db.exec(
      m('0001_init.sql') +
        m('0002_rollout_flags.sql') +
        m('0004_org_created_at.sql'),
    )
    db.exec(`CREATE TABLE domains_park AS SELECT * FROM domains;
      INSERT INTO domains_park (hostname, org_id, conference_id, kind, verification) VALUES ('only-copy', 'o', 'c', 'custom', 'verified');`)
    expect(() => db.exec(m('0005_lifecycle_cancelled.sql'))).toThrow(
      /domains_park/,
    )
    expect(db.prepare('SELECT hostname FROM domains_park').all()).toEqual([
      { hostname: 'only-copy' },
    ])
  })
})

describe('primaryHost (#1977)', () => {
  const domainReads = (prepare: { mock: { calls: unknown[][] } }) =>
    prepare.mock.calls.filter(([q]) => /from "domains"/i.test(String(q))).length

  it('reads domains once for a whole operator page, across orgs', async () => {
    await provision('acme')
    await provision('beta', 'k2')
    const prepare = vi.spyOn(env.DB, 'prepare')
    const { body } = await gql(
      '{ conferences { id edition { primaryHost } } }',
      {},
      operator,
    )
    expect(body.errors).toBeUndefined()
    expect(
      body.data.conferences.map(
        (c: { edition: { primaryHost: string } }) => c.edition.primaryHost,
      ),
    ).toEqual(['acme-2026.konf.run', 'beta-2026.konf.run'])
    expect(domainReads(prepare)).toBe(1)
  })

  it('reads domains once for many editions of one org', async () => {
    const { id } = await provision('acme')
    const conf = conferenceOf(id)
    sqlite
      .prepare(
        "INSERT INTO conferences (id, org_id, slug, name, lifecycle) VALUES ('c2', ?, 'c2', 'c2', 'live')",
      )
      .run(id)
    const prepare = vi.spyOn(env.DB, 'prepare')
    const { body } = await gql(
      'query($r: [_Any!]!) { _entities(representations: $r) { ... on ConferenceEdition { id primaryHost } } }',
      {
        r: [conf, 'c2'].map((i) => ({
          __typename: 'ConferenceEdition',
          id: i,
        })),
      },
      { ...organizer, orgId: id },
    )
    expect(body.errors).toBeUndefined()
    expect(body.data._entities).toEqual([
      { id: conf, primaryHost: 'acme-2026.konf.run' },
      { id: 'c2', primaryHost: null },
    ])
    expect(domainReads(prepare)).toBe(1)
  })
})
