/**
 * Cross-tenant walk at the gateway boundary (#1787, epic #1772 req. 1).
 *
 * The real gateway runs over the real subgraph Workers, each on its own D1
 * (Miniflare) with its shipped migrations, plus the real identity Worker for
 * JWKS, the identity JWT and the live membership lookup. Every table gets a
 * tenant A row and a tenant B row; every B string carries TENANT_B_MARKER.
 * Queries are generated from the public schema: every field reachable from
 * Query, with required arguments filled from A's ids and from B's ids (the
 * cross-tenant probe). Any B marker in a response fails the build.
 * Every Mutation field runs too: only A's organizer on A's host may change
 * any row, and then never a B row.
 *
 * Subgraphs come from SUBGRAPHS and BINDINGS: a new one is seeded and walked
 * here without a change to this file.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { makeSignature } from 'better-auth/crypto'
import {
  getNamedType,
  isEnumType,
  isInputObjectType,
  isLeafType,
  isListType,
  isNonNullType,
  isObjectType,
  buildSchema,
  type GraphQLArgument,
  type GraphQLInputType,
  type GraphQLOutputType,
  type GraphQLNamedType,
} from 'graphql'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  ENVELOPE_HEADER,
  createSigner,
  verifyEnvelope,
  generateEnvelopeKeyPair,
} from '@runkonf/tenancy'
import { BINDINGS, createGateway, type Env } from './gateway'
import { SUBGRAPHS, compose, publicSdl } from './supergraph'

// vitest.config.ts aliases `jose` to a key-ignoring stub; load the real one.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})
// Sanity-backed subgraphs (content): the real GROQ is evaluated (groq-js)
// over a two-tenant dataset, B's document first, so a missing or wrong
// tenant predicate returns B. Fields come from the public schema (sanityDoc).
vi.mock('@sanity/client', () => ({
  createClient: () => ({
    fetch: async (query: string, params: Record<string, unknown>) => {
      const groq = rewriteGroq(query)
      const dataset = (['b', 'a'] as T[]).map((t) => ({
        ...sanityDoc(groq, t),
        _type: 'conference',
        organization: { _type: 'reference', _ref: ORG[t] },
      }))
      const { evaluate, parse } = await import('groq-js')
      return (await evaluate(parse(groq), { dataset, params })).get()
    },
  }),
}))
/** Negative controls swap this to break the production query's scoping. */
let rewriteGroq = (q: string) => q
vi.mock('cloudflare:workers', () => ({
  WorkerEntrypoint: class {
    constructor(
      _ctx: unknown,
      public env: unknown,
    ) {}
  },
}))

const MARKER = /tenant[_-]b[_-]marker/i
type T = 'a' | 'b'
const TENANTS: T[] = ['a', 'b']
const tag = (t: T) => (t === 'a' ? 'TENANT_A' : 'TENANT_B_MARKER')
const ORG = { a: 'org-tenant-a', b: 'org-tenant-b-marker' }
const CONF = { a: 'conf-tenant-a', b: 'conf-tenant-b-marker' }
const USER = { a: 'user-tenant-a', b: 'user-tenant-b-marker' }
const HOST = { a: 'tenant-a.example', b: 'tenant-b-marker.example' }
const ORIGIN = `https://${HOST.a}`

/** Ids a required argument is probed with, per tenant. */
const PROBES = (t: T) => [
  ORG[t],
  CONF[t],
  USER[t],
  HOST[t],
  `https://${HOST[t]}`,
]

/** Values that make a row as visible as possible, so a leak cannot hide. */
const VISIBLE = ['active', 'live', 'verified', 'admin', '1']

/** A per-table row value, from naming conventions, FKs and CHECK lists. */
function value(
  table: string,
  col: { name: string; type: string; pk: number; dflt_value: string | null },
  fk: Map<string, string>,
  sql: string,
  t: T,
): unknown {
  const n = col.name
  const idOf = (tbl: string) =>
    /^organi[sz]ations?$/.test(tbl)
      ? ORG[t]
      : /^conferences?$/.test(tbl)
        ? CONF[t]
        : tbl === 'user' || tbl === 'users'
          ? USER[t]
          : `${tbl}-${tag(t)}`
  if (fk.has(n)) return idOf(fk.get(n)!)
  if (/^(org_id|orgId|organizationId)$/.test(n)) return ORG[t]
  if (/^(conference_id|conferenceId)$/.test(n)) return CONF[t]
  if (/^(user_id|userId|inviterId)$/.test(n)) return USER[t]
  if (/^hostname$/.test(n)) return HOST[t]
  if (col.pk && /^id$/.test(n)) {
    return /INT/i.test(col.type) ? null : idOf(table)
  }
  const check = new RegExp(
    `\\b${n}\\b[^,]*CHECK\\s*\\(\\s*${n}\\s+IN\\s*\\(([^)]*)\\)`,
    'i',
  ).exec(sql)
  if (check) {
    const opts = check[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    const pick = opts.find((o) => VISIBLE.includes(o)) ?? opts[0]
    return /INT/i.test(col.type) ? Number(pick) : pick
  }
  if (n === 'role') return 'admin'
  if (/INT/i.test(col.type)) return 0
  const text = `${tag(t)} ${table}.${n}`
  if (col.dflt_value === "'[]'") return JSON.stringify([text])
  if (col.dflt_value === "'{}'") return JSON.stringify({ v: text })
  return text
}

/** One A row and one B row in every table, parents first. */
async function seed(db: D1Database) {
  const { results: tables } = await db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY rowid",
    )
    .all<{ name: string; sql: string }>()
  for (const { name, sql } of tables) {
    const { results: cols } = await db
      .prepare(`SELECT * FROM pragma_table_info('${name}')`)
      .all<{
        name: string
        type: string
        pk: number
        dflt_value: string | null
      }>()
    const { results: fks } = await db
      .prepare(`SELECT "from", "table" FROM pragma_foreign_key_list('${name}')`)
      .all<{ from: string; table: string }>()
    const fk = new Map(fks.map((f) => [f.from, f.table]))
    for (const t of TENANTS) {
      const row = cols.map((c) => value(name, c, fk, sql, t))
      await db
        .prepare(
          `INSERT INTO "${name}" (${cols.map((c) => `"${c.name}"`)}) VALUES (${cols.map(() => '?')})`,
        )
        .bind(...row)
        .run()
    }
  }
}

async function migrate(db: D1Database, dir: URL) {
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(new URL(file, dir), 'utf8')
    for (const stmt of sql
      .split(/;\s*\n/)
      .map((s) => s.replace(/^--.*$/gm, '').trim())) {
      if (stmt) await db.prepare(stmt).run()
    }
  }
}

// --- Query generation from the public schema -------------------------------

const MAX_DEPTH = 8 // gateway limit is 10
const MAX_ALIASES = 15

const schema = buildSchema(publicSdl())

/** A value of a public output type, every string tagged with the tenant. */
function fill(type: GraphQLOutputType, t: T, path: string, depth = 0): unknown {
  if (isNonNullType(type)) return fill(type.ofType, t, path, depth)
  if (isListType(type)) return [fill(type.ofType, t, path, depth)]
  if (isEnumType(type)) return type.getValues()[0].value
  if (isLeafType(type)) {
    if (type.name === 'Boolean') return true
    if (type.name === 'Int' || type.name === 'Float') return 1
    return `${tag(t)} ${path}`
  }
  if (depth > 4) return null
  const objects = isObjectType(type) ? [type] : schema.getPossibleTypes(type)
  const docs = objects.map((obj) => ({
    // content resolves a block's GraphQL type from `_type` (lowerFirst).
    ...Object.fromEntries(
      Object.values(obj.getFields()).map((f) => [
        f.name,
        fill(f.type, t, `${obj.name}.${f.name}`, depth + 1),
      ]),
    ),
    _type: obj.name[0].toLowerCase() + obj.name.slice(1),
    _key: `${tag(t)} ${obj.name}`,
    // Visible to anonymous callers too.
    hidden: false,
  }))
  return isObjectType(type) ? docs[0] : docs
}

/** The Sanity document a GROQ projection asks for, for tenant t. */
function sanityDoc(query: string, t: T) {
  const conference = schema.getType('Conference')
  const fields = isObjectType(conference) ? conference.getFields() : {}
  const special: Record<string, unknown> = {
    _id: CONF[t],
    visibility: 'live',
    lifecycleStatus: 'published',
    theme: {
      primaryColor: `${tag(t)} theme.primaryColor`,
      accentColor: `${tag(t)} theme.accentColor`,
    },
    homepageSections: fields.homepageBlocks
      ? [fill(fields.homepageBlocks.type, t, 'homepageBlocks')].flat(2)
      : [],
  }
  // Every name in the projection, so groq-js finds a value for each.
  const projected = /\{([^{}]*)\}\s*$/
    .exec(query)![1]
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
  return Object.fromEntries(
    projected.map((f) => [
      f,
      f in special
        ? special[f]
        : fields[f]
          ? fill(fields[f].type, t, `Conference.${f}`)
          : `${tag(t)} sanity.${f}`,
    ]),
  )
}
const walked = new Set<string>()

function literal(type: GraphQLInputType, probe: string): string | null {
  if (isNonNullType(type)) return literal(type.ofType, probe)
  if (isListType(type)) return `[${literal(type.ofType, probe)}]`
  if (isEnumType(type)) return type.getValues()[0].name
  if (isInputObjectType(type)) {
    const fields = Object.values(type.getFields()).filter((f) =>
      isNonNullType(f.type),
    )
    return `{${fields.map((f) => `${f.name}: ${literal(f.type, probe)}`).join(', ')}}`
  }
  switch (type.name) {
    case 'Int':
    case 'Float':
      return '1'
    case 'Boolean':
      return 'true'
    default:
      return JSON.stringify(probe)
  }
}

const args = (list: readonly GraphQLArgument[], probe: string) => {
  const req = list.filter((a) => isNonNullType(a.type))
  return req.length
    ? `(${req.map((a) => `${a.name}: ${literal(a.type, probe)}`).join(', ')})`
    : ''
}

function selection(
  type: GraphQLNamedType,
  depth: number,
  probe: string,
): string {
  if (isLeafType(type)) return ''
  const types = isObjectType(type)
    ? [type]
    : schema.getPossibleTypes(type as never)
  const parts = types.map((obj) => {
    const fields = Object.values(obj.getFields()).flatMap((f) => {
      const named = getNamedType(f.type)
      if (!isLeafType(named) && depth >= MAX_DEPTH) return []
      walked.add(`${obj.name}.${f.name}`)
      const sub = selection(named, depth + 1, probe)
      return [`${f.name}${args(f.args, probe)}${sub}`]
    })
    return `... on ${obj.name} { __typename ${fields.join(' ')} }`
  })
  return ` { ${parts.join(' ')} }`
}

/**
 * Every Query field, once per probe id when it or any field below it takes
 * required args, split
 * into queries of at most MAX_ALIASES aliased roots. `roots` maps alias to
 * the Query field it calls.
 */
function queries(tenants: T[]) {
  const roots = Object.values(schema.getQueryType()!.getFields()).flatMap(
    (f) => {
      walked.add(`Query.${f.name}`)
      const sel = (p: string) =>
        `${f.name}${args(f.args, p)}${selection(getNamedType(f.type), 2, p)}`
      // A probe shows up in the text only if some required arg took it.
      const probes = sel('PROBE_SENTINEL').includes('PROBE_SENTINEL')
        ? tenants.flatMap(PROBES)
        : ['']
      return probes.map((p) => ({ field: f.name, sel: sel(p) }))
    },
  )
  const out: { query: string; roots: Record<string, string> }[] = []
  for (let i = 0; i < roots.length; i += MAX_ALIASES) {
    const chunk = roots.slice(i, i + MAX_ALIASES).map((r, j) => ({
      ...r,
      alias: `r${i + j}`,
    }))
    out.push({
      query: `{ ${chunk.map((r) => `${r.alias}: ${r.sel}`).join(' ')} }`,
      roots: Object.fromEntries(chunk.map((r) => [r.alias, r.field])),
    })
  }
  return out
}

/** One document per Mutation field, required args filled, every field selected. */
function mutations() {
  return Object.values(schema.getMutationType()?.getFields() ?? {}).map((f) => {
    walked.add(`Mutation.${f.name}`)
    return `mutation { ${f.name}${args(f.args, '')}${selection(getNamedType(f.type), 2, '')} }`
  })
}

// --- Wiring ----------------------------------------------------------------

const IDENTITY_ENV = {
  BETTER_AUTH_URL: 'http://identity.test',
  IDENTITY_ISSUER: 'https://id.test',
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
  GITHUB_CLIENT_ID: 'gh',
  GITHUB_CLIENT_SECRET: 'gh',
  LINKEDIN_CLIENT_ID: 'li',
  LINKEDIN_CLIENT_SECRET: 'li',
}

const names = Object.keys(SUBGRAPHS)
let mf: Miniflare
let env: Env
let memberJwt: string
/** Every seeded database, for the mutation walk's before/after snapshots. */
const dbs: D1Database[] = []
let identityData: { isVerifiedOrigin(origin: string): Promise<boolean> }
let forgedB: string
let envelopePublicKey: string
/** The envelope each subgraph binding last received. */
const lastEnvelope: Record<string, string | null> = {}
const gateway = createGateway(compose())

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-08-01',
      d1Databases: ['IDENTITY_DB', ...names.map((_, i) => `DB${i}`)],
    }),
  )
  const keys = await generateEnvelopeKeyPair()
  envelopePublicKey = keys.publicPem
  const services = new URL('../../services/', import.meta.url)

  const identityDb = (await mf.getD1Database(
    'IDENTITY_DB',
  )) as unknown as D1Database
  await migrate(identityDb, new URL('identity/migrations/', services))
  await seed(identityDb)
  dbs.push(identityDb)
  // Better Auth signs with the first jwks row; let it make a real key.
  await identityDb.prepare('DELETE FROM jwks').run()
  const identity = await import('../../services/identity/src/index')
  const { createAuth, createData } =
    await import('../../services/identity/src/data')
  const bindings: Record<string, Fetcher> = {}
  // identity checks handoff origins over DIRECTORY, filled in below.
  const identityEnv = {
    ...IDENTITY_ENV,
    DB: identityDb,
    GATEWAY_PUBLIC_KEY: keys.publicPem,
    // Handoff routes are not walked here; JWKS ignores these.
    IDENTITY_EXCHANGE_SECRET: 'unused',
    IDENTITY_UPGRADE_SECRET: 'unused',
    HANDOFF_SITE_LIMIT: { limit: async () => ({ success: true }) },
    HANDOFF_IP_LIMIT: { limit: async () => ({ success: true }) },
    get DIRECTORY() {
      return bindings.DIRECTORY
    },
  }

  for (const [i, name] of names.entries()) {
    const db = (await mf.getD1Database(`DB${i}`)) as unknown as D1Database
    const migrations = new URL(`${name}/migrations/`, services)
    if (existsSync(migrations)) {
      await migrate(db, migrations)
      await seed(db)
      dbs.push(db)
    }
    const worker = (await import(
      /* @vite-ignore */ new URL(`${name}/src/worker.ts`, services).pathname
    )) as { default: { fetch(r: Request, e: unknown): Promise<Response> } }
    const workerEnv = {
      DB: db,
      GATEWAY_PUBLIC_KEY: keys.publicPem,
      CF_API_TOKEN: 'unused',
      CF_ZONE_ID: 'unused',
      IDENTITY: { ensure: async () => undefined },
      SANITY_PROJECT_ID: 'p',
      SANITY_DATASET: 'd',
      SANITY_API_TOKEN_READ: 't',
    }
    bindings[BINDINGS[name as keyof typeof BINDINGS]] = {
      fetch: (url: string, init?: RequestInit) => {
        const entities = String(init?.body).includes('_entities')
        calls.add(entities ? `${name}:_entities` : name)
        lastEnvelope[name] = new Headers(init?.headers).get(ENVELOPE_HEADER)
        return worker.default.fetch(new Request(url, init), workerEnv)
      },
    } as unknown as Fetcher
  }

  env = {
    ENVELOPE_PRIVATE_KEY: keys.privatePem,
    IDENTITY_ISSUER: IDENTITY_ENV.IDENTITY_ISSUER,
    ...bindings,
    API_LIMITER: { limit: async () => ({ success: true }) },
    API_IP_LIMITER: { limit: async () => ({ success: true }) },
    CLIENT_IP_SECRET: 'ip-secret',
    IDENTITY: {
      fetch: (url: string, init?: RequestInit) =>
        identity.default.fetch(new Request(url, init), identityEnv),
    },
    MEMBERSHIP: new identity.Membership({} as never, identityEnv as never),
  } as unknown as Env

  // A real identity JWT for A's member, handed off to A's origin.
  const auth = createAuth(identityDb, IDENTITY_ENV)
  const ctx = await auth.$context
  const { token } = await ctx.internalAdapter.createSession(USER.a, false, {
    origin: ORIGIN,
  })
  const cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`
  const res = await auth.handler(
    new Request(`${IDENTITY_ENV.BETTER_AUTH_URL}/api/auth/token`, {
      headers: { cookie },
    }),
  )
  identityData = createData(identityEnv)
  memberJwt = ((await res.json()) as { token: string }).token

  // Worst case for a forged header: a genuinely signed envelope for B.
  forgedB = await (
    await createSigner(keys.privatePem)
  ).sign(
    {
      typ: 'tenant',
      orgId: ORG.b,
      conferenceId: CONF.b,
      userId: USER.b,
      orgRole: 'admin',
      scopes: [],
    },
    60,
  )
})
afterAll(() => mf?.dispose())

/** Subgraph calls of the current walk; `name:_entities` for entity fetches. */
const calls = new Set<string>()
/** Every @override label in the supergraph. */
const LABELS = [...new Set(compose().match(/(?<=overrideLabel: ")[^"]+/g))]
/** Subgraphs that take fields over with @override(from:, label:). */
const OVERRIDERS = names.filter((n) =>
  compose().includes(`graph: ${n.toUpperCase().replace(/-/g, '_')}, override:`),
)

async function run(query: string, headers: Record<string, string>) {
  const res = await gateway.fetch(
    new Request('http://api.test/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query }),
    }),
    env,
  )
  return res.text()
}

/**
 * Error codes that are a correct refusal, not a broken walk. Empty: no public
 * field refuses today. Add a code only for a deliberate cross-tenant or auth
 * refusal (e.g. TENANT_MISMATCH), never for a validation or execution error.
 */
const EXPECTED_ERRORS = new Set<string>()

describe.each([
  ['anonymous, A origin, A and B ids', false, TENANTS],
  ['member of A, A ids', true, ['a'] as T[]],
  ['member of A, B ids', true, ['b'] as T[]],
])('cross-tenant walk: %s', (_, signedIn, tenants) => {
  // Each @override label off, then on for org A (progressive override).
  it.each([false, true])('labels on for A: %s', async (labelsOn) => {
    env.OVERRIDE_TENANTS = Object.fromEntries(
      LABELS.map((l) => [l, labelsOn ? [ORG.a] : []]),
    )
    calls.clear()
    const headers = (): Record<string, string> => ({
      origin: ORIGIN,
      ...(signedIn ? { authorization: `Bearer ${memberJwt}` } : {}),
    })
    let sawA = false
    for (const { query } of queries(tenants)) {
      const body = await run(query, headers())
      expect(body, query).not.toMatch(MARKER)
      // A failed field would count as walked while proving nothing.
      const { errors = [] } = JSON.parse(body) as {
        errors?: { extensions?: { code?: string } }[]
      }
      const unexpected = errors.filter(
        (e) => !EXPECTED_ERRORS.has(e.extensions?.code ?? ''),
      )
      expect(unexpected, query).toEqual([])
      sawA ||= body.includes('TENANT_A')
      const forged = await run(query, {
        ...headers(),
        [ENVELOPE_HEADER]: forgedB,
      })
      expect(forged, query).toBe(body)
    }
    // The walk reached seeded rows, so a clean result means something.
    if (tenants.includes('a')) expect(sawA).toBe(true)
    // Overriding subgraphs serve A only with the label on; editorial
    // fields then come back through the entity path.
    for (const name of OVERRIDERS) expect(calls.has(name)).toBe(labelsOn)
    if (labelsOn && OVERRIDERS.length) {
      expect([...calls].some((c) => c.endsWith(':_entities'))).toBe(true)
    }
  })
})

it('walks every public field reachable from Query and Mutation', () => {
  queries(TENANTS)
  mutations()
  console.info(`cross-tenant walk: ${walked.size} fields`, [...walked].sort())
  const reachable = Object.values(schema.getTypeMap()).flatMap((t) =>
    isObjectType(t) && !t.name.startsWith('__')
      ? Object.keys(t.getFields()).map((f) => `${t.name}.${f}`)
      : [],
  )
  expect([...walked].sort()).toEqual(reachable.sort())
})

it('resolves each origin over DIRECTORY and forwards its envelope to CONTENT', async () => {
  expect(publicSdl()).not.toMatch(/tenantByHost/)
  // identity's handoff check calls the directory over its binding.
  expect(await identityData.isVerifiedOrigin(ORIGIN)).toBe(true)
  expect(await identityData.isVerifiedOrigin('https://unknown.example')).toBe(
    false,
  )
  // The gateway's own lookup per origin, then content over CONTENT with the
  // envelope the gateway minted for that tenant.
  env.OVERRIDE_TENANTS = {}
  for (const t of TENANTS) {
    const body = await run('{ conference { id title } }', {
      origin: `https://${HOST[t]}`,
    })
    expect(JSON.parse(body)).toEqual({
      data: {
        conference: { id: CONF[t], title: `${tag(t)} Conference.title` },
      },
    })
    expect(
      await verifyEnvelope(lastEnvelope.content!, envelopePublicKey),
    ).toMatchObject({ typ: 'tenant', orgId: ORG[t], conferenceId: CONF[t] })
  }
})

describe('cross-tenant mutation walk', () => {
  /** Every row of every table, serialised. */
  const snapshot = async () => {
    const rows: string[] = []
    for (const db of dbs) {
      const { results } = await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
        )
        .all<{ name: string }>()
      for (const { name } of results) {
        const all = await db.prepare(`SELECT * FROM "${name}"`).all()
        rows.push(...all.results.map((r) => `${name} ${JSON.stringify(r)}`))
      }
    }
    return rows.sort()
  }
  const mutate = async (headers: Record<string, string>) => {
    env.OVERRIDE_TENANTS = {}
    const bodies: { data?: unknown; errors?: unknown[] }[] = []
    for (const m of mutations()) bodies.push(JSON.parse(await run(m, headers)))
    return bodies
  }
  const organizer = () => ({ authorization: `Bearer ${memberJwt}` })

  it('has a mutation to walk', () => {
    expect(mutations().length).toBeGreaterThan(0)
  })

  it.each([
    ['anonymous on A', () => ({ origin: ORIGIN })],
    [
      "A's organizer on B's host",
      () => ({ ...organizer(), origin: `https://${HOST.b}` }),
    ],
    [
      "A's organizer with a forged B envelope on B's host",
      () => ({
        ...organizer(),
        origin: `https://${HOST.b}`,
        [ENVELOPE_HEADER]: forgedB,
      }),
    ],
  ])('%s changes no row', async (_, headers) => {
    const before = await snapshot()
    for (const body of await mutate(headers())) {
      expect(body.errors?.length ?? 0).toBeGreaterThan(0)
    }
    expect(await snapshot()).toEqual(before)
  })

  it('a member of A without a writing role changes no row', async () => {
    const identityDb = dbs[0]
    await identityDb
      .prepare('UPDATE member SET role = ? WHERE userId = ?')
      .bind('member', USER.a)
      .run()
    try {
      const before = await snapshot()
      for (const body of await mutate({ ...organizer(), origin: ORIGIN })) {
        expect(body.errors?.length ?? 0).toBeGreaterThan(0)
      }
      expect(await snapshot()).toEqual(before)
    } finally {
      await identityDb
        .prepare('UPDATE member SET role = ? WHERE userId = ?')
        .bind('admin', USER.a)
        .run()
    }
  })

  it("A's organizer on A's host changes A's rows and never a B row", async () => {
    const before = await snapshot()
    for (const body of await mutate({ ...organizer(), origin: ORIGIN })) {
      expect(body.errors).toBeUndefined()
      expect(JSON.stringify(body)).not.toMatch(MARKER)
    }
    const after = await snapshot()
    expect(after).not.toEqual(before)
    const b = (rows: string[]) => rows.filter((r) => MARKER.test(r))
    expect(b(after)).toEqual(b(before))
  })
})

describe('negative control: the Sanity fixture follows the GROQ', () => {
  const read = async (rewrite: (q: string) => string) => {
    env.OVERRIDE_TENANTS = {}
    rewriteGroq = rewrite
    try {
      return await run('{ conference { id description } }', { origin: ORIGIN })
    } finally {
      rewriteGroq = (q) => q
    }
  }

  it('returns B when the tenant predicates are removed', async () => {
    const body = await read((q) =>
      q.replace(
        /\s*&&\s*(_id == \$conferenceId|organization\._ref == \$orgId)/g,
        '',
      ),
    )
    expect(body).toMatch(MARKER)
  })

  it("returns B when the query pins B's ids under A's params", async () => {
    const body = await read((q) =>
      q
        .replaceAll('$conferenceId', JSON.stringify(CONF.b))
        .replaceAll('$orgId', JSON.stringify(ORG.b)),
    )
    expect(body).toMatch(MARKER)
  })

  it('returns A with the production query', async () => {
    expect(await read((q) => q)).toMatch(/TENANT_A/)
  })
})
