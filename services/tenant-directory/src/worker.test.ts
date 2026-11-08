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
import { exportJWK, exportSPKI, generateKeyPair } from 'jose'
import type { CustomHostnames } from './data/cloudflare'
import { createData, hashSignupCode } from './data'
import { verifyServiceAssertion } from '../../../src/lib/provisioning/service'

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
  memberships: vi.fn(
    async (): Promise<{ orgId: string; role: string }[]> => [],
  ),
  audit: vi.fn(async (): Promise<void> => undefined),
  signupOwner: vi.fn(async (): Promise<void> => undefined),
}
const signupLimit = { limit: vi.fn(async () => ({ success: true })) }
const conferenceRpc = { ticketed: vi.fn(async () => false) }
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
  for (const org of ['acme', 'bravo', 'other']) {
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

// The site's provisioning route (src/lib/provisioning/service.ts verifies the
// real assertion): writes Sanity docs into `sanity`, once per key.
const SITE = 'https://auth.konf.app'
const signing = await generateKeyPair('EdDSA', { extractable: true })
const signingJwk = JSON.stringify({
  ...(await exportJWK(signing.privateKey)),
  kid: 'td1',
})
const sitePublicKeys = JSON.stringify({
  td1: await exportSPKI(signing.publicKey),
})
const site = {
  receipts: new Map<string, { organizationId: string; conferenceId: string }>(),
  writes: 0,
  /** Fail AFTER the Sanity write, as a lost response would. */
  fail: false,
  operators: [] as string[],
}
async function fakeSite(req: Request): Promise<Response> {
  const raw = await req.text()
  const op = await verifyServiceAssertion(
    req.headers.get('x-konf-service'),
    sitePublicKeys,
    raw,
  )
  if (!op) return Response.json({ error: 'unauthorized' }, { status: 401 })
  site.operators.push(op)
  if (new URL(req.url).pathname === '/api/provisioning/service/conferences')
    return fakeEditionSite(JSON.parse(raw), op)
  const { idempotencyKey, input } = JSON.parse(raw)
  let out = site.receipts.get(idempotencyKey)
  if (!out) {
    const claimed = Object.values(sanity.confs).flatMap((c) => c.domains ?? [])
    if (sanity.orgs[`organization.${input.slug}`])
      return Response.json({ code: 'slug_taken' }, { status: 409 })
    if (input.domain && claimed.includes(input.domain))
      return Response.json({ code: 'domain_claimed' }, { status: 409 })
    out = {
      organizationId: `organization.${input.slug}`,
      conferenceId: `conference-${site.receipts.size}-${input.slug}`,
    }
    sanity.orgs[out.organizationId] = { slug: input.slug, name: input.name }
    const year = input.startDate.slice(0, 4)
    sanity.confs[out.conferenceId] = {
      orgRef: out.organizationId,
      title: input.conferenceTitle,
      startDate: input.startDate,
      domains: [
        `${input.slug}-${year}.konf.run`,
        `${input.slug}.konf.run`,
        ...(input.domain ? [input.domain] : []),
      ],
    }
    site.receipts.set(idempotencyKey, out)
    site.writes++
  }
  if (site.fail) return new Response('gateway timeout', { status: 504 })
  return Response.json(out)
}
// The site's edition route: input-hashed receipt, copyFrom kept in orgId.
const editions = new Map<
  string,
  { hash: string; out: { conferenceId: string; domains: string[] } }
>()
function fakeEditionSite(
  {
    idempotencyKey,
    orgId,
    input,
  }: {
    idempotencyKey: string
    orgId: string
    input: Record<string, string | null>
  },
  op: string,
) {
  const hash = JSON.stringify([orgId, input, op])
  const done = editions.get(idempotencyKey)
  if (done)
    return done.hash === hash
      ? Response.json({ ...done.out, replayed: true })
      : Response.json({ code: 'idempotency_conflict' }, { status: 409 })
  if (input.copyFrom && sanity.confs[input.copyFrom]?.orgRef !== orgId)
    return Response.json({ code: 'copy_from_not_in_org' }, { status: 409 })
  const claimed = Object.values(sanity.confs).flatMap((c) => c.domains ?? [])
  if (input.domain && claimed.includes(input.domain))
    return Response.json({ code: 'domain_claimed' }, { status: 409 })
  const slug = sanity.orgs[orgId]!.slug
  const out = {
    conferenceId: `conference-e${editions.size}`,
    domains: [
      `${slug}-${input.startDate!.slice(0, 4)}.konf.run`,
      ...(input.domain ? [input.domain] : []),
    ],
  }
  sanity.confs[out.conferenceId] = {
    orgRef: orgId,
    title: input.title,
    startDate: input.startDate,
    domains: out.domains,
  }
  editions.set(idempotencyKey, { hash, out })
  site.writes++
  return Response.json(out)
}
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
      ) +
      readFileSync(
        new URL(
          '../migrations/0006_provisioning_conference.sql',
          import.meta.url,
        ),
        'utf8',
      ) +
      readFileSync(
        new URL(
          '../migrations/0007_provisioning_created_by.sql',
          import.meta.url,
        ),
        'utf8',
      ) +
      readFileSync(
        new URL('../migrations/0008_billing_plan.sql', import.meta.url),
        'utf8',
      ) +
      readFileSync(
        new URL('../migrations/0009_comp_existing_orgs.sql', import.meta.url),
        'utf8',
      ) +
      readFileSync(
        new URL('../migrations/0010_org_kind.sql', import.meta.url),
        'utf8',
      ) +
      readFileSync(
        new URL('../migrations/0011_billing_signup.sql', import.meta.url),
        'utf8',
      ),
  )
  env = {
    DB: d1(sqlite),
    GATEWAY_PUBLIC_KEY: keys.publicPem,
    CF_API_TOKEN: 'unused',
    CF_ZONE_ID: 'unused',
    IDENTITY: identity,
    CONFERENCE: conferenceRpc,
    SIGNUP_LIMIT: signupLimit as unknown as RateLimit,
    SANITY_PROJECT_ID: 'p',
    SANITY_DATASET: 'd',
    SANITY_API_TOKEN_READ: 'token',
    SITE_URL: SITE,
    PROVISIONING_SIGNING_KEY: signingJwk,
  }
  sanity = tenantDocs()
  site.receipts.clear()
  editions.clear()
  site.writes = 0
  site.fail = false
  site.operators = []
  sanityFetch.mockReset()
  sanityRequests = []
  sanityFetch.mockImplementation(async (url, init) => {
    // A Request at runtime; workers-types and Node disagree on its type.
    const req = new Request(url as unknown as string, init)
    if (req.url.startsWith(SITE)) return fakeSite(req)
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
  identity.audit.mockReset()
  identity.signupOwner.mockReset()
  signupLimit.limit.mockReset()
  signupLimit.limit.mockResolvedValue({ success: true })
  conferenceRpc.ticketed.mockReset()
  conferenceRpc.ticketed.mockResolvedValue(false)
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
    await provision('bravo')
    await provision('acme', 'k2')
    const { body } = await gql(ORGS, {}, operator)
    expect(
      body.data.organizations.map((o: { slug: string }) => o.slug),
    ).toEqual(['acme', 'bravo'])
    for (const o of body.data.organizations)
      expect(new Date(o.createdAt).toISOString()).toBe(o.createdAt)
  })

  it('pages by slug and clamps first to 1..100', async () => {
    await provision('bravo')
    await provision('acme', 'k2')
    expect(await page('first: 1')).toEqual(['acme'])
    expect(await page('first: 1, after: "acme"')).toEqual(['bravo'])
    expect(await page('after: "bravo"')).toEqual([])
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
    expect(fields).toHaveLength(13)
    for (const f of fields)
      if (
        f.includes('setConferenceLifecycle(') ||
        f.includes('provisionConference(') ||
        f.includes('startCheckout(') ||
        f.includes('signUpOrganization(')
      )
        expect(f).not.toContain('@tag')
      else
        expect(f).toContain(
          f.includes('provisionOrganization(') ||
            f.includes('createOrganization(') ||
            f.includes('setComplimentaryPlan(') ||
            f.includes('createSignupCode(') ||
            f.includes('revokeSignupCode(')
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

  // #1957: a later edition of the same org, already in D1, must not turn a
  // replay with another conference into a silent no-op.
  it('refuses a replayed key naming another conference of the same org', async () => {
    await provision('acme', 'same')
    sqlite.exec(
      "INSERT INTO conferences (id, org_id, slug, name, lifecycle) VALUES ('conference-acme-2027', 'organization.acme', '2027', 'Acme 2027', 'draft')",
    )
    const { body } = await gql(
      PROVISION,
      vars('acme', 'same', { conf: 'conference-acme-2027' }),
      operator,
    )
    expect(body.errors[0].extensions.code).toBe('CONFLICT')
    expect(sanityFetch).toHaveBeenCalledTimes(1)
  })

  it("refuses a replay whose conference has moved to the caller's org (the org check alone)", async () => {
    await provision('bravo', 'bravo-key')
    await provision('acme', 'same')
    // Only reachable by a later D1 change: the key's conference now belongs
    // to bravo, so the conference checks pass and the org check must refuse.
    sqlite.exec(
      "UPDATE conferences SET org_id = 'organization.bravo', slug = 'moved' WHERE id = 'conference-acme'",
    )
    const { body } = await gql(
      PROVISION,
      vars('bravo', 'same', { conf: 'conference-acme' }),
      operator,
    )
    expect(body.errors[0].extensions.code).toBe('CONFLICT')
  })

  it('refuses conference.domains with two dated platform hosts', async () => {
    sanity.confs['conference-acme'].domains = [
      'acme-2025.konf.run',
      'acme-2026.konf.run',
      'acme.konf.run',
    ]
    expect(await refused(vars())).toContain(
      'conference.domains needs exactly one acme-<year>.konf.run host',
    )
  })

  it('bounds the Sanity read with a timeout', async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort(new DOMException('t', 'TimeoutError')))
    sanityFetch.mockImplementationOnce(async (_url, init) => {
      if (init?.signal?.aborted) throw init.signal.reason
      return Response.json({ result: { org: null, conf: null } })
    })
    expect(await refused(vars(), 'INTERNAL_SERVER_ERROR')).toBe(
      'Sanity read failed',
    )
    expect(timeout).toHaveBeenCalledWith(5000)
    timeout.mockRestore()
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
    const b = await provision('bravo', 'k2')
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
    const b = await provision('bravo', 'kb')
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
    expect(await got('bravo.konf.run')).toEqual({
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
    // The only input types are provisioning and sign-up; none has a flag.
    const inputs = sdl.match(/^input [^}]*}/gm) ?? []
    expect(inputs.map((i) => i.split(' ')[1]).sort()).toEqual([
      'CreateOrganizationInput',
      'ProvisionConferenceInput',
      'SignupOrganizationInput',
    ])
    for (const i of inputs)
      expect(i).not.toMatch(/apiRead|identityLogin|d1Write|d1Override|flags/i)
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
    // Authz phase 1 (#2106): the site lane is not a lifecycle writer.
    ['the site lane', { userId: null, orgRole: null, scopes: ['site:server'] }],
    ['an unknown role', { orgRole: 'guest' }],
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
      { ...as, orgId: 'organization.bravo' },
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
    // Authz phase 1 (#2106): not to the site lane alone; a member, yes.
    const site = { ...anon, scopes: ['site:server'] }
    expect((await gql(READ, {}, site)).body.data.conferenceLifecycle).toBeNull()
    expect(
      (await gql(READ, {}, { ...as, orgRole: 'member' })).body.data
        .conferenceLifecycle,
    ).toBe('draft')
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
    await provision('bravo', 'k2')
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
    ).toEqual(['acme-2026.konf.run', 'bravo-2026.konf.run'])
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

describe('myOrganizations (#2036, #2043)', () => {
  it('chunks queries in batches of 90 and returns all 150 org memberships', async () => {
    const userEnvelope: Envelope = { typ: 'user', userId: 'user-150' }
    const memberships = Array.from({ length: 150 }, (_, i) => ({
      orgId: `org-${String(i).padStart(3, '0')}`,
      role: i % 2 === 0 ? 'admin' : 'member',
    }))
    identity.memberships.mockResolvedValueOnce(memberships)

    const insertOrg = sqlite.prepare(
      "INSERT INTO organizations (id, slug, name, status, plan) VALUES (?, ?, ?, 'active', 'free')",
    )
    for (const m of memberships) {
      insertOrg.run(m.orgId, `slug-${m.orgId}`, `Name of ${m.orgId}`)
    }

    const prepare = vi.spyOn(env.DB, 'prepare')
    const { body } = await gql(
      '{ myOrganizations { id name role conferenceEditions { id } } }',
      {},
      userEnvelope,
    )
    expect(body.errors).toBeUndefined()
    expect(body.data.myOrganizations).toHaveLength(150)
    expect(body.data.myOrganizations[0]).toEqual({
      id: 'org-000',
      name: 'Name of org-000',
      role: 'admin',
      conferenceEditions: [],
    })
    expect(body.data.myOrganizations[149]).toEqual({
      id: 'org-149',
      name: 'Name of org-149',
      role: 'member',
      conferenceEditions: [],
    })
    const inQueries = prepare.mock.calls.filter(([sql]) =>
      String(sql).includes(' in ('),
    )
    expect(inQueries.length).toBeGreaterThan(0)
    for (const [sql] of inQueries) {
      const count = (String(sql).match(/\?/g) || []).length
      expect(count).toBeLessThanOrEqual(90)
    }
  })
})

describe('createOrganization (kontroll#79)', () => {
  const CREATE = `mutation($input: CreateOrganizationInput!, $key: String!) {
    createOrganization(input: $input, idempotencyKey: $key) { organizationId conferenceId }
  }`
  const input = (over: Record<string, unknown> = {}) => ({
    name: 'Nova',
    slug: 'nova',
    conferenceTitle: 'Nova Conf 2027',
    startDate: '2027-05-01',
    endDate: '2027-05-02',
    domain: 'conf.nova.org',
    ownerEmail: 'owner@nova.org',
    ...over,
  })
  const create = (
    over = {},
    key = 'create-key-000001',
    as: Envelope = operator,
  ) => gql(CREATE, { input: input(over), key }, as)
  const nothingWritten = () => {
    expect(site.writes).toBe(0)
    for (const t of [
      'organizations',
      'conferences',
      'domains',
      'provisioning_requests',
    ])
      expect(count(t)).toBe(0)
  }

  it('creates the Sanity docs, the D1 rows and the owner org, recording the operator', async () => {
    const { body } = await create()
    expect(body.errors).toBeUndefined()
    expect(body.data.createOrganization).toEqual({
      organizationId: 'organization.nova',
      conferenceId: 'conference-0-nova',
    })
    expect(site.writes).toBe(1)
    expect(site.operators).toEqual(['op'])
    expect(identity.ensure).toHaveBeenCalledWith('organization.nova', 'nova')
    expect(
      sqlite.prepare('SELECT created_by FROM provisioning_requests').all(),
    ).toEqual([{ created_by: 'op' }])
    expect(
      sqlite
        .prepare('SELECT hostname, kind FROM domains ORDER BY hostname')
        .all(),
    ).toEqual([
      { hostname: 'nova-2027.konf.run', kind: 'platform-edition' },
      { hostname: 'nova.konf.run', kind: 'platform-alias' },
    ])
  })

  it('a retry with the same key returns the same ids and writes nothing twice', async () => {
    const a = (await create()).body.data.createOrganization
    const b = (await create()).body.data.createOrganization
    expect(b).toEqual(a)
    expect(site.writes).toBe(1)
    expect(count('organizations')).toBe(1)
    expect(count('conferences')).toBe(1)
    expect(count('provisioning_requests')).toBe(1)
  })

  it('a retry after a failure between the Sanity and D1 steps completes', async () => {
    site.fail = true
    const first = await create()
    expect(first.body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR')
    expect(site.writes).toBe(1)
    expect(count('organizations')).toBe(0)
    site.fail = false
    const { body } = await create()
    expect(body.data.createOrganization).toEqual({
      organizationId: 'organization.nova',
      conferenceId: 'conference-0-nova',
    })
    expect(site.writes).toBe(1)
    expect(count('organizations')).toBe(1)
    expect(count('conferences')).toBe(1)
  })

  it.each<[string, Envelope | null]>([
    ['anonymous', null],
    ['a tenant envelope', organizer],
    [
      'an operator acting for a tenant',
      {
        ...(organizer as object),
        orgRole: null,
        scopes: ['platform:operator'],
      } as Envelope,
    ],
    ['a user envelope', { typ: 'user', userId: 'u' }],
  ])('refuses %s before any read or write', async (_, as) => {
    const prepare = vi.spyOn(env.DB, 'prepare')
    const { body } = as
      ? await create({}, 'create-key-000001', as)
      : await gql(CREATE, { input: input(), key: 'create-key-000001' })
    expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
    expect(sanityFetch).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
    expect(identity.ensure).not.toHaveBeenCalled()
    nothingWritten()
  })

  it.each([
    'https://konf.app',
    'http://auth.konf.app',
    'https://auth.konf.app.evil.test',
  ])('refuses to call a SITE_URL off the allowlist: %s', async (url) => {
    env.SITE_URL = url
    const { body } = await create()
    expect(body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR')
    expect(sanityFetch).not.toHaveBeenCalled()
    nothingWritten()
  })

  it('a duplicate slug is BAD_USER_INPUT with nothing created', async () => {
    const { body } = await create({ slug: 'acme', domain: null })
    expect(body.errors[0].extensions).toEqual({
      code: 'BAD_USER_INPUT',
      reason: 'SLUG_TAKEN',
      field: 'slug',
    })
    nothingWritten()
  })

  it('a duplicate domain is BAD_USER_INPUT with nothing created', async () => {
    const { body } = await create({ domain: 'conf.acme.org' })
    expect(body.errors[0].extensions).toEqual({
      code: 'BAD_USER_INPUT',
      reason: 'DOMAIN_TAKEN',
      field: 'domain',
    })
    nothingWritten()
  })

  it('a slug or custom domain held only in D1 is refused before the site is called', async () => {
    await provision('acme')
    sanityFetch.mockClear()
    delete sanity.orgs['organization.acme']
    const slug = await create({ slug: 'acme', domain: null })
    expect(slug.body.errors[0].extensions.reason).toBe('SLUG_TAKEN')
    sqlite
      .prepare(
        "INSERT INTO domains (hostname, kind, org_id, conference_id, verification) VALUES ('custom.example.com', 'custom', 'organization.acme', 'conference-acme', 'pending')",
      )
      .run()
    const domain = await create(
      { domain: 'custom.example.com' },
      'create-key-000002',
    )
    expect(domain.body.errors[0].extensions.reason).toBe('DOMAIN_TAKEN')
    expect(sanityFetch).not.toHaveBeenCalled()
    expect(site.writes).toBe(0)
  })

  it('rejects a short idempotency key', async () => {
    const { body } = await create({}, 'short')
    expect(body.errors[0].extensions).toEqual({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_INPUT',
      field: 'idempotencyKey',
    })
    nothingWritten()
  })

  it.each([
    ['slug', { slug: 'Not A Slug' }],
    ['reserved slug', { slug: 'admin' }],
    ['empty name', { name: '  ' }],
    ['empty title', { conferenceTitle: '' }],
    ['bad date', { startDate: '2027-02-30' }],
    ['end before start', { endDate: '2027-04-30' }],
    ['domain with a path', { domain: 'nova.org/x' }],
    ['platform domain', { domain: 'x.konf.run' }],
    ['email', { ownerEmail: 'not-an-email' }],
  ])('rejects invalid input: %s', async (_, over) => {
    const prepare = vi.spyOn(env.DB, 'prepare')
    const { body } = await create(over)
    expect(body.errors[0].extensions.code).toBe('BAD_USER_INPUT')
    expect(prepare).not.toHaveBeenCalled()
    nothingWritten()
  })
})

describe('provisionConference (kontroll#85)', () => {
  const PC = `mutation($input: ProvisionConferenceInput!, $key: String!, $orgId: ID) {
    provisionConference(input: $input, idempotencyKey: $key, orgId: $orgId) { conferenceId }
  }`
  const owner: Envelope = {
    typ: 'tenant',
    orgId: 'organization.acme',
    conferenceId: 'conference-acme',
    userId: 'u1',
    orgRole: 'owner',
    scopes: [],
  }
  const input = (over: Record<string, unknown> = {}) => ({
    title: 'Acme 2027',
    startDate: '2027-10-01',
    endDate: '2027-10-02',
    ...over,
  })
  const pc = (
    as: Envelope | undefined,
    over = {},
    key = 'edition-key-00001',
    orgId?: string,
  ) => gql(PC, { input: input(over), key, orgId }, as)
  const editionRows = () =>
    sqlite
      .prepare(
        "SELECT id, org_id, lifecycle, api_read, d1_write FROM conferences WHERE id LIKE 'conference-e%'",
      )
      .all()
  const reasonOf = (body: { errors: { extensions: object }[] }) =>
    body.errors[0].extensions

  beforeEach(async () => {
    await provision('acme')
    await provision('bravo', 'k2')
    sanityFetch.mockClear()
  })

  it.each(['owner', 'admin', 'member, admin'])(
    'an org %s creates a draft edition, recorded as theirs',
    async (orgRole) => {
      const { body } = await pc({ ...owner, orgRole } as Envelope)
      expect(body.errors).toBeUndefined()
      expect(body.data.provisionConference).toEqual({
        conferenceId: 'conference-e0',
      })
      expect(editionRows()).toEqual([
        {
          id: 'conference-e0',
          org_id: 'organization.acme',
          lifecycle: 'draft',
          api_read: 0,
          d1_write: 0,
        },
      ])
      expect(site.operators).toEqual(['u1'])
      expect(
        sqlite
          .prepare(
            "SELECT hostname, kind, verification FROM domains WHERE conference_id = 'conference-e0'",
          )
          .all(),
      ).toEqual([
        {
          hostname: 'acme-2027.konf.run',
          kind: 'platform-edition',
          verification: 'verified',
        },
      ])
    },
  )

  it('inherits a rollout flag only when every sibling edition has it', async () => {
    sqlite.exec(
      "UPDATE conferences SET api_read = 1, d1_write = 1 WHERE org_id = 'organization.acme'",
    )
    sqlite.exec(
      "INSERT INTO conferences (id, org_id, slug, name, lifecycle, api_read) VALUES ('conference-old', 'organization.acme', '2025', 'Old', 'archived', 1)",
    )
    await pc(owner)
    expect(editionRows()).toEqual([
      expect.objectContaining({ api_read: 1, d1_write: 0 }),
    ])
  })

  it.each<[string, Envelope | undefined]>([
    ['anonymous', undefined],
    ['a member', { ...owner, orgRole: 'member' } as Envelope],
    ['a conference organizer', { ...owner, orgRole: 'organizer' } as Envelope],
    ['a tenant with no role', { ...owner, orgRole: null } as Envelope],
    [
      'an operator acting for the tenant',
      { ...owner, orgRole: null, scopes: ['platform:operator'] } as Envelope,
    ],
    ['a user envelope', { typ: 'user', userId: 'u1' }],
  ])('refuses %s before any read or write', async (_, as) => {
    const prepare = vi.spyOn(env.DB, 'prepare')
    const { body } = await pc(as)
    expect(reasonOf(body)).toEqual({ code: 'FORBIDDEN' })
    expect(prepare).not.toHaveBeenCalled()
    expect(sanityFetch).not.toHaveBeenCalled()
    expect(editionRows()).toEqual([])
  })

  it('refuses orgId on the tenant lane, even an owner naming their own org', async () => {
    const prepare = vi.spyOn(env.DB, 'prepare')
    const { body } = await pc(
      owner,
      {},
      'edition-key-00001',
      'organization.acme',
    )
    expect(reasonOf(body)).toEqual({ code: 'FORBIDDEN' })
    expect(prepare).not.toHaveBeenCalled()
    expect(sanityFetch).not.toHaveBeenCalled()
  })

  it('an operator names the org on the platform lane, and must', async () => {
    const missing = await pc(operator)
    expect(reasonOf(missing.body)).toMatchObject({
      reason: 'INVALID_INPUT',
      field: 'orgId',
    })
    expect(sanityFetch).not.toHaveBeenCalled()
    const { body } = await pc(
      operator,
      {},
      'edition-key-00001',
      'organization.bravo',
    )
    expect(body.data.provisionConference).toEqual({
      conferenceId: 'conference-e0',
    })
    expect(editionRows()).toEqual([
      expect.objectContaining({ org_id: 'organization.bravo' }),
    ])
    expect(site.operators).toEqual(['op'])
  })

  it('copyFrom of another org, or of no edition, is COPY_FROM_NOT_IN_ORG before the site is called', async () => {
    for (const copyFrom of ['conference-bravo', 'conference-nope']) {
      const { body } = await pc(owner, { copyFrom })
      expect(reasonOf(body)).toMatchObject({
        code: 'BAD_USER_INPUT',
        reason: 'COPY_FROM_NOT_IN_ORG',
        field: 'copyFrom',
      })
    }
    expect(sanityFetch).not.toHaveBeenCalled()
    expect(editionRows()).toEqual([])
  })

  it('copyFrom of an own edition reaches the site', async () => {
    const { body } = await pc(owner, { copyFrom: 'conference-acme' })
    expect(body.data.provisionConference.conferenceId).toBe('conference-e0')
  })

  it('a retry returns the same id; a reused key with another input is IDEMPOTENCY_KEY_REUSED', async () => {
    const a = await pc(owner)
    const b = await pc(owner)
    expect(b.body.data).toEqual(a.body.data)
    expect(site.writes).toBe(1)
    expect(count('provisioning_requests')).toBe(3)
    const c = await pc(owner, { title: 'Other' })
    expect(reasonOf(c.body)).toMatchObject({
      reason: 'IDEMPOTENCY_KEY_REUSED',
      field: 'idempotencyKey',
    })
    // The same key for another org is refused from the D1 receipt alone.
    sanityFetch.mockClear()
    const d = await pc(operator, {}, 'edition-key-00001', 'organization.bravo')
    expect(reasonOf(d.body)).toMatchObject({
      reason: 'IDEMPOTENCY_KEY_REUSED',
    })
    expect(sanityFetch).not.toHaveBeenCalled()
    expect(site.writes).toBe(1)
    expect(editionRows()).toHaveLength(1)
  })

  it('a createOrganization key does not replay as an edition', async () => {
    const { body } = await pc(owner, {}, 'k1-is-long-enough')
    expect(body.errors).toBeUndefined()
  })

  it('a domain held in D1 or Sanity is DOMAIN_TAKEN with nothing created', async () => {
    sqlite.exec(
      "INSERT INTO domains (hostname, kind, org_id, conference_id, verification) VALUES ('d1.example.com', 'custom', 'organization.bravo', 'conference-bravo', 'pending')",
    )
    const paid = { ...owner, plan: 'basic' } as Envelope
    const d1 = await pc(paid, { domain: 'd1.example.com' })
    expect(reasonOf(d1.body)).toMatchObject({
      reason: 'DOMAIN_TAKEN',
      field: 'domain',
    })
    expect(sanityFetch).not.toHaveBeenCalled()
    const inSanity = await pc(paid, { domain: 'conf.bravo.org' })
    expect(reasonOf(inSanity.body)).toMatchObject({
      reason: 'DOMAIN_TAKEN',
      field: 'domain',
    })
    expect(site.writes).toBe(0)
    expect(editionRows()).toEqual([])
  })

  it.each([
    [{ title: ' ' }, 'title'],
    [{ startDate: '2027-13-01' }, 'startDate'],
    [{ endDate: '2027-09-01' }, 'endDate'],
    [{ domain: 'x.konf.run' }, 'domain'],
  ])('invalid input %j is INVALID_INPUT on %s', async (over, field) => {
    // On a paid plan, so the domain reaches validation (#2129).
    const { body } = await pc({ ...owner, plan: 'pro' } as Envelope, over)
    expect(reasonOf(body)).toMatchObject({ reason: 'INVALID_INPUT', field })
    expect(sanityFetch).not.toHaveBeenCalled()
  })
})

describe('billing phase 1 (#2129)', () => {
  const PLAN_RESOLVE = `query($host: String!) { tenantByHost(host: $host) { orgId plan } }`
  const SET = `mutation($s: ConferenceLifecycleOverride) { setConferenceLifecycle(status: $s) { lifecycleStatus } }`
  const COMP = `mutation($org: ID!, $plan: Plan!, $until: String, $reason: String!) {
    setComplimentaryPlan(orgId: $org, plan: $plan, until: $until, reason: $reason) { id plan }
  }`
  const PC = `mutation($input: ProvisionConferenceInput!, $key: String!) {
    provisionConference(input: $input, idempotencyKey: $key) { conferenceId }
  }`
  const orgRow = (id: string) =>
    sqlite
      .prepare(
        'SELECT plan, plan_source, comp_until, comp_reason FROM organizations WHERE id = ?',
      )
      .get(id)
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
    const admin: Envelope = {
      typ: 'tenant',
      orgId: org.id,
      conferenceId: confId,
      userId: 'u',
      orgRole: 'admin',
      scopes: [],
    }
    return { org, confId, admin }
  }
  const planError = (body: { errors?: { extensions: object }[] }) =>
    body.errors?.[0]?.extensions

  describe('migration 0008', () => {
    it('defaults existing and new orgs to free from the default source', async () => {
      const { org } = await setup()
      expect(orgRow(org.id)).toEqual({
        plan: 'free',
        plan_source: 'default',
        comp_until: null,
        comp_reason: null,
      })
    })

    it('applies on top of 0001..0007 holding a row, and refuses unknown values', () => {
      const { org } = { org: { id: 'x' } }
      sqlite.exec(
        `INSERT INTO organizations (id, slug, name) VALUES ('${org.id}', 'x', 'X')`,
      )
      for (const bad of [
        "UPDATE organizations SET plan = 'enterprise'",
        "UPDATE organizations SET plan_source = 'gift'",
        "UPDATE organizations SET subscription_status = 'trialing'",
        "INSERT INTO organizations (id, slug, name, plan) VALUES ('y', 'y', 'Y', 'gold')",
      ])
        expect(() => sqlite.exec(bad), bad).toThrow()
      sqlite.exec(
        "UPDATE organizations SET plan = 'pro', plan_source = 'stripe', subscription_status = 'past_due'",
      )
    })

    it('applies to a copy of the pre-0008 schema with data in place', () => {
      const db = new DatabaseSync(':memory:')
      const mig = (f: string) =>
        readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')
      db.exec(
        [
          '0001_init.sql',
          '0002_rollout_flags.sql',
          '0004_org_created_at.sql',
          '0005_lifecycle_cancelled.sql',
          '0006_provisioning_conference.sql',
          '0007_provisioning_created_by.sql',
        ]
          .map(mig)
          .join('\n'),
      )
      db.exec(
        "INSERT INTO organizations (id, slug, name, plan) VALUES ('o', 'o', 'O', 'free')",
      )
      db.exec(mig('0008_billing_plan.sql'))
      expect(
        db
          .prepare(
            'SELECT plan, plan_source, subscription_status FROM organizations',
          )
          .get(),
      ).toEqual({
        plan: 'free',
        plan_source: 'default',
        subscription_status: null,
      })
    })
  })

  describe('migration 0009', () => {
    it('gives CNDN comp pro, leaves every other org (kkdemo included) free, and reruns cleanly', () => {
      const db = new DatabaseSync(':memory:')
      const mig = (f: string) =>
        readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')
      db.exec(
        [
          '0001_init.sql',
          '0002_rollout_flags.sql',
          '0004_org_created_at.sql',
          '0005_lifecycle_cancelled.sql',
          '0006_provisioning_conference.sql',
          '0007_provisioning_created_by.sql',
        ]
          .map(mig)
          .join('\n'),
      )
      db.exec(
        "INSERT INTO organizations (id, slug, name) VALUES ('organization-cloud-native-days', 'cndn', 'CNDN'), ('kkdemo.org', 'kk', 'KK')",
      )
      db.exec(mig('0008_billing_plan.sql'))
      db.exec(mig('0009_comp_existing_orgs.sql'))
      db.exec(mig('0009_comp_existing_orgs.sql'))
      expect(
        db
          .prepare(
            'SELECT id, plan, plan_source, comp_until, comp_reason FROM organizations ORDER BY id',
          )
          .all(),
      ).toEqual([
        {
          id: 'kkdemo.org',
          plan: 'free',
          plan_source: 'default',
          comp_until: null,
          comp_reason: null,
        },
        {
          id: 'organization-cloud-native-days',
          plan: 'pro',
          plan_source: 'comp',
          comp_until: null,
          comp_reason: 'existing customer (owner decision 2026-11-08)',
        },
      ])
    })
  })

  it('serves effectivePlan on the session organization', async () => {
    const { org, admin } = await setup()
    const Q = '{ organization { plan effectivePlan } }'
    expect((await gql(Q, {}, admin)).body.data.organization).toEqual({
      plan: 'free',
      effectivePlan: 'free',
    })
    sqlite.exec(
      `UPDATE organizations SET plan = 'basic', plan_source = 'comp' WHERE id = '${org.id}'`,
    )
    expect((await gql(Q, {}, admin)).body.data.organization).toEqual({
      plan: 'basic',
      effectivePlan: 'basic',
    })
    // A stored plan with no grant behind it is not enforced.
    sqlite.exec(
      `UPDATE organizations SET plan_source = 'default' WHERE id = '${org.id}'`,
    )
    expect((await gql(Q, {}, admin)).body.data.organization.effectivePlan).toBe(
      'free',
    )
  })

  describe('tenantByHost carries the effective plan', () => {
    it.each([
      ["plan = 'pro', plan_source = 'default'", 'free'],
      ["plan = 'pro', plan_source = 'comp', comp_until = NULL", 'pro'],
      [
        "plan = 'basic', plan_source = 'comp', comp_until = '2000-01-01T00:00:00Z'",
        'free',
      ],
      [
        "plan = 'basic', plan_source = 'stripe', subscription_status = 'active'",
        'basic',
      ],
      [
        "plan = 'basic', plan_source = 'stripe', subscription_status = 'canceled'",
        'free',
      ],
    ])('%s → %s', async (set, want) => {
      const { org } = await setup()
      sqlite.exec(`UPDATE organizations SET ${set} WHERE id = '${org.id}'`)
      const { body } = await gql(PLAN_RESOLVE, { host: 'acme-2026.konf.run' })
      expect(body.data.tenantByHost).toEqual({ orgId: org.id, plan: want })
    })
  })

  describe('going live with ticket sales', () => {
    it('refuses to put a ticketed cancelled edition back live on free', async () => {
      const { confId, admin } = await setup()
      await gql(SET, { s: 'cancelled' }, admin)
      conferenceRpc.ticketed.mockResolvedValue(true)
      const { body } = await gql(SET, { s: null }, admin)
      expect(planError(body)).toEqual({
        code: 'BAD_USER_INPUT',
        reason: 'PLAN_REQUIRED',
        requiredPlan: 'basic',
      })
      expect(conferenceRpc.ticketed).toHaveBeenCalledWith(admin.orgId, confId)
      expect(lifecycle(confId)).toBe('cancelled')
    })

    it.each(['basic', 'pro'])(
      'allows it on %s, asking nothing',
      async (plan) => {
        const { confId, admin } = await setup()
        await gql(SET, { s: 'archived' }, admin)
        conferenceRpc.ticketed.mockResolvedValue(true)
        const { body } = await gql(SET, { s: null }, {
          ...admin,
          plan,
        } as Envelope)
        expect(body.data.setConferenceLifecycle).toEqual({
          lifecycleStatus: 'live',
        })
        expect(conferenceRpc.ticketed).not.toHaveBeenCalled()
        expect(lifecycle(confId)).toBe('live')
      },
    )

    it('lets a free org put a free-to-attend edition back live', async () => {
      const { confId, admin } = await setup()
      await gql(SET, { s: 'cancelled' }, admin)
      const { body } = await gql(SET, { s: null }, admin)
      expect(body.data.setConferenceLifecycle).toEqual({
        lifecycleStatus: 'live',
      })
      expect(lifecycle(confId)).toBe('live')
    })

    it('never gates cancelling or archiving, ticketed or not', async () => {
      const { confId, admin } = await setup()
      conferenceRpc.ticketed.mockResolvedValue(true)
      for (const s of ['cancelled', 'archived']) {
        const { body } = await gql(SET, { s }, admin)
        expect(body.errors).toBeUndefined()
        expect(lifecycle(confId)).toBe(s)
      }
      expect(conferenceRpc.ticketed).not.toHaveBeenCalled()
    })

    it('refuses a non-writer with FORBIDDEN before the plan is looked at', async () => {
      const { admin } = await setup()
      const { body } = await gql(
        SET,
        { s: null },
        { ...admin, orgRole: 'member' },
      )
      expect(planError(body)).toMatchObject({ code: 'FORBIDDEN' })
      expect(conferenceRpc.ticketed).not.toHaveBeenCalled()
    })
  })

  describe('custom domain on a new edition', () => {
    const input = (domain?: string) => ({
      title: 'Acme 2027',
      startDate: '2027-10-01',
      endDate: '2027-10-02',
      ...(domain ? { domain } : {}),
    })
    const owner = async (plan?: string) => {
      const { admin } = await setup()
      sanityFetch.mockClear()
      return {
        ...admin,
        orgRole: 'owner',
        ...(plan ? { plan } : {}),
      } as Envelope
    }

    it('refuses it on free before any read or write', async () => {
      const as = await owner()
      const prepare = vi.spyOn(env.DB, 'prepare')
      const { body } = await gql(
        PC,
        { input: input('conf.acme-new.org'), key: 'edition-key-00001' },
        as,
      )
      expect(planError(body)).toMatchObject({
        code: 'BAD_USER_INPUT',
        reason: 'PLAN_REQUIRED',
        requiredPlan: 'basic',
      })
      expect(prepare).not.toHaveBeenCalled()
      expect(sanityFetch).not.toHaveBeenCalled()
      expect(site.writes).toBe(0)
    })

    it.each(['basic', 'pro'])('allows it on %s', async (plan) => {
      const as = await owner(plan)
      const { body } = await gql(
        PC,
        { input: input('conf.acme-new.org'), key: 'edition-key-00001' },
        as,
      )
      expect(body.errors).toBeUndefined()
      expect(body.data.provisionConference.conferenceId).toBeTruthy()
    })

    it('leaves an edition without a custom domain alone on free', async () => {
      const as = await owner()
      const { body } = await gql(
        PC,
        { input: input(), key: 'edition-key-00001' },
        as,
      )
      expect(body.errors).toBeUndefined()
    })
  })

  describe('setComplimentaryPlan', () => {
    const vars = (org: string, over: Record<string, unknown> = {}) => ({
      org,
      plan: 'pro',
      until: '2099-01-01T00:00:00Z',
      reason: 'CNDN, organizer of the platform',
      ...over,
    })

    it('grants a plan, audited, and the effective plan follows', async () => {
      const { org } = await setup()
      const { body } = await gql(COMP, vars(org.id), operator)
      expect(body.errors).toBeUndefined()
      expect(body.data.setComplimentaryPlan).toEqual({
        id: org.id,
        plan: 'pro',
      })
      expect(orgRow(org.id)).toEqual({
        plan: 'pro',
        plan_source: 'comp',
        comp_until: '2099-01-01T00:00:00.000Z',
        comp_reason: 'CNDN, organizer of the platform',
      })
      expect(identity.audit).toHaveBeenCalledWith({
        type: 'operator.write',
        actorId: 'op',
        organizationId: org.id,
        conferenceId: null,
        fields: ['plan', 'plan_source', 'comp_until', 'comp_reason'],
      })
      const { body: r } = await gql(PLAN_RESOLVE, {
        host: 'acme-2026.konf.run',
      })
      expect(r.data.tenantByHost.plan).toBe('pro')
    })

    it('ends a grant with free', async () => {
      const { org } = await setup()
      await gql(COMP, vars(org.id), operator)
      await gql(COMP, vars(org.id, { plan: 'free', until: null }), operator)
      expect(orgRow(org.id)).toEqual({
        plan: 'free',
        plan_source: 'default',
        comp_until: null,
        comp_reason: null,
      })
      expect(identity.audit).toHaveBeenCalledTimes(2)
    })

    it('audits before it writes, and a failed audit writes nothing', async () => {
      const { org } = await setup()
      identity.audit.mockImplementation(async () => {
        expect(orgRow(org.id)).toMatchObject({ plan: 'free' })
        throw new Error('identity down')
      })
      const { body } = await gql(COMP, vars(org.id), operator)
      expect(body.errors?.[0]).toBeDefined()
      expect(orgRow(org.id)).toMatchObject({
        plan: 'free',
        plan_source: 'default',
      })
    })

    it('answers null for an unknown org, without an audit row', async () => {
      await setup()
      const { body } = await gql(COMP, vars('organization.nope'), operator)
      expect(body.data.setComplimentaryPlan).toBeNull()
      expect(identity.audit).not.toHaveBeenCalled()
    })

    it.each([
      [{ until: '2000-01-01T00:00:00Z' }, 'until'],
      [{ until: 'soon' }, 'until'],
      [{ reason: '  ' }, 'reason'],
    ])('refuses %j as INVALID_INPUT', async (over, field) => {
      const { org } = await setup()
      const { body } = await gql(COMP, vars(org.id, over), operator)
      expect(planError(body)).toMatchObject({ reason: 'INVALID_INPUT', field })
      expect(orgRow(org.id)).toMatchObject({ plan: 'free' })
    })

    it.each([
      ['anonymous', undefined],
      ['an org owner', 'owner'],
      ['an operator acting for a tenant', 'op-tenant'],
      ['a user context', 'user'],
    ])('refuses %s before any read', async (_, who) => {
      const { org, admin } = await setup()
      const as: Envelope | undefined =
        who === 'owner'
          ? { ...admin, orgRole: 'owner' }
          : who === 'op-tenant'
            ? {
                ...admin,
                userId: 'op',
                orgRole: null,
                scopes: ['platform:operator'],
              }
            : who === 'user'
              ? { typ: 'user', userId: 'u' }
              : undefined
      const prepare = vi.spyOn(env.DB, 'prepare')
      const { body } = await gql(COMP, vars(org.id), as)
      expect(planError(body)).toMatchObject({ code: 'FORBIDDEN' })
      expect(prepare).not.toHaveBeenCalled()
      expect(identity.audit).not.toHaveBeenCalled()
      expect(orgRow(org.id)).toMatchObject({
        plan: 'free',
        plan_source: 'default',
      })
    })
  })
})

describe('org kind (#2150)', () => {
  const kindOf = (id: string) =>
    (
      sqlite.prepare('SELECT kind FROM organizations WHERE id = ?').get(id) as {
        kind: string
      }
    ).kind
  const demo = (id: string) =>
    sqlite.exec(`UPDATE organizations SET kind = 'demo' WHERE id = '${id}'`)

  describe('migration 0010', () => {
    it('defaults to customer, marks kkdemo demo, and reruns cleanly', () => {
      const db = new DatabaseSync(':memory:')
      const mig = (f: string) =>
        readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')
      db.exec(
        [
          '0001_init.sql',
          '0002_rollout_flags.sql',
          '0004_org_created_at.sql',
          '0005_lifecycle_cancelled.sql',
          '0006_provisioning_conference.sql',
          '0007_provisioning_created_by.sql',
          '0008_billing_plan.sql',
        ]
          .map(mig)
          .join('\n'),
      )
      db.exec(
        "INSERT INTO organizations (id, slug, name) VALUES ('organization-cloud-native-days', 'cndn', 'CNDN'), ('kkdemo.org', 'kk', 'KK')",
      )
      db.exec(mig('0010_org_kind.sql'))
      // Rerun the migration's data step (wrangler applies the DDL once).
      const update = mig('0010_org_kind.sql').match(/^UPDATE [^;]+;/m)
      expect(update).not.toBeNull()
      db.exec(update![0])
      expect(
        db.prepare('SELECT id, kind FROM organizations ORDER BY id').all(),
      ).toEqual([
        { id: 'kkdemo.org', kind: 'demo' },
        { id: 'organization-cloud-native-days', kind: 'customer' },
      ])
    })

    it('refuses any other kind on insert and update', async () => {
      const { id } = await provision()
      expect(kindOf(id)).toBe('customer')
      expect(() =>
        sqlite.exec(
          `UPDATE organizations SET kind = 'trial' WHERE id = '${id}'`,
        ),
      ).toThrow(/customer or demo/)
      expect(() =>
        sqlite.exec(
          "INSERT INTO organizations (id, slug, name, kind) VALUES ('x', 'x', 'X', 'test')",
        ),
      ).toThrow(/customer or demo/)
      expect(kindOf(id)).toBe('customer')
    })
  })

  it('tenantByHost carries the kind, and a demo org is pro with no billing', async () => {
    const { id } = await provision()
    const Q = `query($host: String!) { tenantByHost(host: $host) { orgKind plan } }`
    const host = { host: 'acme-2026.konf.run' }
    expect((await gql(Q, host)).body.data.tenantByHost).toEqual({
      orgKind: 'customer',
      plan: 'free',
    })
    demo(id)
    expect((await gql(Q, host)).body.data.tenantByHost).toEqual({
      orgKind: 'demo',
      plan: 'pro',
    })
  })

  it('carries kind on the operator org list and conference rows, so Kontroll can leave demo out', async () => {
    const { id } = await provision('acme')
    await provision('bravo', 'k2')
    demo(id)
    const { body } = await gql(
      '{ organizations { slug kind effectivePlan } conferences { organization { slug kind } } }',
      {},
      operator,
    )
    expect(body.data.organizations).toEqual([
      { slug: 'acme', kind: 'demo', effectivePlan: 'pro' },
      { slug: 'bravo', kind: 'customer', effectivePlan: 'free' },
    ])
    expect(
      body.data.conferences.map(
        (c: { organization: object }) => c.organization,
      ),
    ).toEqual([
      { slug: 'acme', kind: 'demo' },
      { slug: 'bravo', kind: 'customer' },
    ])
  })

  it('exposes the envelope kind on the edition for noindex', async () => {
    const { id } = await provision()
    const conf = conferenceOf(id)
    const Q =
      'query($r: [_Any!]!) { _entities(representations: $r) { ... on ConferenceEdition { orgKind } } }'
    const r = { r: [{ __typename: 'ConferenceEdition', id: conf }] }
    const as = (orgKind?: string) =>
      ({
        typ: 'tenant',
        orgId: id,
        conferenceId: conf,
        userId: null,
        orgRole: null,
        scopes: [],
        ...(orgKind ? { orgKind } : {}),
      }) as Envelope
    expect((await gql(Q, r, as('demo'))).body.data._entities).toEqual([
      { orgKind: 'demo' },
    ])
    expect((await gql(Q, r, as())).body.data._entities).toEqual([
      { orgKind: 'customer' },
    ])
  })
})

describe('billing and sign-up contract (#2129)', () => {
  const ORG = `{ organization { billing { plan effectivePlan planSource subscriptionStatus currentPeriodEnd cancelAtPeriodEnd compUntil graceUntil } } }`
  const CHECKOUT = `mutation { startCheckout(plan: PRO, currency: NOK) { url } }`
  const PORTAL = `mutation { openBillingPortal { url } }`
  const SIGNUP = `mutation($slug: String!, $name: String = "Acme", $code: String = "c") { signUpOrganization(input: { name: $name, slug: $slug }, inviteCode: $code) { host organization { id name } conference { id lifecycleStatus } } }`
  const CREATE_CODE = `mutation($exp: String!) { createSignupCode(note: "n", maxUses: 2, expiresAt: $exp) { id code uses maxUses } }`
  const CODES = `{ signupCodes { id note uses } }`
  const REVOKE = `mutation { revokeSignupCode(id: "x") { id } }`
  const FUTURE = '2099-01-01T00:00:00.000Z'
  const as = (orgId: string, orgRole: string, over: object = {}): Envelope => ({
    typ: 'tenant',
    orgId,
    conferenceId: null,
    userId: 'u',
    orgRole,
    scopes: [],
    ...over,
  })
  const code = (body: { errors?: { extensions: { code: string } }[] }) =>
    body.errors?.[0]?.extensions.code
  /** Counts D1 statements: a refusal before any read prepares none. */
  const watchDb = () => vi.spyOn(env.DB, 'prepare')

  describe('authz before fetch', () => {
    const user: Envelope = { typ: 'user', userId: 'u' }
    it.each([
      ['startCheckout as admin', CHECKOUT, as('org', 'admin')],
      ['startCheckout as member', CHECKOUT, as('org', 'member')],
      [
        'startCheckout as operator acting',
        CHECKOUT,
        as('org', 'member', { scopes: ['platform:operator'] }),
      ],
      ['startCheckout as user', CHECKOUT, user],
      ['openBillingPortal as admin', PORTAL, as('org', 'admin')],
      ['openBillingPortal anonymous', PORTAL, undefined],
      ['signUpOrganization on a tenant', SIGNUP, as('org', 'owner')],
      ['signUpOrganization anonymous', SIGNUP, undefined],
      ['createSignupCode as user', CREATE_CODE, user],
      ['createSignupCode as owner', CREATE_CODE, as('org', 'owner')],
      ['signupCodes as user', CODES, user],
      ['revokeSignupCode as owner', REVOKE, as('org', 'owner')],
    ])('%s: FORBIDDEN, no D1 read', async (_, q, env_) => {
      const spy = watchDb()
      const { body } = await gql(q, { slug: 'acme-new', exp: FUTURE }, env_)
      expect(code(body)).toBe('FORBIDDEN')
      expect(spy).not.toHaveBeenCalled()
    })

    it('openBillingPortal as owner reaches NOT_IMPLEMENTED', async () => {
      expect(code((await gql(PORTAL, {}, as('org', 'owner'))).body)).toBe(
        'NOT_IMPLEMENTED',
      )
    })
  })

  describe('Organization.billing', () => {
    async function org() {
      const { id } = await provision()
      sqlite
        .prepare(
          `UPDATE organizations SET plan = 'basic', plan_source = 'stripe',
             subscription_status = 'past_due', current_period_end = ?,
             cancel_at_period_end = 1 WHERE id = ?`,
        )
        .run('2099-03-01T00:00:00.000Z', id)
      return id
    }

    it.each(['owner', 'admin'])(
      'gives a %s the values and graceUntil',
      async (role) => {
        const id = await org()
        const { body } = await gql(ORG, {}, as(id, role))
        expect(body.data.organization.billing).toEqual({
          plan: 'basic',
          effectivePlan: 'basic',
          planSource: 'stripe',
          subscriptionStatus: 'past_due',
          currentPeriodEnd: '2099-03-01T00:00:00.000Z',
          cancelAtPeriodEnd: true,
          compUntil: null,
          graceUntil: '2099-03-15T00:00:00.000Z',
        })
      },
    )

    it('gives an operator acting for the org the values (#2163)', async () => {
      const id = await org()
      const { body } = await gql(
        ORG,
        {},
        as(id, 'member', { scopes: ['platform:operator'] }),
      )
      expect(body.data.organization.billing.plan).toBe('basic')
    })

    it('is null for an operator listing orgs on the platform lane', async () => {
      await org()
      const { body } = await gql(
        `{ conferences { organization { billing { plan } } } }`,
        {},
        operator,
      )
      expect(body.data.conferences.length).toBeGreaterThan(0)
      for (const c of body.data.conferences)
        expect(c.organization.billing).toBeNull()
    })

    it('is null for a member', async () => {
      const id = await org()
      const { body } = await gql(ORG, {}, as(id, 'member'))
      expect(body.data.organization).toEqual({ billing: null })
    })

    it('has no graceUntil when active', async () => {
      const id = await org()
      sqlite.exec(
        `UPDATE organizations SET subscription_status = 'active' WHERE id = '${id}'`,
      )
      const { body } = await gql(ORG, {}, as(id, 'owner'))
      expect(body.data.organization.billing.graceUntil).toBeNull()
    })
  })

  describe('startCheckout refusals', () => {
    it('refuses a demo org from the envelope, before any read', async () => {
      const spy = watchDb()
      const { body } = await gql(
        CHECKOUT,
        {},
        as('org', 'owner', { orgKind: 'demo' }),
      )
      expect(body.errors[0].extensions).toMatchObject({
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_INPUT',
        field: 'organization',
      })
      expect(spy).not.toHaveBeenCalled()
    })

    it('refuses an active comp, passes an expired one to NOT_IMPLEMENTED', async () => {
      const { id } = await provision()
      sqlite.exec(
        `UPDATE organizations SET plan = 'pro', plan_source = 'comp', comp_until = NULL WHERE id = '${id}'`,
      )
      let { body } = await gql(CHECKOUT, {}, as(id, 'owner'))
      expect(body.errors[0].extensions).toMatchObject({
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_INPUT',
      })
      sqlite.exec(
        `UPDATE organizations SET comp_until = '2000-01-01T00:00:00Z' WHERE id = '${id}'`,
      )
      ;({ body } = await gql(CHECKOUT, {}, as(id, 'owner')))
      expect(code(body)).toBe('NOT_IMPLEMENTED')
    })
  })

  describe('signUpOrganization (#2163)', () => {
    const user: Envelope = { typ: 'user', userId: 'u' }
    const newCode = async (maxUses = 2) =>
      (await createData(env).createSignupCode('op', 'n', maxUses, FUTURE)).code
    const uses = () =>
      (
        sqlite.prepare('SELECT uses FROM signup_codes').get() as {
          uses: number
        }
      ).uses
    const count = (t: string) =>
      (sqlite.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number })
        .n
    const signUp = async (vars: Record<string, unknown>) =>
      (await gql(SIGNUP, vars, user)).body
    const field = async (slug: string, code?: string) =>
      (await signUp({ slug, code: code ?? (await newCode()) })).errors[0]

    it('creates org, draft edition and <slug>.konf.run, spends the code, writes the owner first', async () => {
      const code = await newCode()
      const body = await signUp({ slug: 'new-org', code, name: '  New Org ' })
      expect(body.errors).toBeUndefined()
      const out = body.data.signUpOrganization
      expect(out).toMatchObject({
        host: 'new-org.konf.run',
        organization: { id: 'organization.new-org', name: 'New Org' },
        conference: { lifecycleStatus: 'draft' },
      })
      expect(
        sqlite
          .prepare(
            `SELECT o.plan, o.kind, d.kind AS host, d.verification FROM organizations o JOIN domains d ON d.org_id = o.id`,
          )
          .get(),
      ).toEqual({
        plan: 'free',
        kind: 'customer',
        host: 'platform-alias',
        verification: 'verified',
      })
      expect(uses()).toBe(1)
      expect(identity.signupOwner).toHaveBeenCalledWith(
        'organization.new-org',
        'new-org',
        'New Org',
        'u',
        expect.any(String),
      )
      // The audit carries the code's id, never the code.
      expect(JSON.stringify(identity.signupOwner.mock.calls)).not.toContain(
        code,
      )
      // Owner membership is readable on the next request.
      identity.memberships.mockResolvedValueOnce([
        { orgId: 'organization.new-org', role: 'owner' },
      ])
      const mine = await gql(
        `{ myOrganizations { id role conferenceEditions { lifecycleStatus } } }`,
        {},
        user,
      )
      expect(mine.body.data.myOrganizations).toEqual([
        {
          id: 'organization.new-org',
          role: 'owner',
          conferenceEditions: [{ lifecycleStatus: 'draft' }],
        },
      ])
    })

    it.each([
      ['an unknown code', 'inviteCode', { slug: 'new-org', code: 'nope' }],
      ['a short name', 'name', { slug: 'new-org', name: ' a ' }],
      ['a long name', 'name', { slug: 'new-org', name: 'x'.repeat(81) }],
      ['a bad slug', 'slug', { slug: 'Acme' }],
      ['a reserved slug', 'slug', { slug: 'kontroll' }],
    ])('refuses %s with field %s and writes nothing', async (_, f, vars) => {
      const code = await newCode()
      const body = await signUp({ code, ...vars })
      expect(body.errors[0].extensions).toMatchObject({
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_INPUT',
        field: f,
      })
      expect([uses(), count('organizations'), count('domains')]).toEqual([
        0, 0, 0,
      ])
      expect(identity.signupOwner).not.toHaveBeenCalled()
    })

    it.each(['expired', 'revoked', 'used up'])(
      'refuses a %s code as inviteCode',
      async (kind) => {
        const code = await newCode(1)
        if (kind === 'expired')
          sqlite.exec(`UPDATE signup_codes SET expires_at = '2000-01-01'`)
        if (kind === 'revoked')
          sqlite.exec(`UPDATE signup_codes SET revoked_at = '2000-01-01'`)
        if (kind === 'used up') sqlite.exec(`UPDATE signup_codes SET uses = 1`)
        expect((await field('new-org', code)).extensions.field).toBe(
          'inviteCode',
        )
      },
    )

    it('checks the code before the slug: no slug oracle without one', async () => {
      await provision('acme')
      for (const slug of ['acme', 'auth', 'Acme', 'free-one'])
        expect(await field(slug, 'nope')).toMatchObject({
          message: 'this invite code is not valid',
          extensions: { field: 'inviteCode' },
        })
    })

    it.each([
      'ab',
      'a'.repeat(41),
      'Acme',
      'ac_me',
      '-acme',
      'acme-',
      'æøå',
      'xn--acme',
      'ac--me',
    ])('refuses format %s', async (slug) => {
      expect((await field(slug)).extensions).toMatchObject({
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_INPUT',
        field: 'slug',
      })
    })

    it('gives reserved and taken the same message, never the slug', async () => {
      await provision('acme')
      for (const slug of ['auth', 'kontroll', 'signup', 'acme']) {
        const m = await field(slug)
        expect(m).toMatchObject({
          message: 'this slug is not available',
          extensions: { field: 'slug' },
        })
        expect(m.message).not.toContain(slug)
      }
    })

    it('gives the last use to one of two racing sign-ups', async () => {
      const code = await newCode(1)
      const [a, b] = await Promise.all([
        signUp({ slug: 'org-a', code }),
        signUp({ slug: 'org-b', code }),
      ])
      const ok = [a, b].filter((x) => !x.errors)
      const lost = [a, b].filter((x) => x.errors)
      expect(ok).toHaveLength(1)
      expect(lost[0].errors[0].extensions.field).toBe('inviteCode')
      expect([uses(), count('organizations')]).toEqual([1, 1])
    })

    it('is rate-limited per user, before any read', async () => {
      signupLimit.limit.mockResolvedValueOnce({ success: false })
      const spy = watchDb()
      const body = await signUp({ slug: 'new-org', code: 'x' })
      expect(code(body)).toBe('RATE_LIMITED')
      expect(spy).not.toHaveBeenCalled()
      expect(signupLimit.limit).toHaveBeenCalledWith({ key: 'signup|user:u' })
    })

    it('leaves no org and an unspent code when the owner write fails', async () => {
      identity.signupOwner.mockRejectedValueOnce(new Error('down'))
      const c = await newCode()
      const body = await signUp({ slug: 'new-org', code: c })
      expect(code(body)).toBe('INTERNAL_SERVER_ERROR')
      expect([
        uses(),
        count('organizations'),
        count('conferences'),
        count('domains'),
      ]).toEqual([0, 0, 0, 0])
      // The slug is free again.
      expect(
        (await signUp({ slug: 'new-org', code: c })).errors,
      ).toBeUndefined()
    })

    it('refunds the code when the D1 write loses a slug race', async () => {
      const c = await newCode()
      vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('UNIQUE'))
      const body = await signUp({ slug: 'new-org', code: c })
      expect(body.errors[0].extensions.field).toBe('slug')
      expect([uses(), count('organizations')]).toEqual([0, 0])
      expect(identity.signupOwner).not.toHaveBeenCalled()
    })
  })

  describe('signup codes', () => {
    it('stores only the hash and returns the code once', async () => {
      const { body } = await gql(CREATE_CODE, { exp: FUTURE }, operator)
      const created = body.data.createSignupCode
      expect(created).toMatchObject({ uses: 0, maxUses: 2 })
      expect(created.code).toMatch(/^[a-z0-9-]{20,}$/)
      const row = sqlite.prepare('SELECT * FROM signup_codes').get() as Record<
        string,
        unknown
      >
      expect(row.code_hash).toBe(await hashSignupCode(created.code))
      expect(JSON.stringify(row)).not.toContain(created.code)
      const list = await gql(`{ signupCodes { id code } }`, {}, operator)
      expect(list.body.data.signupCodes).toEqual([
        { id: created.id, code: null },
      ])
    })

    it('refuses a past expiresAt', async () => {
      const { body } = await gql(
        CREATE_CODE,
        { exp: '2000-01-01T00:00:00Z' },
        operator,
      )
      expect(body.errors[0].extensions.field).toBe('expiresAt')
    })

    it('spends uses up to maxUses, never past expiry or revocation', async () => {
      const data = createData(env)
      const c = await data.createSignupCode('op', 'n', 2, FUTURE)
      expect(await data.consumeSignupCode('wrong')).toBeNull()
      expect(await data.consumeSignupCode(c.code)).toBe(c.id)
      expect(await data.consumeSignupCode(c.code)).toBe(c.id)
      expect(await data.consumeSignupCode(c.code)).toBeNull()
      const e = await data.createSignupCode('op', 'n', 5, FUTURE)
      expect(
        await data.consumeSignupCode(e.code, new Date('2100-01-01')),
      ).toBeNull()
      const r = await data.createSignupCode('op', 'n', 5, FUTURE)
      const { body } = await gql(
        `mutation($id: ID!) { revokeSignupCode(id: $id) { revokedAt } }`,
        { id: r.id },
        operator,
      )
      expect(body.data.revokeSignupCode.revokedAt).toBeTruthy()
      expect(await data.consumeSignupCode(r.code)).toBeNull()
    })
  })
})
