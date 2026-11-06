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

// Push emits (kontroll#61): capture what reaches waitUntil.
const cf = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  pending: [] as Promise<unknown>[],
}))
vi.mock('cloudflare:workers', () => ({
  env: cf.env,
  waitUntil: (p: Promise<unknown>) => cf.pending.push(p),
}))

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

    it('refuses an operator without a named tenant (PlatformContext)', async () => {
      // What the gateway mints on the lane when x-konf-operator-tenant is absent.
      const { body } = await update(
        { typ: 'platform', userId: 'op', platformRole: 'operator' },
        { title: 'x' },
      )
      expect(body.data).toBeNull()
      expect(body.errors).toHaveLength(1)
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

  it('carries ids, the title and the actor to identity\'s Push binding', async () => {
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
