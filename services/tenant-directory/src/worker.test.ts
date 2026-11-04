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
  env = {
    DB: d1(sqlite),
    GATEWAY_PUBLIC_KEY: keys.publicPem,
    CF_API_TOKEN: 'unused',
    CF_ZONE_ID: 'unused',
    IDENTITY: identity,
  }
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

const PROVISION = `mutation($key: String!, $org: String!) {
  provisionOrganization(idempotencyKey: $key, orgSlug: $org, orgName: "Org",
    conferenceSlug: "2026", conferenceName: "Conf 2026") { id slug status }
}`
const RESOLVE = `query($host: String!) { tenantByHost(host: $host) { orgId conferenceId kind } }`

/** Provisions, then publishes the Conference (provisioning leaves a draft). */
async function provision(org = 'acme', key = 'k1') {
  const { body } = await gql(PROVISION, { key, org }, operator)
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

describe('provisioning', () => {
  it('tags every mutation internal', async () => {
    const { body } = await gql('{ _service { sdl } }')
    const mutation = /type Mutation[^}]*}/.exec(body.data._service.sdl)![0]
    const fields = mutation.split('\n').filter((l) => l.includes('('))
    expect(fields).toHaveLength(5)
    for (const f of fields) expect(f).toContain('@tag(name: "internal")')
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
    // identity's ensure runs on the retry too, so a failed one heals.
    expect(identity.ensure.mock.calls).toEqual([
      [a.id, 'acme'],
      [a.id, 'acme'],
    ])
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM organizations').get(),
    ).toEqual({ n: 1 })
  })

  it('refuses callers without a PlatformContext', async () => {
    for (const as of [undefined, organizer]) {
      const { body } = await gql(PROVISION, { key: 'k', org: 'acme' }, as)
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
    const { body } = await gql(PROVISION, { key: org, org }, operator)
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
