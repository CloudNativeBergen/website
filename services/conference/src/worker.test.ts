/**
 * @vitest-environment node
 *
 * The conference subgraph through its Worker fetch handler: real envelope
 * crypto and the real migration on an in-memory SQLite standing in for D1.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphQLObjectType } from 'graphql'
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

// Push emits (kontroll#61): capture what reaches waitUntil.
const cf = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  pending: [] as Promise<unknown>[],
}))
vi.mock('cloudflare:workers', () => ({
  env: cf.env,
  waitUntil: (p: Promise<unknown>) => cf.pending.push(p),
  WorkerEntrypoint: class {
    constructor(
      _ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}))

const { default: worker } = await import('./worker')
const { schema } = await import('./subgraph')

/** The slice of D1 that drizzle-orm/d1 uses, over node:sqlite. */
function d1(db: DatabaseSync, interleave = false): D1Database {
  // With `interleave`, every statement first yields a macrotask, so
  // concurrent requests interleave between statements as on a real D1.
  const turn = () =>
    interleave ? new Promise((r) => setTimeout(r, 0)) : undefined
  const stmt = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...p: SQLInputValue[]) => stmt(sql, p),
    run: async () => {
      await turn()
      db.prepare(sql).run(...params)
      return { success: true }
    },
    all: async () => {
      await turn()
      return { results: db.prepare(sql).all(...params), success: true }
    },
    raw: async () => {
      await turn()
      const s = db.prepare(sql)
      s.setReturnArrays(true)
      return s.all(...params)
    },
    first: async () => {
      await turn()
      return db.prepare(sql).get(...params) ?? null
    },
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

  it('refuses a PlatformContext with FORBIDDEN, before any D1 read', async () => {
    const prepare = vi.spyOn(env.DB, 'prepare')
    const { body } = await gql({
      typ: 'platform',
      userId: 'op',
      platformRole: 'operator',
    })
    expect(body.data.conference).toBeNull()
    expect(
      body.errors.map(
        (e: { extensions: { code: string } }) => e.extensions.code,
      ),
    ).toEqual(['FORBIDDEN'])
    expect(prepare).not.toHaveBeenCalled()
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
    expect(
      (await update(admin, { published: false })).body.errors,
    ).toBeUndefined()
    expect(row('conf-a').published).toBe(0)
    expect(
      (await update(admin, { published: true })).body.errors,
    ).toBeUndefined()
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

  describe('operator lane (#1921)', () => {
    const as = (scopes: string[], orgRole: string | null = null): Envelope => ({
      ...(tenant('org-a', 'conf-a', orgRole) as Extract<
        Envelope,
        { typ: 'tenant' }
      >),
      userId: 'op',
      scopes,
    })
    const audits = (log: { mock: { calls: unknown[][] } }) =>
      log.mock.calls
        .map(([line]) => JSON.parse(String(line)))
        .filter((e) => e.event === 'operator.write')

    it('lets the operator scope write without a role, and audits it', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { body } = await update(as(['platform:operator']), {
        title: 'by op',
        tagline: 't',
      })
      expect(body.errors).toBeUndefined()
      expect(row('conf-a').title).toBe('by op')
      expect(audits(log)).toEqual([
        {
          event: 'operator.write',
          'konf.user_id': 'op',
          'konf.org_id': 'org-a',
          'konf.conference_id': 'conf-a',
          fields: expect.toSatisfy(
            (f: string[]) => [...f].sort().join() === 'tagline,title',
          ),
          at: expect.stringMatching(/^\d{4}-/),
        },
      ])
      log.mockRestore()
    })

    it('refuses other or look-alike scopes, and a forged operator envelope', async () => {
      for (const scopes of [
        ['platform:admin'],
        ['platform:operator:x', 'operator'],
      ]) {
        const { body } = await update(as(scopes, 'member'), { title: 'x' })
        expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
      }
      const other = await createSigner(
        (await generateEnvelopeKeyPair()).privatePem,
      )
      const forged = await gql(
        await other.sign(as(['platform:operator'])),
        MUTATION,
        { input: { title: 'x' } },
      )
      expect(forged.status).toBe(403)
      expect(row('conf-a').title).toBe('A 2026')
    })

    it('refuses an operator without a named tenant (PlatformContext), before any D1 read', async () => {
      // What the gateway mints on the lane when x-konf-operator-tenant is absent.
      const prepare = vi.spyOn(env.DB, 'prepare')
      const { body } = await update(
        { typ: 'platform', userId: 'op', platformRole: 'operator' },
        { title: 'x' },
      )
      expect(body.data).toBeNull()
      expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
      expect(prepare).not.toHaveBeenCalled()
      prepare.mockRestore()
      expect(row('conf-a').title).toBe('A 2026')
    })

    it('refuses the operator scope without a user', async () => {
      const { body } = await update(
        {
          ...(as(['platform:operator']) as Extract<
            Envelope,
            { typ: 'tenant' }
          >),
          userId: null,
        },
        { title: 'x' },
      )
      expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
      expect(row('conf-a').title).toBe('A 2026')
    })

    it('does not audit an owner/admin write', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      await update(tenant('org-a', 'conf-a', 'admin'), { title: 'by admin' })
      expect(row('conf-a').title).toBe('by admin')
      expect(audits(log)).toEqual([])
      log.mockRestore()
    })
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

  const admin = () => tenant('org-a', 'conf-a', 'admin')

  it('caps strings and socialLinks at the limit, without echoing input', async () => {
    const cases: [string, number][] = [
      ['title', 200],
      ['tagline', 500],
      ['city', 100],
      ['country', 100],
      ['venueName', 200],
      ['venueAddress', 500],
      ['backgroundPattern', 100],
    ]
    for (const [field, max] of cases) {
      const ok = await update(admin(), { [field]: 'q'.repeat(max) })
      expect(ok.body.errors, field).toBeUndefined()
      const over = 'Z'.repeat(max) + 'SECRET'
      const { body } = await update(admin(), {
        [field]: over.slice(0, max + 1),
      })
      expect(body.errors[0].extensions, field).toMatchObject({
        code: 'BAD_USER_INPUT',
        field,
      })
      expect(body.errors[0].message).not.toContain('ZZ')
    }
    const url = (n: number) => 'https://x.example/' + 'a'.repeat(n - 18)
    const link = await update(admin(), { registrationLink: url(2000) })
    expect(link.body.errors).toBeUndefined()
    const long = await update(admin(), { registrationLink: url(2001) })
    expect(long.body.errors[0].extensions.field).toBe('registrationLink')
    expect(long.body.errors[0].message).not.toContain('aaaa')
    const links = (n: number) =>
      Array.from({ length: n }, (_, i) => `https://x.example/${i}`)
    expect(
      (await update(admin(), { socialLinks: links(20) })).body.errors,
    ).toBeUndefined()
    for (const socialLinks of [links(21), [url(2001)]]) {
      const { body } = await update(admin(), { socialLinks })
      expect(body.errors[0].extensions).toMatchObject({
        code: 'BAD_USER_INPUT',
        field: 'socialLinks',
      })
      expect(body.errors[0].message).not.toContain('x.example')
    }
    expect(
      (await update(admin(), { socialLinks: [url(2000)] })).body.errors,
    ).toBeUndefined()
  })

  it('FORBIDDEN still comes before any query', async () => {
    const prepare = vi.spyOn(env.DB, 'prepare')
    const { body } = await update(tenant('org-a', 'conf-a', 'member'), {
      title: 'ok',
    })
    expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
    expect(prepare).not.toHaveBeenCalled()
  })

  it('a no-op patch leaves updated_at alone and returns the row', async () => {
    sqlite.exec(
      "UPDATE conferences SET updated_at = 'T0' WHERE conference_id = 'conf-a'",
    )
    for (const input of [
      {},
      { title: 'A 2026' },
      { socialLinks: ['https://a.example'], published: true },
    ]) {
      const { body } = await update(admin(), input)
      expect(body.errors, JSON.stringify(input)).toBeUndefined()
      expect(body.data.updateConference.title).toBe('A 2026')
      expect(row('conf-a').updated_at).toBe('T0')
    }
    // A foreign id is NOT_FOUND even for an empty patch.
    const { body } = await update(tenant('org-a', 'conf-b', 'admin'), {})
    expect(body.errors[0].extensions.code).toBe('NOT_FOUND')
  })

  it('a concurrent edit between read and write cannot break start <= end', async () => {
    sqlite.exec(
      "UPDATE conferences SET start_date = '2026-06-10', end_date = '2026-06-12' WHERE conference_id = 'conf-a'",
    )
    // Another editor commits endDate = 06-10 after this request has read
    // the row and before it writes.
    const prepare = env.DB.prepare.bind(env.DB)
    let raced = false
    vi.spyOn(env.DB, 'prepare').mockImplementation((q: string) => {
      if (!raced && /^update/i.test(q)) {
        raced = true
        sqlite.exec(
          "UPDATE conferences SET end_date = '2026-06-10' WHERE conference_id = 'conf-a'",
        )
      }
      return prepare(q)
    })
    const { body } = await update(admin(), { startDate: '2026-06-11' })
    expect(raced).toBe(true)
    expect(body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'endDate',
    })
    const r = row('conf-a')
    expect((r.start_date as string) <= (r.end_date as string)).toBe(true)
  })
})

describe('settings phase 1 (#2019)', () => {
  const PRIVATE = {
    organizerAddress: 'Street 1',
    organizerOrgNumber: '123 456 789',
    analyticsPirschCode: 'pirsch-1',
    travelSupportBudget: 12500.5,
  }
  const PUBLIC = {
    cfpStartDate: '2026-01-01',
    cfpEndDate: '2026-02-01',
    cfpNotifyDate: '2026-03-01',
    programDate: '2026-04-01',
    travelSupportPaymentDate: '2026-05-01',
    earlyBirdEndDate: '2026-06-01',
    registrationCloseDate: '2026-07-01',
    speakersAnnouncedDate: '2026-08-01',
    sponsorDeadlineDate: '2026-09-01',
    recordingsLiveDate: '2026-10-01',
    registrationEnabled: true,
    organizer: 'Acme AS',
    socialHashtag: '#acme',
    showVanityMetrics: false,
  }
  const ALL = { ...PUBLIC, ...PRIVATE }
  const FIELDS = Object.keys(ALL).join(' ')
  const MUTATION = `mutation($input: ConferencePatch!) { updateConference(input: $input) { ${FIELDS} } }`
  const admin = tenant('org-a', 'conf-a', 'admin')

  it('an admin writes and reads back every field', async () => {
    const { body } = await gql(admin, MUTATION, { input: ALL })
    expect(body.errors).toBeUndefined()
    expect(body.data.updateConference).toEqual(ALL)
  })

  it('hides organizer-only fields from anonymous callers, not from members', async () => {
    await gql(admin, MUTATION, { input: ALL })
    const read = async (as: Envelope) =>
      (await gql(as, `{ conference { ${FIELDS} } }`)).body.data.conference
    expect(await read(tenant('org-a', 'conf-a'))).toEqual({
      ...PUBLIC,
      ...Object.fromEntries(Object.keys(PRIVATE).map((k) => [k, null])),
    })
    expect(await read(tenant('org-a', 'conf-a', 'member'))).toEqual(ALL)
    // The entity path too: same gate.
    const entity = await gql(
      tenant('org-a', 'conf-a'),
      `{ _entities(representations: [{ __typename: "Conference", id: "conf-a" }]) { ... on Conference { ${Object.keys(PRIVATE).join(' ')} } } }`,
    )
    expect(entity.body.data._entities[0]).toEqual(
      Object.fromEntries(Object.keys(PRIVATE).map((k) => [k, null])),
    )
  })

  it('refuses a non-writer on each organizer-only field, and leaves it unset', async () => {
    for (const [k, v] of Object.entries(PRIVATE))
      for (const as of [
        tenant('org-a', 'conf-a'),
        tenant('org-a', 'conf-a', 'member'),
      ]) {
        const { body } = await gql(as, MUTATION, { input: { [k]: v } })
        expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
        const row = sqlite
          .prepare(
            'SELECT organizer_address, organizer_org_number, analytics_pirsch_code, travel_support_budget FROM conferences WHERE conference_id = ?',
          )
          .get('conf-a')
        expect(Object.values(row as object)).toEqual([null, null, null, null])
      }
  })

  it('rejects bad dates and a negative budget without writing', async () => {
    for (const input of [
      { cfpEndDate: '2026-02-30' },
      { sponsorDeadlineDate: 'soon' },
      { travelSupportBudget: -1 },
      { socialHashtag: 'x'.repeat(101) },
      { analyticsPirschCode: '<script>' },
      { analyticsPirschCode: 'a'.repeat(65) },
    ]) {
      const { body } = await gql(admin, MUTATION, { input })
      expect(body.errors[0].extensions.code).toBe('BAD_USER_INPUT')
    }
    expect(
      sqlite
        .prepare(
          'SELECT cfp_end_date, sponsor_deadline_date, travel_support_budget, social_hashtag FROM conferences WHERE conference_id = ?',
        )
        .get('conf-a'),
    ).toEqual({
      cfp_end_date: null,
      sponsor_deadline_date: null,
      travel_support_budget: null,
      social_hashtag: null,
    })
  })
})

describe('conference.settings_changed push event', () => {
  // emit() loads cloudflare:workers lazily: let that import settle first.
  const settled = async () => {
    await new Promise((r) => setTimeout(r))
    await Promise.all(cf.pending)
  }
  const MUTATION =
    'mutation($input: ConferencePatch!) { updateConference(input: $input) { id title } }'
  const sent: unknown[] = []
  beforeEach(() => {
    sent.length = 0
    cf.pending.length = 0
    cf.env.PUSH = {
      send: vi.fn(async (e: unknown) => void sent.push(e)),
    }
    return () => {
      delete cf.env.PUSH
    }
  })

  it("carries ids, the title and the actor to identity's Push binding", async () => {
    const { body } = await gql(tenant('org-a', 'conf-a', 'admin'), MUTATION, {
      input: { title: 'New' },
    })
    expect(body.errors).toBeUndefined()
    await settled()
    expect(sent).toEqual([
      {
        type: 'conference.settings_changed',
        organizationId: 'org-a',
        conferenceId: 'conf-a',
        conferenceName: 'New',
        actorId: 'u',
      },
    ])
  })

  it('a failed send leaves the update applied', async () => {
    cf.env.PUSH = {
      send: vi.fn(async () => {
        throw new Error('down')
      }),
    }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { body } = await gql(tenant('org-a', 'conf-a', 'admin'), MUTATION, {
      input: { title: 'Still saved' },
    })
    await settled()
    expect(body.data.updateConference.title).toBe('Still saved')
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('push.emit_failed'),
    )
  })

  it('a refused update sends nothing', async () => {
    await gql(tenant('org-a', 'conf-a', 'member'), MUTATION, {
      input: { title: 'x' },
    })
    await settled()
    expect(sent).toEqual([])
  })
})

describe('settings phase 2 (#2038)', () => {
  const PUBLIC = {
    contactEmail: 'hi@acme.example',
    cfpEmail: 'cfp@acme.example',
    sponsorEmail: 'sponsor@acme.example',
    volunteerRegistrationLink: 'https://t.example/v',
  }
  const PRIVATE = {
    sponsorRegistrationLink: 'https://t.example/s',
    speakerRegistrationLink: 'https://t.example/sp',
    salesNotificationChannel: '#sales',
    cfpNotificationChannel: '#cfp',
    speakerSlackChannel: 'speakers',
    speakerSlackInviteUrl: 'https://join.slack.com/s',
    volunteerSlackInviteUrl: 'https://join.slack.com/v',
  }
  const ALL = { ...PUBLIC, ...PRIVATE }
  const FIELDS = Object.keys(ALL).join(' ')
  const MUTATION = `mutation($input: ConferencePatch!) { updateConference(input: $input) { ${FIELDS} } }`
  const admin = tenant('org-a', 'conf-a', 'admin')
  const nulls = Object.fromEntries(Object.keys(PRIVATE).map((k) => [k, null]))

  it('an admin writes and reads back every field', async () => {
    const { body } = await gql(admin, MUTATION, { input: ALL })
    expect(body.errors).toBeUndefined()
    expect(body.data.updateConference).toEqual(ALL)
  })

  it('shows the emails and volunteer link to anyone, the rest to org members only', async () => {
    await gql(admin, MUTATION, { input: ALL })
    const read = async (as: Envelope) =>
      (await gql(as, `{ conference { ${FIELDS} } }`)).body.data.conference
    expect(await read(tenant('org-a', 'conf-a'))).toEqual({
      ...PUBLIC,
      ...nulls,
    })
    expect(await read(tenant('org-a', 'conf-a', 'member'))).toEqual(ALL)
    // The site's server lane reads them too (the read flip, #2038).
    expect(
      await read({
        ...(tenant('org-a', 'conf-a') as Extract<Envelope, { typ: 'tenant' }>),
        scopes: ['site:server'],
      }),
    ).toEqual(ALL)
    const entity = await gql(
      tenant('org-a', 'conf-a'),
      `{ _entities(representations: [{ __typename: "Conference", id: "conf-a" }]) { ... on Conference { ${Object.keys(PRIVATE).join(' ')} } } }`,
    )
    expect(entity.body.data._entities[0]).toEqual(nulls)
  })

  it('rejects each invalid value without writing', async () => {
    for (const input of [
      { contactEmail: 'not-an-email' },
      { cfpEmail: 'a b@x.example' },
      { sponsorEmail: `${'a'.repeat(250)}@x.example` },
      { salesNotificationChannel: '#has space' },
      { cfpNotificationChannel: `#${'a'.repeat(81)}` },
      { speakerSlackChannel: '#' },
      { sponsorRegistrationLink: 'javascript:alert(1)' },
      { speakerRegistrationLink: 'http://t.example/sp' },
      { volunteerRegistrationLink: 'http://t.example/v' },
      { speakerSlackInviteUrl: 'http://join.slack.com/s' },
      { volunteerSlackInviteUrl: '/relative' },
    ]) {
      const { body } = await gql(admin, MUTATION, { input })
      expect(body.errors?.[0].extensions.code, JSON.stringify(input)).toBe(
        'BAD_USER_INPUT',
      )
    }
    const row = sqlite
      .prepare(
        'SELECT contact_email, cfp_email, sponsor_email, sales_notification_channel, cfp_notification_channel, speaker_slack_channel, sponsor_registration_link, speaker_registration_link, volunteer_registration_link, speaker_slack_invite_url, volunteer_slack_invite_url FROM conferences WHERE conference_id = ?',
      )
      .get('conf-a')
    expect(Object.values(row as object).every((v) => v === null)).toBe(true)
  })
})

describe('tenant span attributes (#1814)', () => {
  /** An ExecutionContext whose active span records what is set on it. */
  function traced() {
    const setAttributes = vi.fn()
    const ctx = {
      tracing: { getActiveSpan: () => ({ setAttributes }) },
    } as unknown as ExecutionContext
    return { ctx, setAttributes }
  }

  async function fetchWith(ctx: ExecutionContext, as?: Envelope | string) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (as)
      headers[ENVELOPE_HEADER] =
        typeof as === 'string' ? as : await signer.sign(as)
    return worker.fetch(
      new Request('http://conference/graphql', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: QUERY }),
      }),
      env,
      ctx,
    )
  }

  it("sets the envelope's org and conference on the request's span", async () => {
    const { ctx, setAttributes } = traced()
    const res = await fetchWith(ctx, tenant('org-a', 'conf-a'))
    expect(res.status).toBe(200)
    expect(setAttributes.mock.calls).toEqual([
      [{ 'konf.org_id': 'org-a', 'konf.conference_id': 'conf-a' }],
    ])
  })

  it('leaves the conference out for an org-level envelope', async () => {
    const { ctx, setAttributes } = traced()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await fetchWith(ctx, tenant('org-a', null))
    // A span attribute cannot be null; the runtime drops undefined.
    expect(setAttributes.mock.calls).toEqual([[{ 'konf.org_id': 'org-a' }]])
    expect(log.mock.calls[0]).toEqual(['{"konf.org_id":"org-a"}'])
    log.mockRestore()
  })

  it('sets the operator, not a tenant, for a PlatformContext', async () => {
    const { ctx, setAttributes } = traced()
    await fetchWith(ctx, {
      typ: 'platform',
      userId: 'op',
      platformRole: 'operator',
    })
    expect(setAttributes.mock.calls).toEqual([[{ 'konf.platform_user': 'op' }]])
  })

  it('sets the user, not an operator, for a UserContext', async () => {
    const { ctx, setAttributes } = traced()
    await fetchWith(ctx, { typ: 'user', userId: 'u1' })
    expect(setAttributes.mock.calls).toEqual([[{ 'konf.user_id': 'u1' }]])
  })

  it('sets nothing for a refused envelope', async () => {
    const { ctx, setAttributes } = traced()
    expect((await fetchWith(ctx, 'not-a-jwt')).status).toBe(403)
    expect((await fetchWith(ctx)).status).toBe(401)
    expect(setAttributes).not.toHaveBeenCalled()
  })

  it('serves the request when the runtime has no active span', async () => {
    const ctx = {
      tracing: { getActiveSpan: () => undefined },
    } as unknown as ExecutionContext
    const res = await fetchWith(ctx, tenant('org-a', 'conf-a'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { conference: { id: string } } }
    expect(body.data.conference.id).toBe('conf-a')
  })
})

describe('conferenceParityStatus', () => {
  const query =
    '{ conferenceParityStatus { ranAt status checked affected drifted { conferenceId fields } } }'
  const platform: Envelope = {
    typ: 'platform',
    userId: 'op',
    platformRole: 'operator',
  }
  const seedStatus = () =>
    sqlite
      .prepare(
        'INSERT INTO job_status (job, ran_at, status, checked, affected, detail) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        'conference.parity',
        1_800_000_000_000,
        'drift',
        2,
        1,
        JSON.stringify([{ conferenceId: 'conf-b', fields: ['city', 'title'] }]),
      )

  it('keeps operator status required fields non-null in the schema', () => {
    const drift = schema.getType('ConferenceParityDrift') as GraphQLObjectType
    const status = schema.getType('ConferenceParityStatus') as GraphQLObjectType
    expect(
      schema.getQueryType()?.getFields().conferenceParityStatus.type.toString(),
    ).toBe('ConferenceParityStatus')
    expect(drift.getFields().conferenceId.type.toString()).toBe('ID!')
    expect(drift.getFields().fields.type.toString()).toBe('[String!]!')
    expect(status.getFields().ranAt.type.toString()).toBe('String!')
    expect(status.getFields().status.type.toString()).toBe('String!')
    expect(status.getFields().drifted.type.toString()).toBe(
      '[ConferenceParityDrift!]!',
    )
  })

  it('returns null before the job has run', async () => {
    const { body } = await gql(platform, query)
    expect(body).toEqual({ data: { conferenceParityStatus: null } })
  })

  it('returns concrete stored values to a signed platform envelope', async () => {
    seedStatus()
    const { body } = await gql(platform, query)
    expect(body).toEqual({
      data: {
        conferenceParityStatus: {
          ranAt: '2027-01-15T08:00:00.000Z',
          status: 'drift',
          checked: 2,
          affected: 1,
          drifted: [{ conferenceId: 'conf-b', fields: ['city', 'title'] }],
        },
      },
    })
  })

  it.each([{ scopes: [] }, { scopes: ['platform:operator'] }])(
    'refuses a tenant with scopes %j before reading status',
    async ({ scopes }) => {
      seedStatus()
      const prepare = vi.spyOn(env.DB, 'prepare')
      const as: Envelope = {
        typ: 'tenant',
        orgId: 'org-a',
        conferenceId: 'conf-a',
        userId: 'op',
        orgRole: 'admin',
        scopes,
      }
      const { body } = await gql(as, query)
      expect(body.data.conferenceParityStatus).toBeNull()
      expect(body.errors?.[0]?.extensions.code).toBe('FORBIDDEN')
      expect(body.errors).toHaveLength(1)
      expect(
        prepare.mock.calls.filter(([sql]) => sql.includes('job_status')),
      ).toEqual([])
    },
  )
})

describe('settings phase 3 (#2080)', () => {
  const PUBLIC = {
    ticketingProvider: 'tito',
    publicFreeTicketIds: [7, 9],
    workshopRegistrationSponsorStart: '2026-05-01T08:00:00.000Z',
    workshopRegistrationStart: '2026-05-02T08:00:00.000Z',
    workshopRegistrationEnd: '2026-06-01T08:00:00.000Z',
    workshopEarlyAccessTicketTypes: ['Two-day pass'],
  }
  const PRIVATE_SCALARS = {
    checkinCustomerId: 12,
    ticketCapacity: 400,
    ticketTargetsEnabled: true,
    ticketSalesStartDate: '2026-01-15',
    ticketTargetCurve: 's_curve',
  }
  // The binding is platform-set only; written below as an operator.
  const BINDING = {
    checkinEventId: 34,
    titoAccountSlug: 'acme',
    titoEventSlug: '2026',
  }
  const LISTS_IN = {
    ticketTargetMilestones: [
      { date: '2026-03-01', targetPercentage: 50, label: '' },
      { date: '2026-04-01', targetPercentage: 90, label: 'Early bird' },
    ],
    ticketTypeRoles: [
      { typeName: 'Workshop add-on', admits: false },
      { typeName: 'Two-day pass', grantsWorkshop: true },
    ],
  }
  // As stored: an empty label dropped, unanswered questions null, not false.
  const LISTS_OUT = {
    ticketTargetMilestones: [
      { date: '2026-03-01', targetPercentage: 50, label: null },
      { date: '2026-04-01', targetPercentage: 90, label: 'Early bird' },
    ],
    ticketTypeRoles: [
      { typeName: 'Workshop add-on', admits: false, grantsWorkshop: null },
      { typeName: 'Two-day pass', admits: null, grantsWorkshop: true },
    ],
  }
  const REMINDER = {
    workshopReminderLastSentAt: '2026-05-03T10:00:00.000Z',
    workshopReminderLastSentCount: 5,
    workshopReminderReservedAt: '2026-05-03T09:59:00.000Z',
  }
  const PRIVATE_KEYS = [
    ...Object.keys(PRIVATE_SCALARS),
    ...Object.keys(BINDING),
    ...Object.keys(REMINDER),
  ]
  const SEL = [
    ...Object.keys(PUBLIC),
    ...PRIVATE_KEYS,
    'ticketTargetMilestones { date targetPercentage label }',
    'ticketTypeRoles { typeName admits grantsWorkshop }',
  ].join(' ')
  const MUTATION = `mutation($input: ConferencePatch!) { updateConference(input: $input) { id } }`
  // Binding an event needs a paid plan (#2141); tested on its own below.
  const admin: Envelope = {
    ...(tenant('org-a', 'conf-a', 'admin') as Extract<
      Envelope,
      { typ: 'tenant' }
    >),
    plan: 'basic',
  }
  const operator: Envelope = {
    ...(admin as Extract<Envelope, { typ: 'tenant' }>),
    scopes: ['platform:operator'],
  }
  const privateNulls = Object.fromEntries(
    [...PRIVATE_KEYS, 'ticketTargetMilestones', 'ticketTypeRoles'].map((k) => [
      k,
      null,
    ]),
  )
  const read = async (as: Envelope) =>
    (await gql(as, `{ conference { ${SEL} } }`)).body.data.conference
  const seedReminder = () =>
    sqlite
      .prepare(
        'UPDATE conferences SET workshop_reminder_last_sent_at = ?, workshop_reminder_last_sent_count = ?, workshop_reminder_reserved_at = ? WHERE conference_id = ?',
      )
      .run(...(Object.values(REMINDER) as [string, number, string]), 'conf-a')

  it('an admin writes every patch field and a member reads them back as stored', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(
      (await gql(operator, MUTATION, { input: BINDING })).body.errors,
    ).toBeUndefined()
    const { body } = await gql(admin, MUTATION, {
      input: { ...PUBLIC, ...PRIVATE_SCALARS, ...LISTS_IN },
    })
    expect(body.errors).toBeUndefined()
    seedReminder()
    expect(await read(tenant('org-a', 'conf-a', 'member'))).toEqual({
      ...PUBLIC,
      ...PRIVATE_SCALARS,
      ...BINDING,
      ...LISTS_OUT,
      ...REMINDER,
    })
  })

  it('shows the public six to anyone and the rest to org members only, on the entity path too', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await gql(operator, MUTATION, {
      input: { ...BINDING, ...PUBLIC, ...PRIVATE_SCALARS, ...LISTS_IN },
    })
    seedReminder()
    expect(await read(tenant('org-a', 'conf-a'))).toEqual({
      ...PUBLIC,
      ...privateNulls,
    })
    // Another org's member is anonymous here.
    expect(await read(tenant('org-b', 'conf-a', 'admin'))).toBeNull()
    const entity = await gql(
      tenant('org-a', 'conf-a'),
      `{ _entities(representations: [{ __typename: "Conference", id: "conf-a" }]) { ... on Conference { ${SEL} } } }`,
    )
    expect(entity.body.data._entities[0]).toEqual({
      ...PUBLIC,
      ...privateNulls,
    })
  })

  it('keeps the reminder state out of the patch', async () => {
    for (const k of Object.keys(REMINDER)) {
      const { body } = await gql(admin, MUTATION, {
        input: { [k]: (REMINDER as Record<string, unknown>)[k] },
      })
      expect(body.errors?.[0].message, k).toMatch(/not defined/)
    }
  })

  it('trusts a binding change on the site lane, whose router admits only operators', async () => {
    const site: Envelope = {
      ...(admin as Extract<Envelope, { typ: 'tenant' }>),
      scopes: ['site:server'],
    }
    const { body } = await gql(site, MUTATION, { input: BINDING })
    expect(body.errors).toBeUndefined()
  })

  it('lets only a platform operator change the vendor binding off the site lane (member lanes, e.g. kontroll); re-sending it is not a change', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    for (const [k, v] of Object.entries(BINDING)) {
      const { body } = await gql(admin, MUTATION, { input: { [k]: v } })
      expect(body.errors?.[0].extensions.code, k).toBe('FORBIDDEN')
    }
    const row = () =>
      sqlite
        .prepare(
          'SELECT checkin_event_id, tito_account_slug, tito_event_slug FROM conferences WHERE conference_id = ?',
        )
        .get('conf-a')
    expect(Object.values(row() as object).every((v) => v === null)).toBe(true)
    expect(
      (await gql(operator, MUTATION, { input: BINDING })).body.errors,
    ).toBeUndefined()
    // The stored values, re-sent by an admin with another field, pass.
    const { body } = await gql(admin, MUTATION, {
      input: { ...BINDING, ticketCapacity: 10 },
    })
    expect(body.errors).toBeUndefined()
    expect(row()).toEqual({
      checkin_event_id: 34,
      tito_account_slug: 'acme',
      tito_event_slug: '2026',
    })
  })

  it('stores an empty list as unset', async () => {
    await gql(admin, MUTATION, {
      input: { publicFreeTicketIds: [], ticketTypeRoles: [] },
    })
    expect(
      sqlite
        .prepare(
          'SELECT public_free_ticket_ids, ticket_type_roles FROM conferences WHERE conference_id = ?',
        )
        .get('conf-a'),
    ).toEqual({ public_free_ticket_ids: null, ticket_type_roles: null })
  })

  it('rejects each invalid value without writing', async () => {
    for (const input of [
      { ticketingProvider: 'eventbrite' },
      { checkinCustomerId: 0 },
      { ticketCapacity: -1 },
      { titoAccountSlug: 'has space' },
      { ticketSalesStartDate: '2026-02-30' },
      { ticketTargetCurve: 'zigzag' },
      { workshopRegistrationStart: 'tomorrow' },
      { workshopRegistrationEnd: '2026-06-01' },
      {
        workshopRegistrationStart: '2026-06-01T08:00:00Z',
        workshopRegistrationEnd: '2026-05-01T08:00:00Z',
      },
      {
        workshopRegistrationSponsorStart: '2026-05-02T08:00:00Z',
        workshopRegistrationStart: '2026-05-02T08:00:00Z',
      },
      { publicFreeTicketIds: [1, 0] },
      { publicFreeTicketIds: Array.from({ length: 201 }, (_, i) => i + 1) },
      { workshopEarlyAccessTicketTypes: ['  '] },
      { workshopEarlyAccessTicketTypes: ['tab\there'] },
      { ticketTypeRoles: [{ typeName: 'x'.repeat(201) }] },
      {
        ticketTargetMilestones: [{ date: '2026-03-01', targetPercentage: 101 }],
      },
      { ticketTargetMilestones: [{ date: 'March', targetPercentage: 50 }] },
    ]) {
      const { body } = await gql(admin, MUTATION, { input })
      expect(body.errors?.[0].extensions.code, JSON.stringify(input)).toBe(
        'BAD_USER_INPUT',
      )
    }
    const row = sqlite
      .prepare(
        'SELECT ticketing_provider, checkin_customer_id, ticket_capacity, tito_account_slug, ticket_sales_start_date, ticket_target_curve, workshop_registration_sponsor_start, workshop_registration_start, workshop_registration_end, public_free_ticket_ids, workshop_early_access_ticket_types, ticket_type_roles, ticket_target_milestones FROM conferences WHERE conference_id = ?',
      )
      .get('conf-a')
    expect(Object.values(row as object).every((v) => v === null)).toBe(true)
  })

  const site: Envelope = {
    ...(tenant('org-a', 'conf-a') as Extract<Envelope, { typ: 'tenant' }>),
    scopes: ['site:server'],
  }

  it('serves the members-only ticket setup to the site lane, still not to an anonymous caller', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await gql(operator, MUTATION, {
      input: { ...BINDING, ...PUBLIC, ...PRIVATE_SCALARS, ...LISTS_IN },
    })
    seedReminder()
    expect(await read(site)).toEqual({
      ...PUBLIC,
      ...PRIVATE_SCALARS,
      ...BINDING,
      ...LISTS_OUT,
      ...REMINDER,
    })
    expect(await read(tenant('org-a', 'conf-a'))).toEqual({
      ...PUBLIC,
      ...privateNulls,
    })
  })

  describe('workshop reminder lock', () => {
    const RESERVE =
      'mutation { reserveWorkshopReminder { token retryAfterMs } }'
    const RELEASE =
      'mutation($t: String!) { releaseWorkshopReminder(token: $t) }'
    const RECORD =
      'mutation($at: String!, $n: Int!) { recordWorkshopReminder(sentAt: $at, count: $n) }'
    const reserved = () =>
      (
        sqlite
          .prepare(
            'SELECT workshop_reminder_reserved_at AS r FROM conferences WHERE conference_id = ?',
          )
          .get('conf-a') as { r: string | null }
      ).r

    it('of concurrent claims, exactly one wins', async () => {
      env.DB = d1(sqlite, true)
      const results = await Promise.all(
        Array.from({ length: 8 }, () => gql(site, RESERVE)),
      )
      const r = results.map((x) => x.body.data.reserveWorkshopReminder)
      expect(r.filter((x) => x.token).length).toBe(1)
      for (const x of r.filter((x) => !x.token))
        expect(x.retryAfterMs).toBeGreaterThan(59 * 60 * 1000)
      expect(reserved()).toBe(r.find((x) => x.token).token)
    })

    it('frees the hour after an hour, or for an unparsable reservation', async () => {
      const set = (v: string) =>
        sqlite
          .prepare(
            'UPDATE conferences SET workshop_reminder_reserved_at = ? WHERE conference_id = ?',
          )
          .run(v, 'conf-a')
      set(new Date(Date.now() - 59 * 60 * 1000).toISOString())
      expect(
        (await gql(site, RESERVE)).body.data.reserveWorkshopReminder.token,
      ).toBeNull()
      set(new Date(Date.now() - 61 * 60 * 1000).toISOString())
      expect(
        (await gql(site, RESERVE)).body.data.reserveWorkshopReminder.token,
      ).toBeTruthy()
      set('garbage')
      expect(
        (await gql(site, RESERVE)).body.data.reserveWorkshopReminder.token,
      ).toBeTruthy()
    })

    it('releases only its own reservation', async () => {
      const { token } = (await gql(site, RESERVE)).body.data
        .reserveWorkshopReminder
      expect(
        (await gql(site, RELEASE, { t: 'someone-else' })).body.data
          .releaseWorkshopReminder,
      ).toBe(false)
      expect(reserved()).toBe(token)
      expect(
        (await gql(site, RELEASE, { t: token })).body.data
          .releaseWorkshopReminder,
      ).toBe(true)
      expect(reserved()).toBeNull()
    })

    it('records the last send', async () => {
      const at = '2026-05-03T10:00:00.000Z'
      await gql(site, RECORD, { at, n: 3 })
      expect(
        sqlite
          .prepare(
            'SELECT workshop_reminder_last_sent_at AS a, workshop_reminder_last_sent_count AS n FROM conferences WHERE conference_id = ?',
          )
          .get('conf-a'),
      ).toEqual({ a: at, n: 3 })
    })

    it('refuses every caller off the site lane, before touching the row', async () => {
      for (const as of [
        admin,
        tenant('org-a', 'conf-a'),
        tenant('org-a', 'conf-a', 'owner'),
      ]) {
        for (const [q, v] of [
          [RESERVE, undefined],
          [RELEASE, { t: 'x' }],
          [RECORD, { at: '2026-05-03T10:00:00.000Z', n: 1 }],
        ] as const) {
          const { body } = await gql(as, q, v)
          expect(body.errors?.[0].extensions.code).toBe('FORBIDDEN')
        }
      }
      expect(reserved()).toBeNull()
    })
  })
})

// Authorization phase 1 (#2106): site:server keeps only the reminder lock and
// the ticket-setup read (+ the vendor binding until phase 2b); operator writes
// go to identity's audit sink over the PUSH binding.
describe('authz phase 1', () => {
  const settled = async () => {
    await new Promise((r) => setTimeout(r))
    await Promise.all(cf.pending)
  }
  const UPDATE =
    'mutation($input: ConferencePatch!) { updateConference(input: $input) { id title } }'
  const site = (conferenceId = 'conf-a'): Envelope => ({
    ...(tenant('org-a', conferenceId) as Extract<Envelope, { typ: 'tenant' }>),
    scopes: ['site:server'],
  })
  const operator: Envelope = {
    ...(tenant('org-a', 'conf-a') as Extract<Envelope, { typ: 'tenant' }>),
    userId: 'op',
    scopes: ['platform:operator'],
  }
  const title = (id: string) =>
    (
      sqlite
        .prepare('SELECT title FROM conferences WHERE conference_id = ?')
        .get(id) as { title: string }
    ).title
  const audits: unknown[] = []
  beforeEach(() => {
    audits.length = 0
    cf.pending.length = 0
    cf.env.PUSH = {
      send: vi.fn(async () => {}),
      audit: vi.fn(async (e: unknown) => void audits.push(e)),
    }
    return () => {
      delete cf.env.PUSH
    }
  })

  it('the site lane does not read a draft', async () => {
    expect((await gql(site('conf-a-draft'))).body.data.conference).toBeNull()
  })

  it('the site lane does not write settings', async () => {
    const { body } = await gql(site(), UPDATE, { input: { title: 'x' } })
    expect(body.errors?.[0].extensions.code).toBe('FORBIDDEN')
    expect(title('conf-a')).toBe('A 2026')
  })

  it('a plain member reads a draft (owner decision 1) but does not write', async () => {
    const member = tenant('org-a', 'conf-a-draft', 'member')
    expect((await gql(member)).body.data.conference).toMatchObject({
      id: 'conf-a-draft',
    })
    const { body } = await gql(member, UPDATE, { input: { title: 'x' } })
    expect(body.errors?.[0].extensions.code).toBe('FORBIDDEN')
    expect(title('conf-a-draft')).toBe('A 2027')
  })

  it('"Admin" writes now (parser fix, docs/AUTHORIZATION.md §1.2 #4)', async () => {
    const { body } = await gql(tenant('org-a', 'conf-a', ' Admin '), UPDATE, {
      input: { title: 'Cased' },
    })
    expect(body.errors).toBeUndefined()
    expect(title('conf-a')).toBe('Cased')
  })

  it('an unknown role string neither reads a draft nor writes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const guest = tenant('org-a', 'conf-a-draft', 'guest')
    expect((await gql(guest)).body.data.conference).toBeNull()
    const { body } = await gql(guest, UPDATE, { input: { title: 'x' } })
    expect(body.errors?.[0].extensions.code).toBe('FORBIDDEN')
  })

  it('audits an operator write to identity, with ids and field names only', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { body } = await gql(operator, UPDATE, { input: { title: 'Op' } })
    expect(body.errors).toBeUndefined()
    await settled()
    expect(audits).toEqual([
      {
        type: 'operator.write',
        actorId: 'op',
        organizationId: 'org-a',
        conferenceId: 'conf-a',
        fields: ['title'],
      },
    ])
  })

  it('audits nothing for an org admin or a refused write', async () => {
    await gql(tenant('org-a', 'conf-a', 'admin'), UPDATE, {
      input: { title: 'Adm' },
    })
    await gql(site(), UPDATE, { input: { title: 'x' } })
    await settled()
    expect(audits).toEqual([])
  })
})

describe('ProgramDate.ticketed (#2129, #2141)', () => {
  it('answers whether an edition of that org has a vendor event bound, published or not', async () => {
    const { ProgramDate } = await import('./index')
    // The production shape: no provider (Checkin) and an event id.
    sqlite.exec(
      "UPDATE conferences SET checkin_event_id = 218308 WHERE conference_id = 'conf-a'",
    )
    sqlite.exec(
      "UPDATE conferences SET ticketing_provider = 'tito', tito_account_slug = 'a', tito_event_slug = '2027' WHERE conference_id = 'conf-a-draft'",
    )
    // A vendor picked with no event bound sells nothing.
    sqlite.exec(
      "UPDATE conferences SET ticketing_provider = 'checkin' WHERE conference_id = 'conf-b'",
    )
    const rpc = new ProgramDate({} as never, env as never)
    expect(await rpc.ticketed('org-a', 'conf-a')).toBe(true)
    expect(await rpc.ticketed('org-a', 'conf-a-draft')).toBe(true)
    expect(await rpc.ticketed('org-b', 'conf-b')).toBe(false)
    // Another org's id finds nothing.
    expect(await rpc.ticketed('org-b', 'conf-a')).toBe(false)
  })
})

describe('ProgramDate.cfpChannel (#2215)', () => {
  it("answers the published edition's CFP channel, never another org's", async () => {
    const { ProgramDate } = await import('./index')
    sqlite.exec(
      "UPDATE conferences SET cfp_notification_channel = '#cfp-a' WHERE conference_id IN ('conf-a', 'conf-a-draft')",
    )
    const rpc = new ProgramDate({} as never, env as never)
    expect(await rpc.cfpChannel('org-a', 'conf-a')).toBe('#cfp-a')
    expect(await rpc.cfpChannel('org-b', 'conf-a')).toBeNull()
    expect(await rpc.cfpChannel('org-a', 'conf-a-draft')).toBeNull()
  })
})

describe('Editions entrypoint (provisioned editions)', () => {
  const EDITIONS = '{ conferenceEditions { id title startDate } }'
  const rows = () =>
    sqlite
      .prepare(
        'SELECT conference_id, org_id, title, published FROM conferences ORDER BY 1',
      )
      .all()
  const rpc = async () => {
    const { Editions } = await import('./index')
    return new Editions({} as never, env as never)
  }

  it('a provisioned edition is listed for an insider, not for an outsider; a rerun never overwrites', async () => {
    const e = await rpc()
    await e.createEdition(
      'org-a',
      'conf-new',
      'A 2028',
      '2028-05-01',
      '2028-05-02',
    )
    await e.createEdition('org-a', 'conf-new', 'Again', null, null)
    const insider = await gql(tenant('org-a', 'conf-a', 'admin'), EDITIONS)
    expect(insider.body.data.conferenceEditions).toContainEqual({
      id: 'conf-new',
      title: 'A 2028',
      startDate: '2028-05-01',
    })
    const outsider = await gql(tenant('org-a', 'conf-a'), EDITIONS)
    expect(
      outsider.body.data.conferenceEditions.map((x: { id: string }) => x.id),
    ).not.toContain('conf-new')
  })

  it("throws on another org's conference id and leaves the row as it was", async () => {
    const e = await rpc()
    const before = rows()
    await expect(
      e.createEdition('org-b', 'conf-a', 'Hijack', null, null),
    ).rejects.toThrow('another org')
    expect(rows()).toEqual(before)
  })

  it('deleteEdition removes only an unpublished row of that org, idempotently', async () => {
    const e = await rpc()
    await e.deleteEdition('org-b', 'conf-a-draft') // another org's draft
    await e.deleteEdition('org-a', 'conf-a') // published
    expect(rows()).toHaveLength(3)
    await e.deleteEdition('org-a', 'conf-a-draft')
    await e.deleteEdition('org-a', 'conf-a-draft')
    expect(
      rows().map((r) => (r as { conference_id: string }).conference_id),
    ).toEqual(['conf-a', 'conf-b'])
  })

  it('is bound by tenant-directory only; ProgramDate has no write methods', async () => {
    const { ProgramDate } = await import('./index')
    expect(Object.getOwnPropertyNames(ProgramDate.prototype)).not.toContain(
      'createEdition',
    )
    const services = new URL('../../', import.meta.url)
    const binders = readdirSync(services).filter((d) => {
      try {
        return /"entrypoint":\s*"Editions"/.test(
          readFileSync(new URL(`${d}/wrangler.jsonc`, services), 'utf8'),
        )
      } catch {
        return false
      }
    })
    expect(binders).toEqual(['tenant-directory'])
  })
})

describe('updateConference plan gate on binding an event (#2141)', () => {
  const MUTATION = `mutation($input: ConferencePatch!) { updateConference(input: $input) { id } }`
  const site = (plan?: 'free' | 'basic'): Envelope => ({
    ...(tenant('org-a', 'conf-a', 'admin') as Extract<
      Envelope,
      { typ: 'tenant' }
    >),
    scopes: ['site:server'],
    ...(plan && { plan }),
  })
  const bound = () =>
    sqlite
      .prepare(
        'SELECT checkin_event_id, tito_event_slug FROM conferences WHERE conference_id = ?',
      )
      .get('conf-a')

  it.each([
    ['a Checkin event (absent provider)', { checkinEventId: 34 }],
    [
      'a Tito event',
      {
        ticketingProvider: 'tito',
        titoAccountSlug: 'a',
        titoEventSlug: '2026',
      },
    ],
  ])('refuses binding %s on free, writing nothing', async (_, input) => {
    for (const plan of [undefined, 'free'] as const) {
      const { body } = await gql(site(plan), MUTATION, { input })
      expect(body.errors?.[0].extensions).toMatchObject({
        reason: 'PLAN_REQUIRED',
        requiredPlan: 'basic',
      })
    }
    expect(bound()).toEqual({ checkin_event_id: null, tito_event_slug: null })
  })

  it('binds on basic; an already bound edition and a vendor pick alone are never asked', async () => {
    expect(
      (await gql(site('basic'), MUTATION, { input: { checkinEventId: 34 } }))
        .body.errors,
    ).toBeUndefined()
    expect(
      (await gql(site(), MUTATION, { input: { checkinEventId: 35 } })).body
        .errors,
    ).toBeUndefined()
    expect(bound()).toEqual({ checkin_event_id: 35, tito_event_slug: null })
    sqlite.exec('UPDATE conferences SET checkin_event_id = NULL')
    expect(
      (
        await gql(site(), MUTATION, {
          input: { ticketingProvider: 'checkin', checkinCustomerId: 1 },
        })
      ).body.errors,
    ).toBeUndefined()
  })
})

describe('updateConference plan gate on going public (#2200)', () => {
  const MUTATION = `mutation($input: ConferencePatch!) { updateConference(input: $input) { id } }`
  const admin = (plan?: 'free' | 'basic'): Envelope => ({
    ...(tenant('org-a', 'conf-a', 'admin') as Extract<
      Envelope,
      { typ: 'tenant' }
    >),
    ...(plan && { plan }),
  })
  const state = () =>
    sqlite
      .prepare(
        'SELECT visibility, published FROM conferences WHERE conference_id = ?',
      )
      .get('conf-a')
  const lapsed = () =>
    sqlite.exec(
      "UPDATE conferences SET checkin_event_id = 34, visibility = 'unlisted', published = 0 WHERE conference_id = 'conf-a'",
    )

  it.each([
    ['visibility: live', { visibility: 'live' }],
    ['published: true', { published: true }],
  ])(
    'refuses %s for a ticketed edition on free, writing nothing',
    async (_, input) => {
      lapsed()
      for (const plan of [undefined, 'free'] as const) {
        const { body } = await gql(admin(plan), MUTATION, { input })
        expect(body.errors?.[0].extensions).toMatchObject({
          reason: 'PLAN_REQUIRED',
          requiredPlan: 'basic',
        })
      }
      expect(state()).toEqual({ visibility: 'unlisted', published: 0 })
    },
  )

  it('publishes on basic; an unticketed edition on free is never asked', async () => {
    lapsed()
    const input = { visibility: 'live', published: true }
    expect(
      (await gql(admin('basic'), MUTATION, { input })).body.errors,
    ).toBeUndefined()
    expect(state()).toEqual({ visibility: 'live', published: 1 })
    sqlite.exec(
      "UPDATE conferences SET checkin_event_id = NULL, visibility = 'unlisted', published = 0 WHERE conference_id = 'conf-a'",
    )
    expect(
      (await gql(admin(), MUTATION, { input })).body.errors,
    ).toBeUndefined()
    expect(state()).toEqual({ visibility: 'live', published: 1 })
  })
})
