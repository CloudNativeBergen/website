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
  parse,
  Kind,
  type OperationDefinitionNode,
  type GraphQLArgument,
  type GraphQLInputType,
  type GraphQLOutputType,
  type GraphQLNamedType,
  type GraphQLObjectType,
} from 'graphql'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  ENVELOPE_HEADER,
  createSigner,
  verifyEnvelope,
  generateEnvelopeKeyPair,
} from '@runkonf/tenancy'
import {
  BINDINGS,
  OPERATOR_SCOPE,
  OPERATOR_TENANT_HEADER,
  createGateway,
  type Env,
} from './gateway'
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
      const dataset = /_type == "(talk|speaker|schedule)"/.test(groq)
        ? (['b', 'a'] as T[]).flatMap(programDocs)
        : /_type == "(sponsorTier|sponsorForConference)"/.test(groq)
          ? (['b', 'a'] as T[]).flatMap(sponsorDocs)
          : (['b', 'a'] as T[]).map((t) => ({
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
  if (/INT|REAL|FLOA|DOUB/i.test(col.type)) return 0
  const text = `${tag(t)} ${table}.${n}`
  if (col.dflt_value === "'[]'") return JSON.stringify([text])
  if (col.dflt_value === "'{}'") return JSON.stringify({ v: text })
  return text
}

/**
 * The seed sets every 0/1 CHECK column to 1, d1_override (#1925) included.
 * Tests pin it: on for org A's conference only, or for nobody.
 */
async function overrideForA(on: boolean) {
  for (const db of dbs) {
    const { results } = await db
      .prepare(
        "SELECT 1 FROM pragma_table_info('conferences') WHERE name = 'd1_override'",
      )
      .all()
    if (results.length)
      await db
        .prepare('UPDATE conferences SET d1_override = (id = ? AND ?)')
        .bind(CONF.a, on ? 1 : 0)
        .run()
  }
}

/** One A row and one B row in every table, parents first. */
async function seed(db: D1Database) {
  const { results: tables } = await db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY rowid",
    )
    .all<{ name: string; sql: string }>()
  // Creation order is not parent order once a migration rebuilds a parent
  // table (tenant-directory 0005): put every table after the ones it references.
  const refs = (sql: string) =>
    [...sql.matchAll(/REFERENCES\s+"?(\w+)"?/gi)].map((m) => m[1])
  const ordered: typeof tables = []
  while (ordered.length < tables.length) {
    const next = tables.find(
      (t) =>
        !ordered.includes(t) &&
        refs(t.sql).every(
          (r) => r === t.name || ordered.some((o) => o.name === r),
        ),
    )
    if (!next) throw new Error('foreign key cycle between tables')
    ordered.push(next)
  }
  for (const { name, sql } of ordered) {
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

/** sponsors' documents for tenant t: a tier and a published sponsorship. */
function sponsorDocs(t: T) {
  const ref = (_ref: string) => ({ _type: 'reference', _ref })
  const conference = ref(CONF[t])
  return [
    { _id: CONF[t], _type: 'conference', organization: ref(ORG[t]) },
    {
      _id: `tier-${t}`,
      _type: 'sponsorTier',
      conference,
      title: `${tag(t)} tier`,
      tierType: 'standard',
    },
    {
      _id: `sponsor-${t}`,
      _type: 'sponsor',
      name: `${tag(t)} sponsor`,
      website: `https://${tag(t)}.example`,
    },
    {
      _id: `sfc-${t}`,
      _type: 'sponsorForConference',
      conference,
      status: 'closed-won',
      sponsor: ref(`sponsor-${t}`),
      tier: ref(`tier-${t}`),
    },
  ]
}

/** program's documents for tenant t: a published schedule, a confirmed talk, its speaker. */
function programDocs(t: T) {
  const ref = (_ref: string) => ({ _type: 'reference', _ref })
  const conference = ref(CONF[t])
  return [
    {
      _id: CONF[t],
      _type: 'conference',
      organization: ref(ORG[t]),
      programDate: '2000-01-01',
    },
    {
      _id: `speaker-${t}`,
      _type: 'speaker',
      name: `${tag(t)} speaker`,
      title: `${tag(t)} title`,
      bio: `${tag(t)} bio`,
      links: [`https://${tag(t)}.example`],
      email: `${tag(t)} email`,
    },
    {
      _id: `talk-${t}`,
      _type: 'talk',
      status: 'confirmed',
      conference,
      title: `${tag(t)} talk`,
      format: 'presentation_25',
      level: 'beginner',
      speakers: [ref(`speaker-${t}`)],
    },
    {
      _id: `schedule-${t}`,
      _type: 'schedule',
      conference,
      date: '2026-01-01',
      tracks: [
        {
          talks: [
            { startTime: '09:00', endTime: '09:45', talk: ref(`talk-${t}`) },
          ],
        },
      ],
    },
  ]
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
    return `__typename ${fields.join(' ')}`
  })
  // An inline fragment counts toward the gateway's depth limit: only an
  // abstract type needs one per possible type.
  return isObjectType(type)
    ? ` { ${parts[0]} }`
    : ` { ${parts.map((p, i) => `... on ${types[i].name} { ${p} }`).join(' ')} }`
}

/**
 * Every Query field, once per probe id when it or any field below it takes
 * required args, split
 * into queries of at most MAX_ALIASES aliased roots. `roots` maps alias to
 * the Query field it calls.
 */
/**
 * Root fields tagged @tag(name: "operator") in the composed supergraph
 * (#1962): derived, so a new operator field is walked as one and fails the
 * walk if it forgets requirePlatform, instead of passing as a public field.
 */
function operatorFields(root: 'Query' | 'Mutation') {
  const out = new Set<string>()
  for (const d of parse(compose()).definitions) {
    if (
      (d.kind !== Kind.OBJECT_TYPE_DEFINITION &&
        d.kind !== Kind.OBJECT_TYPE_EXTENSION) ||
      d.name.value !== root
    )
      continue
    for (const f of d.fields ?? [])
      if (
        f.directives?.some(
          (x) =>
            x.name.value === 'tag' &&
            x.arguments?.some(
              (a) =>
                a.name.value === 'name' &&
                a.value.kind === Kind.STRING &&
                a.value.value === 'operator',
            ),
        )
      )
        out.add(f.name.value)
  }
  return out
}
/** Operator-only mutations: refused to every tenant envelope (#1924, #1923). */
const OPERATOR_MUTATIONS = operatorFields('Mutation')
/**
 * Query fields every walker (site lane, tenant envelope or none) is refused:
 * the @tag(operator) ones by requirePlatform, myOrganizations (#2036) because
 * it needs a session with no tenant.
 */
const OPERATOR_QUERIES = new Set([
  ...operatorFields('Query'),
  'myOrganizations',
])
/** Public roots too costly to batch: each gets its own document. */
const ALONE = new Set([
  'program',
  'talk',
  'speakers',
  'speaker',
  'speakerBySlug',
  'sponsors',
  'sponsorTiers',
])

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
  // Operator-only roots go alone: every walker must get FORBIDDEN for them.
  for (const r of roots.filter((r) => OPERATOR_QUERIES.has(r.field)))
    out.push({ query: `{ ${r.sel} }`, roots: { [r.field]: r.field } })
  // The demand-control cost is summed over one operation: the full program
  // (~900) or a profile's nested talks batched with every other root pass
  // the 1000 ceiling.
  for (const r of roots.filter((r) => ALONE.has(r.field)))
    out.push({ query: `{ ${r.sel} }`, roots: { [r.field]: r.field } })
  const pub = roots.filter(
    (r) => !OPERATOR_QUERIES.has(r.field) && !ALONE.has(r.field),
  )
  for (let i = 0; i < pub.length; i += MAX_ALIASES) {
    const chunk = pub.slice(i, i + MAX_ALIASES).map((r, j) => ({
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
    // An empty patch is a deliberate no-op, so updateConference needs a real edit.
    const a =
      f.name === 'updateConference'
        ? '(input: {tagline: "x"})'
        : args(f.args, '')
    return {
      field: f.name,
      doc: `mutation { ${f.name}${a}${selection(getNamedType(f.type), 2, '')} }`,
    }
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
let sign: (p: Record<string, unknown>) => Promise<string>
let envelopePublicKey: string
/** D1 calls since the last reset, by `subgraph:root fields` of the request. */
const d1Calls: Record<string, number> = {}
/** SQL each worker prepared, by worker name, for query-shape guards. */
const d1Sql: Record<string, string[]> = {}
/** Root fields of the request each subgraph is serving. */
const currentRoots: Record<string, string> = {}
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
    // The identity subgraph and Membership share one D1, as deployed, so a
    // membership change shows in both on the next request.
    const db =
      name === 'identity'
        ? identityDb
        : ((await mf.getD1Database(`DB${i}`)) as unknown as D1Database)
    const migrations = new URL(`${name}/migrations/`, services)
    if (name !== 'identity' && existsSync(migrations)) {
      await migrate(db, migrations)
      await seed(db)
      dbs.push(db)
    }
    const worker = (await import(
      /* @vite-ignore */ new URL(`${name}/src/worker.ts`, services).pathname
    )) as { default: { fetch(r: Request, e: unknown): Promise<Response> } }
    const workerEnv = {
      ...IDENTITY_ENV,
      // Counts every D1 call the worker makes, for the no-read guards.
      DB: new Proxy(db, {
        get: (target, key) => {
          const v = Reflect.get(target, key)
          if (typeof v !== 'function') return v
          return (...a: unknown[]) => {
            const k = `${name}:${currentRoots[name]}`
            d1Calls[k] = (d1Calls[k] ?? 0) + 1
            if (key === 'prepare') (d1Sql[name] ??= []).push(String(a[0]))
            return v.apply(target, a)
          }
        },
      }),
      GATEWAY_PUBLIC_KEY: keys.publicPem,
      CF_API_TOKEN: 'unused',
      CF_ZONE_ID: 'unused',
      // identity's real membership list, over the same D1 (#2036).
      IDENTITY: {
        ensure: async () => undefined,
        memberships: (userId: string) =>
          createData(identityEnv).memberships(userId),
      },
      SANITY_PROJECT_ID: 'p',
      SANITY_DATASET: 'd',
      SANITY_API_TOKEN_READ: 't',
    }
    bindings[BINDINGS[name as keyof typeof BINDINGS]] = {
      fetch: (url: string, init?: RequestInit) => {
        const body = String(init?.body)
        // Label each call by the root fields it sends; `name` alone means a
        // root other than the entity path or the conference subgraph's own
        // conferenceEditions, which is served whatever the label says.
        const op = parse(JSON.parse(body).query).definitions.find(
          (d) => d.kind === Kind.OPERATION_DEFINITION,
        ) as OperationDefinitionNode
        const roots = op.selectionSet.selections.flatMap((x) =>
          x.kind === Kind.FIELD ? [x.name.value] : [],
        )
        for (const f of roots) calls.add(`${name}:${f}`)
        if (roots.some((f) => f !== '_entities' && f !== 'conferenceEditions'))
          calls.add(name)
        lastEnvelope[name] = new Headers(init?.headers).get(ENVELOPE_HEADER)
        currentRoots[name] = roots.join(',')
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
    API_MUTATION_LIMITER: { limit: async () => ({ success: true }) },
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

  const signer = await createSigner(keys.privatePem)
  sign = (p) => signer.sign(p as never, 60)
  // Worst case for a forged header: a genuinely signed envelope for B.
  forgedB = await signer.sign(
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
    await overrideForA(labelsOn)
    calls.clear()
    const headers = (): Record<string, string> => ({
      origin: ORIGIN,
      ...(signedIn ? { authorization: `Bearer ${memberJwt}` } : {}),
    })
    let sawA = false
    for (const { query, roots } of queries(tenants)) {
      const body = await run(query, headers())
      expect(body, query).not.toMatch(MARKER)
      if (Object.values(roots).some((f) => OPERATOR_QUERIES.has(f))) {
        const refused = JSON.parse(body)
        for (const f of Object.values(roots))
          expect(refused.data?.[f] ?? null, query).toBeNull()
        expect(refused.errors[0].extensions.code, query).toBe('FORBIDDEN')
        expect(
          await run(query, { ...headers(), [ENVELOPE_HEADER]: forgedB }),
          query,
        ).toBe(body)
        continue
      }
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
    // The label moves `conference` only; editions is always served here.
    expect(calls.has('conference:conference')).toBe(labelsOn)
    expect(calls.has('conference:conferenceEditions')).toBe(true)
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
  await overrideForA(false)
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
  // Before the tests' snapshots, so the reset is not counted as a write.
  beforeEach(async () => {
    env.OVERRIDE_TENANTS = {}
    await overrideForA(false)
  })
  const mutate = async (headers: Record<string, string>, skip?: RegExp) => {
    const bodies: { data?: unknown; errors?: unknown[] }[] = []
    for (const m of mutations())
      if (!skip?.test(m.doc)) bodies.push(JSON.parse(await run(m.doc, headers)))
    return bodies
  }
  const organizer = () => ({ authorization: `Bearer ${memberJwt}` })

  it('has a mutation to walk', () => {
    expect(mutations().length).toBeGreaterThan(0)
  })

  it('takes the operator fields from @tag(operator) in the supergraph (#1962)', () => {
    // Anchors only: the derived sets grow with every new operator field.
    expect([...OPERATOR_MUTATIONS]).toEqual(
      expect.arrayContaining([
        'provisionOrganization',
        'operatorInviteMember',
        'prunePushSubscriptions',
      ]),
    )
    expect([...OPERATOR_QUERIES]).toEqual(
      expect.arrayContaining(['organizations', 'conferences']),
    )
    // Public fields stay public.
    expect(OPERATOR_MUTATIONS.has('updateConference')).toBe(false)
    expect(OPERATOR_QUERIES.has('conference')).toBe(false)
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
      // Push subscriptions belong to the signed-in user, not the org, so any
      // member may write their own (services/identity/src/push.test.ts).
      for (const body of await mutate(
        { ...organizer(), origin: ORIGIN },
        /^mutation \{ (subscribePush|unsubscribePush)\b/,
      )) {
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
    for (const { field, doc } of mutations()) {
      const body = JSON.parse(
        await run(doc, { ...organizer(), origin: ORIGIN }),
      ) as { data?: unknown; errors?: unknown[] }
      const json = JSON.stringify(body)
      if (OPERATOR_MUTATIONS.has(field))
        expect(body.errors).toMatchObject([
          { extensions: { code: 'FORBIDDEN' } },
        ])
      // Membership (#1923): probe ids name no member or invitation of A, and
      // probe emails are no address, so these refuse; the snapshot holds B.
      else if (
        // subscribePush: the probe endpoint is not https.
        /"(inviteMember|cancelInvitation|removeMember|changeMemberRole|subscribePush)"/.test(
          json,
        )
      )
        expect(['NOT_FOUND', 'BAD_USER_INPUT']).toContain(
          (body.errors as { extensions?: { code?: string } }[])?.[0]?.extensions
            ?.code,
        )
      else expect(body.errors).toBeUndefined()
      expect(JSON.stringify(body)).not.toMatch(MARKER)
    }
    const after = await snapshot()
    expect(after).not.toEqual(before)
    const b = (rows: string[]) => rows.filter((r) => MARKER.test(r))
    expect(b(after)).toEqual(b(before))
  })
})

// --- conferenceEditions (#1970) ---------------------------------------------

const EDITIONS = '{ conferenceEditions { id title visibility published } }'
/** Org A's extra editions: a draft and a published, unlisted one. */
const DRAFT_A = 'conf-tenant-a-draft'
const UNLISTED_A = 'conf-tenant-a-unlisted'
const conferenceDb = async () => {
  for (const db of dbs) {
    const { results } = await db
      .prepare(
        "SELECT 1 FROM pragma_table_info('conferences') WHERE name = 'published'",
      )
      .all()
    if (results.length) return db
  }
  throw new Error('no conference D1')
}
async function addEditions() {
  const db = await conferenceDb()
  for (const [id, published, visibility] of [
    [DRAFT_A, 0, 'live'],
    [UNLISTED_A, 1, 'unlisted'],
  ] as const)
    await db
      .prepare(
        'INSERT OR REPLACE INTO conferences (conference_id, org_id, published, title, visibility) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(id, ORG.a, published, `TENANT_A ${id}`, visibility)
      .run()
}
async function dropEditions() {
  await (
    await conferenceDb()
  )
    .prepare('DELETE FROM conferences WHERE conference_id IN (?, ?)')
    .bind(DRAFT_A, UNLISTED_A)
    .run()
}
const editionIds = (body: string) => {
  const json = JSON.parse(body) as {
    data?: { conferenceEditions: { id: string }[] }
    errors?: unknown
  }
  expect(json.errors).toBeUndefined()
  return json.data!.conferenceEditions.map((e) => e.id).sort()
}

describe('conferenceEditions (#1970)', () => {
  beforeAll(addEditions)
  afterAll(dropEditions)
  beforeEach(async () => {
    env.OVERRIDE_TENANTS = {}
    await overrideForA(false)
  })
  const member = () => ({ authorization: `Bearer ${memberJwt}` })

  it("lists every edition of the member's own org, and no other org's", async () => {
    const body = await run(EDITIONS, { ...member(), origin: ORIGIN })
    expect(body).not.toMatch(MARKER)
    expect(editionIds(body)).toEqual([CONF.a, DRAFT_A, UNLISTED_A].sort())
  })

  it('gives an anonymous caller published, live editions only, like conference', async () => {
    const body = await run(EDITIONS, { origin: ORIGIN })
    expect(editionIds(body)).toEqual([CONF.a])
    // The same caller reads that edition through conference too.
    expect(
      JSON.parse(await run('{ conference { id } }', { origin: ORIGIN })),
    ).toEqual({ data: { conference: { id: CONF.a } } })
  })

  it("never lists another org's editions, forged envelope or not", async () => {
    // B's host lists B's, A's host A's, whatever envelope the caller sends:
    // the gateway mints its own from the host.
    expect(
      editionIds(await run(EDITIONS, { origin: `https://${HOST.b}` })),
    ).toEqual([CONF.b])
    for (const headers of [
      { ...member(), origin: ORIGIN, [ENVELOPE_HEADER]: forgedB },
      { origin: ORIGIN, [ENVELOPE_HEADER]: forgedB },
    ]) {
      const body = await run(EDITIONS, headers)
      expect(body).not.toMatch(MARKER)
      expect(editionIds(body)).toContain(CONF.a)
    }
  })
})

// --- lifecycleStatus (#1971) -----------------------------------------------

const LIFECYCLE = '{ conferenceEditions { id lifecycleStatus } }'
const directoryConferences = async () => {
  for (const db of dbs) {
    const { results } = await db
      .prepare(
        "SELECT 1 FROM pragma_table_info('conferences') WHERE name = 'lifecycle'",
      )
      .all()
    if (results.length) return db
  }
  throw new Error('no tenant-directory D1')
}
const setLifecycle = async (id: string, lifecycle: string) =>
  (await directoryConferences())
    .prepare(
      'INSERT INTO conferences (id, org_id, slug, name, lifecycle) VALUES (?1, ?2, ?1, ?1, ?3) ON CONFLICT (id) DO UPDATE SET lifecycle = ?3',
    )
    .bind(id, id === CONF.b ? ORG.b : ORG.a, lifecycle)
    .run()
const lifecycles = (body: string) => {
  const json = JSON.parse(body) as {
    data?: { conferenceEditions: { id: string; lifecycleStatus: string }[] }
    errors?: unknown
  }
  expect(json.errors, body).toBeUndefined()
  return Object.fromEntries(
    json.data!.conferenceEditions.map((e) => [e.id, e.lifecycleStatus]),
  )
}
/** An `_entities` call straight to tenant-directory, bypassing the gateway. */
async function directoryEntities(
  envelope: Record<string, unknown> | null,
  id: string,
  subgraph: 'tenant-directory' | 'conference' = 'tenant-directory',
) {
  const res = await (
    env[BINDINGS[subgraph] as keyof Env] as unknown as Fetcher
  ).fetch(`https://${subgraph}.internal/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(envelope ? { [ENVELOPE_HEADER]: await sign(envelope) } : {}),
    },
    body: JSON.stringify({
      query:
        subgraph === 'conference'
          ? 'query($r: [_Any!]!) { _entities(representations: $r) { ... on ConferenceEdition { id } } }'
          : 'query($r: [_Any!]!) { _entities(representations: $r) { ... on ConferenceEdition { id lifecycleStatus } } }',
      variables: { r: [{ __typename: 'ConferenceEdition', id }] },
    }),
  })
  return ((await res.json()) as { data: { _entities: unknown[] } }).data
    ._entities
}

describe('lifecycleStatus (#1971)', () => {
  beforeAll(async () => {
    await addEditions()
    await setLifecycle(DRAFT_A, 'draft')
    await setLifecycle(UNLISTED_A, 'archived')
  })
  afterAll(async () => {
    await dropEditions()
    await (
      await directoryConferences()
    )
      .prepare('DELETE FROM conferences WHERE id IN (?, ?)')
      .bind(DRAFT_A, UNLISTED_A)
      .run()
    await setLifecycle(CONF.a, 'live')
  })
  beforeEach(async () => {
    env.OVERRIDE_TENANTS = {}
    await overrideForA(false)
    await setLifecycle(CONF.a, 'live')
  })
  const member = () => ({ authorization: `Bearer ${memberJwt}` })
  const tenantA = {
    typ: 'tenant',
    orgId: ORG.a,
    conferenceId: CONF.a,
    userId: USER.a,
    orgRole: 'admin',
    scopes: [],
  }

  it('gives a member every lifecycle value of their own editions', async () => {
    expect(
      lifecycles(await run(LIFECYCLE, { ...member(), origin: ORIGIN })),
    ).toEqual({
      [CONF.a]: 'live',
      [DRAFT_A]: 'draft',
      [UNLISTED_A]: 'archived',
    })
  })

  it('gives an anonymous caller live on public editions, and never another value', async () => {
    expect(lifecycles(await run(LIFECYCLE, { origin: ORIGIN }))).toEqual({
      [CONF.a]: 'live',
    })
    // Public in conference D1 but archived in the directory: null, not archived.
    await setLifecycle(CONF.a, 'archived')
    expect(lifecycles(await run(LIFECYCLE, { origin: ORIGIN }))).toEqual({
      [CONF.a]: null,
    })
  })

  it("resolves no reference to another org's conference, even for an admin", async () => {
    // Positive control: the same call resolves A's own.
    expect(await directoryEntities(tenantA, CONF.a)).toEqual([
      { id: CONF.a, lifecycleStatus: 'live' },
    ])
    expect(await directoryEntities(tenantA, CONF.b)).toEqual([null])
    expect(await directoryEntities(tenantA, 'conf-nonexistent')).toEqual([null])
  })

  it('resolves no draft or archived reference for a non-member or no envelope', async () => {
    const anon = { ...tenantA, userId: null, orgRole: null }
    const operator = { ...anon, scopes: [OPERATOR_SCOPE] }
    for (const e of [anon, operator]) {
      expect(await directoryEntities(e, CONF.a)).toEqual([
        { id: CONF.a, lifecycleStatus: 'live' },
      ])
      expect(await directoryEntities(e, DRAFT_A)).toEqual([null])
      expect(await directoryEntities(e, UNLISTED_A)).toEqual([null])
    }
    expect(await directoryEntities(null, CONF.a)).toEqual([null])
  })

  // The conference subgraph's own ConferenceEdition reference resolver.
  it('conference subgraph resolves only editions the caller may list, in their org', async () => {
    const entity = (e: Record<string, unknown> | null, id: string) =>
      directoryEntities(e, id, 'conference')
    const anon = { ...tenantA, userId: null, orgRole: null }
    // Positive control.
    expect(await entity(tenantA, CONF.a)).toEqual([{ id: CONF.a }])
    for (const e of [anon]) {
      expect(await entity(e, DRAFT_A)).toEqual([null])
      expect(await entity(e, UNLISTED_A)).toEqual([null])
    }
    // An A admin does not get B's edition.
    expect(await entity(tenantA, CONF.b)).toEqual([null])
  })
})

// --- primaryHost (#1977) ----------------------------------------------------

describe('primaryHost (#1977)', () => {
  const HOSTS = '{ conferenceEditions { id primaryHost } }'
  const CUSTOM = 'conf.tenant-a.example'
  const FOREIGN = 'foreign.tenant-b-marker.example'
  const domain = async (
    hostname: string,
    org: string,
    conf: string,
    kind: string,
    verification: string,
  ) =>
    (await directoryDomains())
      .prepare(
        'INSERT INTO domains (hostname, org_id, conference_id, kind, verification) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(hostname, org, conf, kind, verification)
      .run()
  const directoryDomains = async () => {
    for (const db of dbs) {
      const { results } = await db
        .prepare("SELECT 1 FROM sqlite_master WHERE name = 'domains'")
        .all()
      if (results.length) return db
    }
    throw new Error('no tenant-directory D1')
  }
  const hosts = async () => {
    const body = await run(HOSTS, {
      authorization: `Bearer ${memberJwt}`,
      origin: ORIGIN,
    })
    expect(body).not.toMatch(MARKER)
    const json = JSON.parse(body) as {
      data?: { conferenceEditions: { id: string; primaryHost: string }[] }
      errors?: unknown
    }
    expect(json.errors, body).toBeUndefined()
    return Object.fromEntries(
      json.data!.conferenceEditions.map((e) => [e.id, e.primaryHost]),
    )
  }
  beforeAll(async () => {
    await addEditions()
    await setLifecycle(DRAFT_A, 'draft')
    await setLifecycle(UNLISTED_A, 'live')
  })
  const dropDomains = async () =>
    (await directoryDomains())
      .prepare('DELETE FROM domains WHERE hostname IN (?, ?)')
      .bind(CUSTOM, FOREIGN)
      .run()
  afterEach(dropDomains)
  afterAll(async () => {
    await dropEditions()
    await (
      await directoryConferences()
    )
      .prepare('DELETE FROM conferences WHERE id IN (?, ?)')
      .bind(DRAFT_A, UNLISTED_A)
      .run()
  })
  beforeEach(async () => {
    env.OVERRIDE_TENANTS = {}
    await overrideForA(false)
    await setLifecycle(CONF.a, 'live')
  })

  it('serves the verified platform-edition host, and null with no domains', async () => {
    expect(await hosts()).toEqual({
      [CONF.a]: HOST.a,
      [DRAFT_A]: null,
      [UNLISTED_A]: null,
    })
  })

  it('prefers a verified custom domain over the platform host', async () => {
    await domain(CUSTOM, ORG.a, CONF.a, 'custom', 'verified')
    expect((await hosts())[CONF.a]).toBe(CUSTOM)
  })

  it.each(['pending', 'failed'])(
    'falls back to the platform host past a %s custom domain',
    async (verification) => {
      await domain(CUSTOM, ORG.a, CONF.a, 'custom', verification)
      expect((await hosts())[CONF.a]).toBe(HOST.a)
    },
  )

  it("never serves another org's domain, even one pointing at this edition", async () => {
    await domain(FOREIGN, ORG.b, DRAFT_A, 'custom', 'verified')
    // hosts() also asserts no B marker anywhere in the body.
    expect((await hosts())[DRAFT_A]).toBeNull()
  })
})

describe('operator lane: Kontroll members (#1956)', () => {
  const OPS = 'https://my.konf.app'
  let opsJwt: string
  const identityDb = () => dbs[0]
  // INSERT OR REPLACE skips the LAST_OWNER triggers, so a test can demote
  // the org's only owner back to the seeded admin.
  const setRole = (role: string) =>
    identityDb()
      .prepare(
        "INSERT OR REPLACE INTO member (id, organizationId, userId, role, createdAt) SELECT COALESCE((SELECT id FROM member WHERE userId = ?1 AND organizationId = ?2), 'member-ops'), ?2, ?1, ?3, 0",
      )
      .bind(USER.a, ORG.a, role)
      .run()
  const ops = (tenant?: string): Record<string, string> => ({
    origin: OPS,
    authorization: `Bearer ${opsJwt}`,
    ...(tenant ? { [OPERATOR_TENANT_HEADER]: tenant } : {}),
  })
  /** Rows of every D1 except identity's, whose member table tests edit. */
  const tenantRows = async () => {
    const rows: string[] = []
    for (const db of dbs.slice(1)) {
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
  const directoryDb = async () => {
    for (const db of dbs) {
      const { results } = await db
        .prepare(
          "SELECT 1 FROM pragma_table_info('conferences') WHERE name = 'api_read'",
        )
        .all()
      if (results.length) return db
    }
    throw new Error('no tenant-directory D1')
  }
  const FLAGS = '{ rolloutFlags { apiRead identityLogin d1Write } }'
  // A fresh tagline each time: a repeat would be a no-op, not a write.
  const write = () =>
    run(
      `mutation { updateConference(input: {tagline: "${crypto.randomUUID()}"}) { id } }`,
      ops(HOST.a),
    )

  beforeAll(async () => {
    env.OPERATOR_ORIGIN = OPS
    // A's member (seeded role admin), handed off to Kontroll's origin.
    const { createAuth } = await import('../../services/identity/src/data')
    const auth = createAuth(identityDb(), IDENTITY_ENV)
    const ctx = await auth.$context
    const { token } = await ctx.internalAdapter.createSession(USER.a, false, {
      origin: OPS,
    })
    const cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`
    const res = await auth.handler(
      new Request(`${IDENTITY_ENV.BETTER_AUTH_URL}/api/auth/token`, {
        headers: { cookie },
      }),
    )
    opsJwt = ((await res.json()) as { token: string }).token
    // Distinct flags per tenant, so a test can tell whose it got.
    await (
      await directoryDb()
    )
      .prepare(
        'UPDATE conferences SET api_read = (id = ?), identity_login = 1, d1_write = (id <> ?)',
      )
      .bind(CONF.a, CONF.a)
      .run()
  })
  afterAll(async () => {
    delete (env as Partial<Env>).OPERATOR_ORIGIN
    await setRole('admin')
    await (
      await directoryDb()
    )
      .prepare(
        'UPDATE conferences SET api_read = 1, identity_login = 1, d1_write = 1',
      )
      .run()
  })
  beforeEach(async () => {
    env.OVERRIDE_TENANTS = {}
    await overrideForA(false)
    await setRole('admin')
    for (const k of Object.keys(lastEnvelope)) lastEnvelope[k] = null
    calls.clear()
  })

  it('gives a member their own org as a tenant envelope with their live role', async () => {
    const body = JSON.parse(await run('{ conference { id } }', ops(HOST.a)))
    expect(body).toEqual({ data: { conference: { id: CONF.a } } })
    expect(
      await verifyEnvelope(lastEnvelope.content!, envelopePublicKey),
    ).toEqual({
      typ: 'tenant',
      orgId: ORG.a,
      conferenceId: CONF.a,
      userId: USER.a,
      orgRole: 'admin',
      scopes: [],
    })
  })

  it.each(['owner', 'admin'])(
    'lets a member with role %s write',
    async (role) => {
      await setRole(role)
      const before = await tenantRows()
      const body = JSON.parse(await write())
      expect(body).toEqual({ data: { updateConference: { id: CONF.a } } })
      expect(await tenantRows()).not.toEqual(before)
    },
  )

  it('refuses a write by a member with role member, and applies a role change on the next request', async () => {
    await setRole('member')
    const before = await tenantRows()
    const body = JSON.parse(await write())
    expect(body.errors?.length).toBeGreaterThan(0)
    expect(await tenantRows()).toEqual(before)
    await setRole('admin')
    expect(JSON.parse(await write())).toEqual({
      data: { updateConference: { id: CONF.a } },
    })
  })

  it('refuses another org and a nonexistent one with the same body, reading neither', async () => {
    const other = await gateway.fetch(
      new Request('http://api.test/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...ops(HOST.b) },
        body: JSON.stringify({ query: '{ conference { id } }' }),
      }),
      env,
    )
    const missing = await run('{ conference { id } }', ops('nowhere.example'))
    expect(other.status).toBe(403)
    const otherBody = await other.text()
    expect(JSON.parse(otherBody).errors[0].extensions.code).toBe('FORBIDDEN')
    expect(missing).toBe(otherBody)
    expect(otherBody).not.toMatch(MARKER)
    // Only the gateway's host lookup ran: no subgraph read, no envelope.
    expect([...calls].sort()).toEqual([
      'tenant-directory',
      'tenant-directory:tenantByHost',
    ])
    expect(Object.values(lastEnvelope).filter(Boolean)).toEqual([])
  })

  it('refuses the next request once the member is removed', async () => {
    expect(JSON.parse(await run(FLAGS, ops(HOST.a))).data).toBeTruthy()
    await identityDb()
      .prepare('DELETE FROM member WHERE userId = ?')
      .bind(USER.a)
      .run()
    calls.clear()
    try {
      const body = JSON.parse(await run('{ conference { id } }', ops(HOST.a)))
      expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
      // Only the gateway's host lookup ran: no subgraph read, no envelope.
      expect([...calls].sort()).toEqual([
        'tenant-directory',
        'tenant-directory:tenantByHost',
      ])
      expect(Object.values(lastEnvelope).filter(Boolean)).toEqual([])
    } finally {
      await setRole('admin')
    }
  })

  const PROVISION =
    'mutation { provisionOrganization(idempotencyKey: "k", orgId: "org-new", orgSlug: "new", conferenceId: "conf-new") { id } }'
  const minted = async () =>
    lastEnvelope.content
      ? ((await verifyEnvelope(lastEnvelope.content, envelopePublicKey)) as {
          typ: string
          scopes?: string[]
        })
      : null

  it('never mints a member a platform envelope or operator scope', async () => {
    // No tenant header: a UserContext only (#2036), no org, no scope.
    for (const k of Object.keys(lastEnvelope)) delete lastEnvelope[k]
    await run('{ conference { id } }', ops())
    for (const token of Object.values(lastEnvelope).filter(Boolean))
      expect(await verifyEnvelope(token!, envelopePublicKey)).toEqual({
        typ: 'user',
        userId: USER.a,
      })
    // Own org: a tenant envelope without OPERATOR_SCOPE.
    await run('{ conference { id } }', ops(HOST.a))
    const own = await minted()
    expect(own?.typ).toBe('tenant')
    expect(own?.typ).not.toBe('platform')
    expect(own?.scopes ?? []).not.toContain(OPERATOR_SCOPE)
  })

  it("refuses a member's provisionOrganization in requirePlatform, writing nothing", async () => {
    const before = await tenantRows()
    for (const headers of [ops(), ops(HOST.a)]) {
      const body = JSON.parse(await run(PROVISION, headers))
      expect(body.data?.provisionOrganization ?? null).toBeNull()
      // The field exists (#1959): FORBIDDEN from requirePlatform, not a
      // schema-validation error from a cut field.
      expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
    }
    // provision never ran: no directory row appeared.
    expect(await tenantRows()).toEqual(before)
  })

  it('positive control: an operator with no tenant reaches provision', async () => {
    await identityDb()
      .prepare('UPDATE user SET platformOperator = 1 WHERE id = ?')
      .bind(USER.a)
      .run()
    try {
      const body = JSON.parse(await run(PROVISION, ops()))
      expect(
        (await verifyEnvelope(
          lastEnvelope['tenant-directory']!,
          envelopePublicKey,
        )) as { typ: string },
      ).toMatchObject({ typ: 'platform' })
      // Past requirePlatform: provision's own argument check answers.
      expect(body.errors[0].extensions.code).toBe('BAD_USER_INPUT')
      expect(body.errors[0].message).toBe(
        'orgId must be "organization.<orgSlug>"',
      )
    } finally {
      await identityDb()
        .prepare('UPDATE user SET platformOperator = 0 WHERE id = ?')
        .bind(USER.a)
        .run()
    }
  })

  it("serves the selected tenant's rolloutFlags to its member, null without one", async () => {
    expect(JSON.parse(await run(FLAGS, ops(HOST.a)))).toEqual({
      data: {
        rolloutFlags: { apiRead: true, identityLogin: true, d1Write: false },
      },
    })
    expect(JSON.parse(await run(FLAGS, ops()))).toEqual({
      data: { rolloutFlags: null },
    })
    const other = JSON.parse(await run(FLAGS, ops(HOST.b)))
    expect(other.data ?? null).toBeNull()
    expect(other.errors[0].extensions.code).toBe('FORBIDDEN')
  })

  it("serves an operator the selected tenant's flags and keeps the operator envelope", async () => {
    await identityDb()
      .prepare('UPDATE user SET platformOperator = 1 WHERE id = ?')
      .bind(USER.a)
      .run()
    try {
      expect(JSON.parse(await run(FLAGS, ops(HOST.b)))).toEqual({
        data: {
          rolloutFlags: { apiRead: false, identityLogin: true, d1Write: true },
        },
      })
      await run('{ conference { id } }', ops(HOST.b))
      expect(
        await verifyEnvelope(lastEnvelope.content!, envelopePublicKey),
      ).toMatchObject({
        typ: 'tenant',
        orgId: ORG.b,
        orgRole: null,
        scopes: [OPERATOR_SCOPE],
      })
    } finally {
      await identityDb()
        .prepare('UPDATE user SET platformOperator = 0 WHERE id = ?')
        .bind(USER.a)
        .run()
    }
  })
  describe('conferenceEditions (#1970)', () => {
    beforeAll(addEditions)
    afterAll(dropEditions)

    it("lists the selected tenant's editions to its member", async () => {
      expect(editionIds(await run(EDITIONS, ops(HOST.a)))).toEqual(
        [CONF.a, DRAFT_A, UNLISTED_A].sort(),
      )
    })

    it("gives the selected tenant's member every lifecycle value", async () => {
      await setLifecycle(DRAFT_A, 'draft')
      try {
        expect(lifecycles(await run(LIFECYCLE, ops(HOST.a)))).toEqual({
          [CONF.a]: 'live',
          [DRAFT_A]: 'draft',
          [UNLISTED_A]: null,
        })
      } finally {
        await (
          await directoryConferences()
        )
          .prepare('DELETE FROM conferences WHERE id = ?')
          .bind(DRAFT_A)
          .run()
      }
    })

    it("lists an operator the selected tenant's public editions, like conference", async () => {
      await identityDb()
        .prepare('UPDATE user SET platformOperator = 1 WHERE id = ?')
        .bind(USER.a)
        .run()
      try {
        // Operator of B, member of A: B's editions, no org role there.
        const body = await run(EDITIONS, ops(HOST.b))
        expect(editionIds(body)).toEqual([CONF.b])
        // lifecycleStatus follows the same rule: live on a public edition.
        expect(lifecycles(await run(LIFECYCLE, ops(HOST.b)))).toEqual({
          [CONF.b]: 'live',
        })
        expect(
          await verifyEnvelope(lastEnvelope.conference!, envelopePublicKey),
        ).toMatchObject({
          orgId: ORG.b,
          orgRole: null,
          scopes: [OPERATOR_SCOPE],
        })
      } finally {
        await identityDb()
          .prepare('UPDATE user SET platformOperator = 0 WHERE id = ?')
          .bind(USER.a)
          .run()
      }
    })
  })
})

describe('operator lane: organizations (#1973)', () => {
  const OPS = 'https://my.konf.app'
  let opsJwt: string
  const identityDb = () => dbs[0]
  const ORGS = '{ organizations { id slug name plan status createdAt } }'
  const ops = (tenant?: string): Record<string, string> => ({
    origin: OPS,
    authorization: `Bearer ${opsJwt}`,
    ...(tenant ? { [OPERATOR_TENANT_HEADER]: tenant } : {}),
  })
  const setOperator = (on: boolean) =>
    identityDb()
      .prepare('UPDATE user SET platformOperator = ? WHERE id = ?')
      .bind(on ? 1 : 0, USER.a)
      .run()
  beforeAll(async () => {
    env.OPERATOR_ORIGIN = OPS
    const { createAuth } = await import('../../services/identity/src/data')
    const auth = createAuth(identityDb(), IDENTITY_ENV)
    const ctx = await auth.$context
    const { token } = await ctx.internalAdapter.createSession(USER.a, false, {
      origin: OPS,
    })
    const cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`
    const res = await auth.handler(
      new Request(`${IDENTITY_ENV.BETTER_AUTH_URL}/api/auth/token`, {
        headers: { cookie },
      }),
    )
    opsJwt = ((await res.json()) as { token: string }).token
  })
  afterAll(async () => {
    delete (env as Partial<Env>).OPERATOR_ORIGIN
    await setOperator(false)
  })
  beforeEach(async () => {
    env.OVERRIDE_TENANTS = {}
    await setOperator(false)
  })

  it('lists every org with createdAt to an operator with no tenant', async () => {
    await setOperator(true)
    const body = JSON.parse(await run(ORGS, ops())) as {
      data: { organizations: Record<string, string>[] }
    }
    expect(
      (await verifyEnvelope(
        lastEnvelope['tenant-directory']!,
        envelopePublicKey,
      )) as { typ: string },
    ).toMatchObject({ typ: 'platform' })
    const orgs = body.data.organizations
    expect(orgs.map((o) => o.id).sort()).toEqual([ORG.a, ORG.b].sort())
    // Ordered by slug.
    expect(orgs.map((o) => o.slug)).toEqual(orgs.map((o) => o.slug).sort())
    for (const o of orgs) expect(typeof o.createdAt).toBe('string')
  })

  it('pages by slug: first caps the page, after resumes past it', async () => {
    await setOperator(true)
    const page = async (args: string) =>
      (
        JSON.parse(await run(`{ organizations(${args}) { slug } }`, ops())) as {
          data: { organizations: { slug: string }[] }
        }
      ).data.organizations.map((o) => o.slug)
    const all = await page('first: 100')
    expect(all).toHaveLength(2)
    expect(await page('first: 1')).toEqual([all[0]])
    expect(await page(`first: 1, after: ${JSON.stringify(all[0])}`)).toEqual([
      all[1],
    ])
    expect(await page(`after: ${JSON.stringify(all[1])}`)).toEqual([])
    // Out-of-range first is clamped to 1..100, never unbounded.
    expect(await page('first: 0')).toEqual([all[0]])
    expect(await page('first: 100000')).toEqual(all)
  })

  it('refuses an anonymous caller on the operator lane at the gateway', async () => {
    calls.clear()
    const body = JSON.parse(await run(ORGS, { origin: OPS }))
    expect(body.data ?? null).toBeNull()
    expect(body.errors[0].extensions.code).toBe('UNAUTHENTICATED')
    expect(calls.has('tenant-directory')).toBe(false)
  })

  // No D1 read before the refusal: worker.test.ts spies on the D1 binding.
  it('refuses everyone else with the identical FORBIDDEN', async () => {
    const cases: [string, Record<string, string>, boolean][] = [
      ['anonymous, tenant site', { origin: ORIGIN }, false],
      [
        'tenant admin on its site',
        { origin: ORIGIN, authorization: `Bearer ${memberJwt}` },
        false,
      ],
      ['member on the operator lane, no tenant', ops(), false],
      ['member on the operator lane, own tenant', ops(HOST.a), false],
      ['operator with a tenant selected', ops(HOST.a), true],
      ['operator with another tenant selected', ops(HOST.b), true],
    ]
    const bodies = new Set<string>()
    for (const [label, headers, operator] of cases) {
      await setOperator(operator)
      const text = await run(ORGS, headers)
      const body = JSON.parse(text)
      expect(body.data?.organizations ?? null, label).toBeNull()
      expect(body.errors[0].extensions.code, label).toBe('FORBIDDEN')
      expect(text, label).not.toMatch(MARKER)
      bodies.add(text)
    }
    expect(bodies.size).toBe(1)
  })
})

describe('operator lane: conferences across orgs (#1985)', () => {
  const OPS = 'https://my.konf.app'
  let opsJwt: string
  const identityDb = () => dbs[0]
  const LIST = `{ conferences {
    id lifecycleStatus
    organization { id name }
    flags { apiRead identityLogin d1Write d1Override }
    edition { title startDate endDate primaryHost lifecycleStatus }
  } }`
  const ops = (tenant?: string): Record<string, string> => ({
    origin: OPS,
    authorization: `Bearer ${opsJwt}`,
    ...(tenant ? { [OPERATOR_TENANT_HEADER]: tenant } : {}),
  })
  const setOperator = (on: boolean) =>
    identityDb()
      .prepare('UPDATE user SET platformOperator = ? WHERE id = ?')
      .bind(on ? 1 : 0, USER.a)
      .run()
  type Row = { id: string; lifecycleStatus: string }
  const list = async (args = '', sel = 'id lifecycleStatus') => {
    const body = JSON.parse(
      await run(`{ conferences${args && `(${args})`} { ${sel} } }`, ops()),
    ) as { data: { conferences: Row[] }; errors?: unknown }
    expect(body.errors, args).toBeUndefined()
    return body.data.conferences
  }
  beforeAll(async () => {
    env.OPERATOR_ORIGIN = OPS
    const { createAuth } = await import('../../services/identity/src/data')
    const auth = createAuth(identityDb(), IDENTITY_ENV)
    const ctx = await auth.$context
    const { token } = await ctx.internalAdapter.createSession(USER.a, false, {
      origin: OPS,
    })
    const cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`
    const res = await auth.handler(
      new Request(`${IDENTITY_ENV.BETTER_AUTH_URL}/api/auth/token`, {
        headers: { cookie },
      }),
    )
    opsJwt = ((await res.json()) as { token: string }).token
  })
  afterAll(async () => {
    delete (env as Partial<Env>).OPERATOR_ORIGIN
    await setOperator(false)
    await setLifecycle(CONF.a, 'live')
    await setLifecycle(CONF.b, 'live')
  })
  beforeEach(async () => {
    env.OVERRIDE_TENANTS = {}
    await setOperator(false)
    await overrideForA(false)
    await setLifecycle(CONF.a, 'live')
    // Archived, not draft: a draft host does not resolve for HOST.b.
    await setLifecycle(CONF.b, 'archived')
  })

  it('lists both orgs with org, lifecycle, flags and edition to an operator with no tenant', async () => {
    await setOperator(true)
    await overrideForA(true)
    const body = JSON.parse(await run(LIST, ops()))
    expect(body.errors).toBeUndefined()
    expect(
      (await verifyEnvelope(
        lastEnvelope['tenant-directory']!,
        envelopePublicKey,
      )) as { typ: string },
    ).toMatchObject({ typ: 'platform' })
    const byId = Object.fromEntries(
      (body.data.conferences as { id: string }[]).map((c) => [c.id, c]),
    )
    expect(Object.keys(byId).sort()).toEqual([CONF.a, CONF.b].sort())
    expect(byId[CONF.a]).toMatchObject({
      lifecycleStatus: 'live',
      organization: { id: ORG.a, name: expect.stringMatching(/^TENANT_A/) },
      flags: { d1Override: true },
      edition: {
        title: expect.stringMatching(/^TENANT_A/),
        startDate: expect.any(String),
        primaryHost: HOST.a,
        lifecycleStatus: 'live',
      },
    })
    // B's archived edition, title from the conference subgraph and all.
    expect(byId[CONF.b]).toMatchObject({
      lifecycleStatus: 'archived',
      organization: { id: ORG.b },
      flags: { d1Override: false },
      edition: { title: expect.stringMatching(MARKER) },
    })
  })

  it('filters by lifecycle and by flag', async () => {
    await setOperator(true)
    await overrideForA(true)
    expect((await list('lifecycle: archived')).map((c) => c.id)).toEqual([
      CONF.b,
    ])
    expect((await list('lifecycle: live')).map((c) => c.id)).toEqual([CONF.a])
    expect(await list('lifecycle: draft')).toEqual([])
    expect((await list('flag: d1Override')).map((c) => c.id)).toEqual([CONF.a])
    expect(await list('flag: d1Override, lifecycle: archived')).toEqual([])
    // Not an injectable string: an unknown value fails validation.
    const bad = JSON.parse(
      await run('{ conferences(flag: "1 OR 1=1") { id } }', ops()),
    )
    expect(bad.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED')
  })

  it('pages by id: first caps the page, after resumes past it', async () => {
    await setOperator(true)
    const ids = async (args: string) => (await list(args)).map((c) => c.id)
    const all = await ids('first: 100')
    expect(all).toEqual([CONF.a, CONF.b].sort())
    expect(await ids('first: 1')).toEqual([all[0]])
    expect(await ids(`first: 1, after: ${JSON.stringify(all[0])}`)).toEqual([
      all[1],
    ])
    expect(await ids(`after: ${JSON.stringify(all[1])}`)).toEqual([])
    expect(await ids('first: 0')).toEqual([all[0]])
    expect(await ids('first: -5')).toEqual([all[0]])
    expect(await ids('first: 100000')).toEqual(all)
  })

  it('refuses everyone else with the identical FORBIDDEN and no D1 read', async () => {
    const cases: [string, Record<string, string>, boolean][] = [
      ['anonymous, tenant site', { origin: ORIGIN }, false],
      [
        'tenant owner on its site',
        { origin: ORIGIN, authorization: `Bearer ${memberJwt}` },
        false,
      ],
      ['member on the operator lane, no tenant', ops(), false],
      ['member on the operator lane, own tenant', ops(HOST.a), false],
      ['operator with a tenant selected', ops(HOST.a), true],
      ['operator with another tenant selected', ops(HOST.b), true],
    ]
    const bodies = new Set<string>()
    // Host resolution (tenantByHost) reads D1 before any resolver; only
    // reads serving `conferences` or the entity fetch behind it count.
    const reads = () =>
      Object.entries(d1Calls)
        .filter(([k]) => /:(conferences|_entities)$/.test(k))
        .reduce((n, [, v]) => n + v, 0)
    for (const [label, headers, operator] of cases) {
      await setOperator(operator)
      for (const k of Object.keys(d1Calls)) delete d1Calls[k]
      const text = await run(LIST, headers)
      expect(reads(), label).toBe(0)
      const body = JSON.parse(text)
      expect(body.data?.conferences ?? null, label).toBeNull()
      expect(body.errors[0].extensions.code, label).toBe('FORBIDDEN')
      expect(text, label).not.toMatch(MARKER)
      bodies.add(text)
    }
    expect(bodies.size).toBe(1)
    // Negative control: the counter does see the operator's reads.
    await setOperator(true)
    for (const k of Object.keys(d1Calls)) delete d1Calls[k]
    await run(LIST, ops())
    expect(d1Calls['tenant-directory:conferences']).toBeGreaterThan(0)
    expect(d1Calls['conference:_entities']).toBeGreaterThan(0)
  })

  it('leaves tenant conferenceEditions and lifecycleStatus as they were', async () => {
    // B is archived: anonymous and the member of A see only A's live edition.
    for (const headers of [
      { origin: ORIGIN },
      { origin: ORIGIN, authorization: `Bearer ${memberJwt}` },
    ] as Record<string, string>[]) {
      const body = await run(LIFECYCLE, headers)
      expect(body).not.toMatch(MARKER)
      expect(lifecycles(body)).toEqual({ [CONF.a]: 'live' })
    }
    // A tenant envelope still gets nothing of B's from either subgraph's
    // entity resolver, a PlatformContext reads it.
    const tenantA = {
      typ: 'tenant',
      orgId: ORG.a,
      conferenceId: CONF.a,
      userId: USER.a,
      orgRole: 'owner',
      scopes: ['platform:operator'],
    }
    expect(await directoryEntities(tenantA, CONF.b)).toEqual([null])
    expect(await directoryEntities(tenantA, CONF.b, 'conference')).toEqual([
      null,
    ])
    expect(
      await directoryEntities(
        { typ: 'platform', userId: USER.a, platformRole: 'operator' },
        CONF.b,
        'conference',
      ),
    ).toEqual([{ id: CONF.b }])
  })
})

describe('organization: session org, plan and domains (#1968, #1969)', () => {
  const OPS = 'https://my.konf.app'
  const ORGQ =
    '{ organization { id name plan slug status domains { hostname verification kind } } }'
  const own = {
    id: ORG.a,
    name: 'TENANT_A organizations.name',
    plan: 'TENANT_A organizations.plan',
    slug: 'TENANT_A organizations.slug',
    status: 'active',
    domains: [
      { hostname: HOST.a, verification: 'verified', kind: 'platform-edition' },
    ],
  }
  let opsJwt: string
  const setOperator = (on: boolean) =>
    dbs[0]
      .prepare('UPDATE user SET platformOperator = ? WHERE id = ?')
      .bind(on ? 1 : 0, USER.a)
      .run()
  const ops = (tenant?: string): Record<string, string> => ({
    origin: OPS,
    authorization: `Bearer ${opsJwt}`,
    ...(tenant ? { [OPERATOR_TENANT_HEADER]: tenant } : {}),
  })
  const setRole = (role: string) =>
    dbs[0]
      .prepare(
        'UPDATE member SET role = ? WHERE userId = ? AND organizationId = ?',
      )
      .bind(role, USER.a, ORG.a)
      .run()

  beforeAll(async () => {
    env.OPERATOR_ORIGIN = OPS
    const { createAuth } = await import('../../services/identity/src/data')
    const auth = createAuth(dbs[0], IDENTITY_ENV)
    const ctx = await auth.$context
    const { token } = await ctx.internalAdapter.createSession(USER.a, false, {
      origin: OPS,
    })
    const cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`
    const res = await auth.handler(
      new Request(`${IDENTITY_ENV.BETTER_AUTH_URL}/api/auth/token`, {
        headers: { cookie },
      }),
    )
    opsJwt = ((await res.json()) as { token: string }).token
  })
  afterAll(() => {
    delete (env as Partial<Env>).OPERATOR_ORIGIN
  })
  beforeEach(() => {
    env.OVERRIDE_TENANTS = {}
  })

  it("serves a member of A A's org, plan and domains on A's host, pending ones too", async () => {
    let db: D1Database | undefined
    for (const d of dbs) {
      const { results } = await d
        .prepare("SELECT 1 FROM sqlite_master WHERE name = 'domains'")
        .all()
      if (results.length) db = d
    }
    await db!
      .prepare(
        "INSERT INTO domains (hostname, org_id, conference_id, kind, verification) VALUES ('pending.example', ?, ?, 'custom', 'pending')",
      )
      .bind(ORG.a, CONF.a)
      .run()
    try {
      const body = await run(ORGQ, {
        origin: ORIGIN,
        authorization: `Bearer ${memberJwt}`,
      })
      expect(JSON.parse(body)).toEqual({
        data: {
          organization: {
            ...own,
            domains: [
              {
                hostname: 'pending.example',
                verification: 'pending',
                kind: 'custom',
              },
              ...own.domains,
            ],
          },
        },
      })
    } finally {
      await db!
        .prepare("DELETE FROM domains WHERE hostname = 'pending.example'")
        .run()
    }
  })

  it('serves a member with role member too (any role)', async () => {
    await setRole('member')
    try {
      expect(JSON.parse(await run(ORGQ, ops(HOST.a)))).toEqual({
        data: { organization: own },
      })
    } finally {
      await setRole('admin')
    }
  })

  it('gives an anonymous caller null, never the host org', async () => {
    expect(JSON.parse(await run(ORGQ, { origin: ORIGIN }))).toEqual({
      data: { organization: null },
    })
    expect(
      JSON.parse(await run(ORGQ, { origin: `https://${HOST.b}` })),
    ).toEqual({ data: { organization: null } })
  })

  it('never serves another org: no argument, and B selected is refused like a missing host', async () => {
    const withArg = JSON.parse(
      await run(`{ organization(id: "${ORG.b}") { id } }`, {
        origin: ORIGIN,
        authorization: `Bearer ${memberJwt}`,
      }),
    )
    expect(withArg.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED')
    const other = await run(ORGQ, ops(HOST.b))
    expect(other).not.toMatch(MARKER)
    expect(JSON.parse(other).errors[0].extensions.code).toBe('FORBIDDEN')
    expect(await run(ORGQ, ops('nowhere.example'))).toBe(other)
  })

  it('serves a member with no tenant selected null', async () => {
    expect(JSON.parse(await run(ORGQ, ops()))).toEqual({
      data: { organization: null },
    })
  })

  it('serves an operator the selected tenant, and null with none selected', async () => {
    await setOperator(true)
    // Not a member of B: OPERATOR_SCOPE alone admits the operator.
    try {
      const b = JSON.parse(
        await run(
          '{ organization { id plan domains { hostname } } }',
          ops(HOST.b),
        ),
      )
      expect(b.data.organization).toMatchObject({
        id: ORG.b,
        domains: [{ hostname: HOST.b }],
      })
      expect(JSON.parse(await run(ORGQ, ops()))).toEqual({
        data: { organization: null },
      })
    } finally {
      await setOperator(false)
    }
  })

  it('keeps organization public and still cuts internal fields', () => {
    const sdl = publicSdl()
    expect(sdl).toMatch(/\borganization: Organization\b/)
    expect(sdl).toMatch(/\bdomains: \[Domain!\]/)
    expect(sdl).toMatch(/\bverification: String/)
    expect(sdl).not.toMatch(/tenantByHost|repointAlias|addCustomDomain/)
    // Domain.flags stays internal. RolloutFlags is public only through the
    // operator-only `conferences` list (#1985).
    const domain = buildSchema(sdl).getType('Domain') as GraphQLObjectType
    expect(domain.getFields().flags).toBeUndefined()
  })
})

describe('negative control: the Sanity fixture follows the GROQ', () => {
  const read = async (rewrite: (q: string) => string) => {
    env.OVERRIDE_TENANTS = {}
    await overrideForA(false)
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

describe('session org members (#1972)', () => {
  const OPS = 'https://my.konf.app'
  const Q =
    '{ members { userId name role joinedAt email } invitations { id email role expiresAt } }'
  const identityDb = () => dbs[0]
  const sql = (q: string, ...args: unknown[]) =>
    identityDb()
      .prepare(q)
      .bind(...args)
      .run()
  // INSERT OR REPLACE skips the LAST_OWNER triggers (see the operator lane).
  const setRole = (role: string) =>
    sql(
      "INSERT OR REPLACE INTO member (id, organizationId, userId, role, createdAt) SELECT COALESCE((SELECT id FROM member WHERE userId = ?1 AND organizationId = ?2), 'member-ops'), ?2, ?1, ?3, 0",
      USER.a,
      ORG.a,
      role,
    )
  const site = () => ({ origin: ORIGIN, authorization: `Bearer ${memberJwt}` })
  let opsJwt: string
  type Body = {
    data?: {
      members: { userId: string; email: string | null; role: string }[] | null
      invitations: { email: string }[] | null
    }
    errors?: unknown[]
  }
  const read = async (headers: Record<string, string>) =>
    JSON.parse(await run(Q, headers)) as Body

  beforeAll(async () => {
    env.OPERATOR_ORIGIN = OPS
    const { createAuth } = await import('../../services/identity/src/data')
    const auth = createAuth(identityDb(), IDENTITY_ENV)
    const ctx = await auth.$context
    const { token } = await ctx.internalAdapter.createSession(USER.a, false, {
      origin: OPS,
    })
    const cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`
    const res = await auth.handler(
      new Request(`${IDENTITY_ENV.BETTER_AUTH_URL}/api/auth/token`, {
        headers: { cookie },
      }),
    )
    opsJwt = ((await res.json()) as { token: string }).token
    // A pending invitation in each org; B's carries the marker.
    for (const t of TENANTS)
      await sql(
        "INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId, createdAt) VALUES (?, ?, ?, 'member', 'pending', ?, ?, 0)",
        `inv-1972-${tag(t)}`,
        ORG[t],
        `invitee-${tag(t)}@example.com`,
        Date.now() + 86_400_000,
        USER[t],
      )
  })
  afterAll(async () => {
    delete (env as Partial<Env>).OPERATOR_ORIGIN
    await sql("DELETE FROM invitation WHERE id LIKE 'inv-1972-%'")
    await sql('UPDATE user SET platformOperator = 0 WHERE id = ?', USER.a)
    await setRole('admin')
  })
  beforeEach(async () => {
    env.OVERRIDE_TENANTS = {}
    await setRole('admin')
  })

  it.each(['owner', 'admin'])(
    "a %s reads A's members with emails and invitations, never B's",
    async (role) => {
      await setRole(role)
      const raw = await run(Q, site())
      expect(raw).not.toMatch(MARKER)
      const { data } = JSON.parse(raw) as Body
      expect(data!.members).toEqual([
        expect.objectContaining({ userId: USER.a, role }),
      ])
      expect(data!.members![0].email).toBe('TENANT_A user.email')
      expect(data!.invitations).toEqual([
        expect.objectContaining({ email: 'invitee-TENANT_A@example.com' }),
      ])
    },
  )

  it("a member reads A's members without emails and gets no invitations", async () => {
    await setRole('member')
    const raw = await run(Q, site())
    expect(raw).not.toMatch(MARKER)
    expect(JSON.parse(raw)).toEqual({
      data: {
        members: [
          {
            userId: USER.a,
            name: expect.any(String),
            role: 'member',
            joinedAt: expect.any(String),
            email: null,
          },
        ],
        invitations: null,
      },
    })
  })

  it("never reads B's members, from A's session on B's host or anonymously", async () => {
    // A's session token is bound to A's host: B's origin refuses it outright.
    expect(
      await run(Q, { ...site(), origin: `https://${HOST.b}` }),
    ).not.toMatch(MARKER)
    for (const origin of [ORIGIN, `https://${HOST.b}`])
      expect(await read({ origin })).toEqual({
        data: { members: null, invitations: null },
      })
  })

  it('a removed member gets null on the next request', async () => {
    expect((await read(site())).data!.members).toHaveLength(1)
    await sql(
      'DELETE FROM member WHERE userId = ? AND organizationId = ?',
      USER.a,
      ORG.a,
    )
    expect(await read(site())).toEqual({
      data: { members: null, invitations: null },
    })
  })

  it('an operator acting for A reads its members with emails, as no member', async () => {
    await sql('UPDATE user SET platformOperator = 1 WHERE id = ?', USER.a)
    await sql(
      'DELETE FROM member WHERE userId = ? AND organizationId = ?',
      USER.a,
      ORG.a,
    )
    try {
      const raw = await run(Q, {
        origin: OPS,
        authorization: `Bearer ${opsJwt}`,
        [OPERATOR_TENANT_HEADER]: HOST.a,
      })
      expect(raw).not.toMatch(MARKER)
      const { data } = JSON.parse(raw) as Body
      // A's only member was removed above; the invitation proves the org.
      expect(data!.members).toEqual([])
      expect(data!.invitations).toEqual([
        expect.objectContaining({ email: 'invitee-TENANT_A@example.com' }),
      ])
    } finally {
      await sql('UPDATE user SET platformOperator = 0 WHERE id = ?', USER.a)
    }
  })
  describe('providers (#1990)', () => {
    const PQ = '{ members { userId email providers } }'
    const P_USER = 'user-1990'
    type PBody = {
      data?: {
        members:
          { userId: string; email: string | null; providers: string[] }[] | null
      }
      errors?: unknown[]
    }
    const linked = async (headers: Record<string, string>) => {
      d1Sql.identity = []
      const raw = await run(PQ, headers)
      const accountReads = d1Sql.identity.filter((q) => /"account"/.test(q))
      return { raw, body: JSON.parse(raw) as PBody, accountReads }
    }
    beforeAll(async () => {
      await sql(
        "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, 'P', 'p-1990@example.com', 1, 0, 0)",
        P_USER,
      )
      await sql(
        "INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES ('member-1990', ?, ?, 'member', 1)",
        ORG.a,
        P_USER,
      )
      // Two linkedin rows prove DISTINCT; the secrets must never surface.
      for (const [id, provider] of [
        ['acc-1990-l1', 'linkedin'],
        ['acc-1990-g', 'github'],
        ['acc-1990-l2', 'linkedin'],
      ])
        await sql(
          "INSERT INTO account (id, accountId, providerId, userId, accessToken, refreshToken, idToken, scope, password, createdAt, updatedAt) VALUES (?, 'SECRET-accountId', ?, ?, 'SECRET-access', 'SECRET-refresh', 'SECRET-id', 'SECRET-scope', 'SECRET-pw', 0, 0)",
          id,
          provider,
          P_USER,
        )
    })
    afterAll(async () => {
      await sql("DELETE FROM account WHERE id LIKE 'acc-1990-%'")
      await sql("DELETE FROM member WHERE id = 'member-1990'")
      await sql('DELETE FROM user WHERE id = ?', P_USER)
    })

    it('an owner sees sorted distinct provider names in one account query', async () => {
      await setRole('owner')
      const { raw, body, accountReads } = await linked(site())
      expect(raw).not.toMatch(/SECRET|p-1990@example\.com.*SECRET/)
      expect(body.data!.members).toHaveLength(2)
      expect(body.data!.members!.find((m) => m.userId === P_USER)).toEqual({
        userId: P_USER,
        email: 'p-1990@example.com',
        providers: ['github', 'linkedin'],
      })
      // One batched read for both members, not one per member.
      expect(accountReads).toHaveLength(1)
      // Org-scoped join, no parameter list: D1 caps bound parameters (#2018).
      expect(accountReads[0]).not.toMatch(/\bin\s*\(/i)
      expect(accountReads[0]).toMatch(/join "member".*"organizationId" = \?/i)
      // Only providerId (and the join key) leave the account table.
      const cols = /^select (?:distinct )?(.*?) from "account"/i.exec(
        accountReads[0],
      )?.[1]
      expect(cols?.replace(/"account"\./g, '')).toBe('"userId", "providerId"')
    })

    it('a plain member gets an empty list, as email is null, and no account read', async () => {
      await setRole('member')
      const { body, accountReads } = await linked(site())
      expect(body.data!.members).toHaveLength(2)
      for (const m of body.data!.members!) {
        expect(m.email).toBeNull()
        expect(m.providers).toEqual([])
      }
      expect(accountReads).toEqual([])
    })

    it('a foreign org is refused as today', async () => {
      const { raw, body } = await linked({
        ...site(),
        origin: `https://${HOST.b}`,
      })
      expect(raw).not.toMatch(/github|linkedin/)
      expect(body.data?.members ?? null).toBeNull()
    })

    it('an operator acting for A sees the providers', async () => {
      await sql('UPDATE user SET platformOperator = 1 WHERE id = ?', USER.a)
      try {
        const { body, accountReads } = await linked({
          origin: OPS,
          authorization: `Bearer ${opsJwt}`,
          [OPERATOR_TENANT_HEADER]: HOST.a,
        })
        expect(
          body.data!.members!.find((m) => m.userId === P_USER)!.providers,
        ).toEqual(['github', 'linkedin'])
        expect(accountReads).toHaveLength(1)
      } finally {
        await sql('UPDATE user SET platformOperator = 0 WHERE id = ?', USER.a)
      }
    })
  })
})

describe('myOrganizations: member lane, no tenant (#2036)', () => {
  const OPS = 'https://my.konf.app'
  const ORG_C = 'org-2036-c'
  const CONF_C = 'conf-2036-c'
  const LONER = 'user-2036-none'
  const Q =
    '{ myOrganizations { id name role conferenceEditions { id primaryHost lifecycleStatus } } }'
  const identityDb = () => dbs[0]
  const sql = (q: string, ...args: unknown[]) =>
    identityDb()
      .prepare(q)
      .bind(...args)
      .run()
  const jwt: Record<string, string> = {}
  const ops = (user = USER.a): Record<string, string> => ({
    origin: OPS,
    authorization: `Bearer ${jwt[user]}`,
  })
  const setOperator = (on: boolean) =>
    sql('UPDATE user SET platformOperator = ? WHERE id = ?', on ? 1 : 0, USER.a)
  const mine = async (user = USER.a) => {
    const raw = await run(Q, ops(user))
    expect(raw).not.toMatch(MARKER)
    const body = JSON.parse(raw)
    expect(body.errors).toBeUndefined()
    return body.data.myOrganizations as { id: string }[]
  }
  const typ = async () =>
    (
      (await verifyEnvelope(
        lastEnvelope['tenant-directory']!,
        envelopePublicKey,
      )) as { typ: string }
    ).typ

  beforeAll(async () => {
    env.OPERATOR_ORIGIN = OPS
    // A third org with one draft edition; A's member also belongs to it.
    const directory = await directoryConferences()
    await directory
      .prepare(
        "INSERT INTO organizations (id, slug, name) VALUES (?1, ?1, 'Org C')",
      )
      .bind(ORG_C)
      .run()
    await directory
      .prepare(
        "INSERT INTO conferences (id, org_id, slug, name, lifecycle) VALUES (?1, ?2, ?1, ?1, 'draft')",
      )
      .bind(CONF_C, ORG_C)
      .run()
    await sql(
      "INSERT INTO organization (id, name, slug) VALUES (?1, 'Org C', ?1)",
      ORG_C,
    )
    await sql(
      "INSERT INTO member (id, organizationId, userId, role) VALUES ('member-2036', ?, ?, 'member')",
      ORG_C,
      USER.a,
    )
    await sql(
      "INSERT INTO user (id, name, email) VALUES (?1, 'Loner', 'loner-2036@example.com')",
      LONER,
    )
    const { createAuth } = await import('../../services/identity/src/data')
    const auth = createAuth(identityDb(), IDENTITY_ENV)
    const ctx = await auth.$context
    for (const user of [USER.a, LONER]) {
      const { token } = await ctx.internalAdapter.createSession(user, false, {
        origin: OPS,
      })
      const cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`
      const res = await auth.handler(
        new Request(`${IDENTITY_ENV.BETTER_AUTH_URL}/api/auth/token`, {
          headers: { cookie },
        }),
      )
      jwt[user] = ((await res.json()) as { token: string }).token
    }
  })
  afterAll(async () => {
    delete (env as Partial<Env>).OPERATOR_ORIGIN
    await setOperator(false)
    await sql("DELETE FROM member WHERE id = 'member-2036'")
    await sql('DELETE FROM organization WHERE id = ?', ORG_C)
    await sql('DELETE FROM user WHERE id = ?', LONER)
    const directory = await directoryConferences()
    await directory
      .prepare('DELETE FROM conferences WHERE id = ?')
      .bind(CONF_C)
      .run()
    await directory
      .prepare('DELETE FROM organizations WHERE id = ?')
      .bind(ORG_C)
      .run()
  })
  beforeEach(async () => {
    env.OVERRIDE_TENANTS = {}
    await setOperator(false)
    await setLifecycle(CONF.a, 'live')
  })

  it('a member of two orgs sees exactly those, with roles and editions, never B', async () => {
    expect(await mine()).toEqual([
      {
        id: ORG.a,
        name: expect.stringMatching(/^TENANT_A/),
        role: 'admin',
        conferenceEditions: [
          { id: CONF.a, primaryHost: HOST.a, lifecycleStatus: 'live' },
        ],
      },
      {
        id: ORG_C,
        name: 'Org C',
        role: 'member',
        conferenceEditions: [
          { id: CONF_C, primaryHost: null, lifecycleStatus: 'draft' },
        ],
      },
    ])
    // The envelope carries the user and no org.
    expect(
      await verifyEnvelope(
        lastEnvelope['tenant-directory']!,
        envelopePublicKey,
      ),
    ).toEqual({ typ: 'user', userId: USER.a })
  })

  it('a non-member gets an empty list', async () => {
    expect(await mine(LONER)).toEqual([])
    expect(await typ()).toBe('user')
  })

  it('an anonymous caller is refused before any subgraph', async () => {
    lastEnvelope['tenant-directory'] = null
    const res = await gateway.fetch(
      new Request('http://api.test/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: OPS },
        body: JSON.stringify({ query: Q }),
      }),
      env,
    )
    expect(res.status).toBe(401)
    expect(lastEnvelope['tenant-directory']).toBeNull()
  })

  it('a tenant envelope is refused: the site lane gets FORBIDDEN', async () => {
    const body = JSON.parse(
      await run(Q, { origin: ORIGIN, authorization: `Bearer ${memberJwt}` }),
    )
    expect(body.data?.myOrganizations ?? null).toBeNull()
    expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
  })

  it.each([
    '{ organization { id name } }',
    '{ members { userId } }',
    '{ invitations { id } }',
    '{ conferences { id } }',
    '{ organizations { id } }',
    '{ conferenceEditions { id lifecycleStatus } }',
    '{ conference { id title } }',
    '{ conferenceLifecycle }',
    'mutation { inviteMember(email: "x@example.com", role: member) { id } }',
    'mutation { setConferenceLifecycle(status: archived) { id } }',
  ])('the user envelope reads nothing else: %s', async (query) => {
    for (const user of [USER.a, LONER]) {
      const raw = await run(query, ops(user))
      expect(raw, query).not.toMatch(/TENANT_A|tenant-a|2036/)
      expect(raw, query).not.toMatch(MARKER)
      const { data, errors = [] } = JSON.parse(raw) as {
        data?: Record<string, unknown> | null
        errors?: { extensions?: { code?: string } }[]
      }
      for (const v of Object.values(data ?? {}))
        expect([null, undefined, []], query).toContainEqual(v)
      // The conference subgraph's Scoped repositories throw on a
      // UserContext, as on a PlatformContext: a 500 there is the refusal.
      for (const e of errors)
        expect(
          ['FORBIDDEN', 'UNAUTHENTICATED', 'INTERNAL_SERVER_ERROR'],
          query,
        ).toContain(e.extensions?.code)
    }
  })

  it('an operator with no tenant gets only their own memberships', async () => {
    await setOperator(true)
    expect((await mine()).map((o) => o.id)).toEqual([ORG.a, ORG_C])
    expect(await typ()).toBe('platform')
  })

  it('refuses changeMemberRole on the user lane and leaves the role unchanged', async () => {
    const roleBefore = (
      await identityDb()
        .prepare('SELECT role FROM member WHERE id = ?')
        .bind('member-2036')
        .first<{ role: string }>()
    )?.role
    expect(roleBefore).toBe('member')

    const raw = await run(
      `mutation { changeMemberRole(userId: "${USER.a}", role: owner) }`,
      ops(),
    )
    const body = JSON.parse(raw)
    expect(body.data?.changeMemberRole ?? null).toBeNull()
    expect(body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')

    const roleAfter = (
      await identityDb()
        .prepare('SELECT role FROM member WHERE id = ?')
        .bind('member-2036')
        .first<{ role: string }>()
    )?.role
    expect(roleAfter).toBe('member')
  })

  it('refuses removeMember on the user lane and leaves the member in place', async () => {
    const before = await identityDb()
      .prepare('SELECT id, role FROM member WHERE id = ?')
      .bind('member-2036')
      .first<{ id: string; role: string }>()
    expect(before).toEqual({ id: 'member-2036', role: 'member' })

    const raw = await run(
      `mutation { removeMember(userId: "${USER.a}") }`,
      ops(),
    )
    const body = JSON.parse(raw)
    expect(body.data?.removeMember ?? null).toBeNull()
    expect(body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN')

    const after = await identityDb()
      .prepare('SELECT id, role FROM member WHERE id = ?')
      .bind('member-2036')
      .first<{ id: string; role: string }>()
    expect(after).toEqual({ id: 'member-2036', role: 'member' })
  })

  it('refuses updateConference on the user lane and leaves the conference unchanged', async () => {
    const db = await conferenceDb()
    const before = await db
      .prepare(
        'SELECT conference_id, title, tagline FROM conferences WHERE conference_id = ?',
      )
      .bind(CONF.a)
      .first<{ conference_id: string; title: string; tagline: string | null }>()
    expect(before?.conference_id).toBe(CONF.a)
    expect(before?.title).toMatch(/^TENANT_A/)

    const raw = await run(
      'mutation { updateConference(input: { tagline: "user-lane-exploit" }) { id tagline } }',
      ops(),
    )
    const body = JSON.parse(raw)
    expect(body.data?.updateConference ?? null).toBeNull()
    expect(
      body.errors?.[0]?.extensions?.code === 'FORBIDDEN' ||
        body.errors?.length > 0,
    ).toBe(true)

    const after = await db
      .prepare(
        'SELECT conference_id, title, tagline FROM conferences WHERE conference_id = ?',
      )
      .bind(CONF.a)
      .first<{ conference_id: string; title: string; tagline: string | null }>()
    expect(after).toEqual(before)
    expect(after?.tagline).not.toBe('user-lane-exploit')
  })

  it('a plain member can subscribePush and unsubscribePush via the user lane', async () => {
    const endpoint = 'https://push.example/user-lane-push-test'
    try {
      const subRaw = await run(
        `mutation {
          subscribePush(input: {
            endpoint: "${endpoint}",
            keys: { p256dh: "key-p256dh-1", auth: "auth-key-1" }
          })
        }`,
        ops(),
      )
      const subBody = JSON.parse(subRaw)
      expect(subBody.errors).toBeUndefined()
      expect(subBody.data?.subscribePush).toBe(true)

      const row = await identityDb()
        .prepare(
          'SELECT user_id, endpoint, p256dh, auth FROM push_subscription WHERE endpoint = ?',
        )
        .bind(endpoint)
        .first<{
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
        }>()
      expect(row).toEqual({
        user_id: USER.a,
        endpoint,
        p256dh: 'key-p256dh-1',
        auth: 'auth-key-1',
      })

      const unsubRaw = await run(
        `mutation { unsubscribePush(endpoint: "${endpoint}") }`,
        ops(),
      )
      const unsubBody = JSON.parse(unsubRaw)
      expect(unsubBody.errors).toBeUndefined()
      expect(unsubBody.data?.unsubscribePush).toBe(true)

      const after = await identityDb()
        .prepare('SELECT 1 FROM push_subscription WHERE endpoint = ?')
        .bind(endpoint)
        .all()
      expect(after.results).toEqual([])
    } finally {
      await identityDb()
        .prepare('DELETE FROM push_subscription WHERE endpoint = ?')
        .bind(endpoint)
        .run()
    }
  })
})
