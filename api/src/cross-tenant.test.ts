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
 *
 * Subgraphs come from SUBGRAPHS and BINDINGS: a new one is seeded and walked
 * here without a change to this file.
 */
import { readdirSync, readFileSync } from 'node:fs'
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
  type GraphQLNamedType,
} from 'graphql'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  ENVELOPE_HEADER,
  createSigner,
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
 * Every Query field, once per probe id when it takes required args, split
 * into queries of at most MAX_ALIASES aliased roots. `roots` maps alias to
 * the Query field it calls.
 */
function queries(tenants: T[]) {
  const roots = Object.values(schema.getQueryType()!.getFields()).flatMap(
    (f) => {
      walked.add(`Query.${f.name}`)
      const needsArgs = f.args.some((a) => isNonNullType(a.type))
      const probes = needsArgs ? tenants.flatMap(PROBES) : ['']
      return probes.map((p) => ({
        field: f.name,
        sel: `${f.name}${args(f.args, p)}${selection(getNamedType(f.type), 2, p)}`,
      }))
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

/**
 * Query fields known to return tenant B data under A's origin, each with
 * its tracking issue. A hit on any other field fails. Remove an entry when
 * its fix lands; never add one without an issue.
 */
const KNOWN_CROSS_TENANT: Record<string, string> = {
  // tenant-directory `conference(id:)` answers any live conference by id.
  // PR #1829 (#1788) tags it internal; drop this entry when it merges.
  conference: '#1788',
  // tenant-directory `tenantByHost(host:)` resolves any verified hostname:
  // the routing registry, public like DNS. Needs a decision under #1772.
  tenantByHost: '#1787',
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
let forgedB: string
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
  const services = new URL('../../services/', import.meta.url)

  const identityDb = (await mf.getD1Database(
    'IDENTITY_DB',
  )) as unknown as D1Database
  await migrate(identityDb, new URL('identity/migrations/', services))
  await seed(identityDb)
  // Better Auth signs with the first jwks row; let it make a real key.
  await identityDb.prepare('DELETE FROM jwks').run()
  const identity = await import('../../services/identity/src/index')
  const { createAuth } = await import('../../services/identity/src/data')
  const identityEnv = {
    ...IDENTITY_ENV,
    DB: identityDb,
    GATEWAY_PUBLIC_KEY: keys.publicPem,
  }

  const bindings: Record<string, unknown> = {}
  for (const [i, name] of names.entries()) {
    const db = (await mf.getD1Database(`DB${i}`)) as unknown as D1Database
    await migrate(db, new URL(`${name}/migrations/`, services))
    await seed(db)
    const worker = (await import(
      /* @vite-ignore */ new URL(`${name}/src/worker.ts`, services).pathname
    )) as { default: { fetch(r: Request, e: unknown): Promise<Response> } }
    const workerEnv = {
      DB: db,
      GATEWAY_PUBLIC_KEY: keys.publicPem,
      CF_API_TOKEN: 'unused',
      CF_ZONE_ID: 'unused',
      IDENTITY: { ensure: async () => undefined },
    }
    bindings[BINDINGS[name as keyof typeof BINDINGS]] = {
      fetch: (url: string, init?: RequestInit) =>
        worker.default.fetch(new Request(url, init), workerEnv),
    }
  }

  env = {
    ENVELOPE_PRIVATE_KEY: keys.privatePem,
    IDENTITY_ISSUER: IDENTITY_ENV.IDENTITY_ISSUER,
    ...bindings,
    IDENTITY: {
      fetch: (url: string, init?: RequestInit) =>
        identity.default.fetch(new Request(url, init), identityEnv),
    },
    MEMBERSHIP: new identity.Membership({} as never, identityEnv as never),
  } as unknown as Env

  // A real identity JWT for A's member, through Better Auth's /token.
  const auth = createAuth(identityDb, IDENTITY_ENV)
  const ctx = await auth.$context
  const { token } = await ctx.internalAdapter.createSession(USER.a, false)
  const cookie = `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`
  const res = await auth.handler(
    new Request(`${IDENTITY_ENV.BETTER_AUTH_URL}/api/auth/token`, {
      headers: { cookie },
    }),
  )
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

describe.each([
  ['anonymous, A origin, A and B ids', false, TENANTS],
  ['member of A, A ids', true, ['a'] as T[]],
  ['member of A, B ids', true, ['b'] as T[]],
])('cross-tenant walk: %s', (_, signedIn, tenants) => {
  it('returns no tenant B data, and a forged envelope changes nothing', async () => {
    const headers = (): Record<string, string> => ({
      origin: ORIGIN,
      ...(signedIn ? { authorization: `Bearer ${memberJwt}` } : {}),
    })
    let sawA = false
    const known = new Set<string>()
    for (const { query, roots } of queries(tenants)) {
      const body = await run(query, headers())
      const { data, errors } = JSON.parse(body) as {
        data?: Record<string, unknown>
        errors?: unknown
      }
      expect(JSON.stringify(errors ?? null), query).not.toMatch(MARKER)
      for (const [alias, value] of Object.entries(data ?? {})) {
        if (!MARKER.test(JSON.stringify(value))) continue
        expect(
          KNOWN_CROSS_TENANT,
          `B data from ${alias} in ${query}`,
        ).toHaveProperty([roots[alias]])
        known.add(roots[alias])
      }
      expect(body, query).not.toMatch(
        /depth limit|aliases limit|UNAUTHENTICATED/i,
      )
      sawA ||= body.includes('TENANT_A')
      const forged = await run(query, {
        ...headers(),
        [ENVELOPE_HEADER]: forgedB,
      })
      expect(forged, query).toBe(body)
    }
    // The walk reached seeded rows, so a clean result means something.
    if (tenants.includes('a')) expect(sawA).toBe(true)
    if (known.size) console.warn('known cross-tenant reads:', [...known])
  })
})

it('walks every public field reachable from Query', () => {
  queries(TENANTS)
  console.info(`cross-tenant walk: ${walked.size} fields`, [...walked].sort())
  const reachable = Object.values(schema.getTypeMap()).flatMap((t) =>
    isObjectType(t) && !t.name.startsWith('__')
      ? Object.keys(t.getFields()).map((f) => `${t.name}.${f}`)
      : [],
  )
  expect([...walked].sort()).toEqual(reachable.sort())
})
