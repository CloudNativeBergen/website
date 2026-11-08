/**
 * @vitest-environment node
 *
 * The ticketing subgraph through its Worker fetch handler and its Ingest
 * entrypoint: real envelope crypto and the real migration on an in-memory
 * SQLite standing in for D1.
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
vi.mock('cloudflare:workers', () => ({
  WorkerEntrypoint: class {
    constructor(
      _ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}))

const { default: worker, Ingest } = await import('./index')
type IngestInput = Parameters<InstanceType<typeof Ingest>['order']>[0]

/** The slice of D1 this service uses, over node:sqlite. Counts reads. */
const reads = { n: 0 }
function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, params: SQLInputValue[] = []) => ({
    sql,
    params,
    bind: (...p: SQLInputValue[]) => stmt(sql, p),
    run: async () => (db.prepare(sql).run(...params), { success: true }),
    all: async () => {
      reads.n++
      return { results: db.prepare(sql).all(...params), success: true }
    },
    first: async () => {
      reads.n++
      return db.prepare(sql).get(...params) ?? null
    },
  })
  return {
    prepare: (sql: string) => stmt(sql),
    // All or nothing, as D1's batch.
    batch: async (stmts: ReturnType<typeof stmt>[]) => {
      reads.n++
      db.exec('BEGIN')
      try {
        const out = stmts.map((s) => ({
          results: /^\s*select/i.test(s.sql)
            ? db.prepare(s.sql).all(...s.params)
            : (db.prepare(s.sql).run(...s.params), []),
          success: true,
        }))
        db.exec('COMMIT')
        return out
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
  } as unknown as D1Database
}

const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)
const tenant = (
  orgId: string,
  conferenceId: string | null,
  orgRole: string | null = null,
  extra: Partial<Extract<Envelope, { typ: 'tenant' }>> = {},
): Envelope => ({
  typ: 'tenant',
  orgId,
  conferenceId,
  userId: orgRole || extra.scopes ? 'u' : null,
  orgRole,
  scopes: [],
  ...extra,
})
const platform: Envelope = {
  typ: 'platform',
  userId: 'op',
  platformRole: 'operator',
}

let sqlite: DatabaseSync
let env: Parameters<typeof worker.fetch>[1]
const ingest = (input: IngestInput) =>
  new Ingest({} as never, env as never).order(input)

const EVENT = { provider: 'checkin', accountId: '1', externalId: '100' }
const line = (externalId: string, amountMinor: number, quantity: number) => ({
  ticketType: {
    externalId,
    name: `Type ${externalId}`,
    price: { amountMinor, currency: 'NOK' },
    capacity: 100,
  },
  quantity,
})
const order = (
  externalId: string,
  lines = [line('std', 150000, 2)],
  status: 'pending' | 'paid' | 'cancelled' = 'paid',
): IngestInput => ({
  orgId: 'org-a',
  conferenceId: 'conf-a',
  event: EVENT,
  order: {
    externalId,
    status,
    total: {
      amountMinor: lines.reduce(
        (n, l) => n + l.ticketType.price.amountMinor * l.quantity,
        0,
      ),
      currency: 'NOK',
    },
    buyerEmail: `${externalId}@example.com`,
    createdAt: '2026-11-01T10:00:00Z',
    lines,
  },
})

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  const dir = new URL('../migrations/', import.meta.url)
  for (const f of readdirSync(dir).sort())
    sqlite.exec(readFileSync(new URL(f, dir), 'utf8'))
  env = { DB: d1(sqlite), GATEWAY_PUBLIC_KEY: keys.publicPem }
  // The trusted mappings ingest needs, as an operator binds them.
  for (const [org, conf, externalId] of [
    ['org-a', 'conf-a', '100'],
    ['org-b', 'conf-b', '200'],
  ])
    sqlite
      .prepare(
        "INSERT INTO ticket_events VALUES (?, ?, ?, 'checkin', '1', ?, '2026-01-01')",
      )
      .run(`ev-${externalId}`, org, conf, externalId)
  reads.n = 0
})

async function gql(
  as: Envelope,
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await worker.fetch(
    new Request('http://ticketing/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [ENVELOPE_HEADER]: await signer.sign(as),
      },
      body: JSON.stringify({ query, variables }),
    }),
    env,
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary GraphQL JSON
  return (await res.json()) as any
}

const SALES =
  '{ ticketSales { ticketsSold orders revenue { amountMinor currency } byType { name sold capacity price { amountMinor currency } } } }'
const ORDERS =
  '{ ticketOrders { externalId status buyerEmail total { amountMinor currency } } }'
const count = (t: string) =>
  (sqlite.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n

describe('ingest', () => {
  it('is idempotent on EventRef and order externalId', async () => {
    const a = await ingest(order('o1'))
    const b = await ingest(order('o1'))
    expect(b.orderId).toBe(a.orderId)
    expect([count('ticket_events'), count('ticket_types')]).toEqual([2, 1])
    expect([count('ticket_orders'), count('ticket_order_lines')]).toEqual([
      1, 1,
    ])
    const { data } = await gql(tenant('org-a', 'conf-a', 'admin'), SALES)
    expect(data.ticketSales.ticketsSold).toBe(2)
    expect(data.ticketSales.revenue).toEqual([
      { amountMinor: 300000, currency: 'NOK' },
    ])
  })

  it('replaces the lines of a changed order, and cancelled stays cancelled', async () => {
    await ingest(order('o1'))
    await ingest(order('o1', [line('std', 150000, 1), line('vip', 300000, 1)]))
    let s = (await gql(tenant('org-a', 'conf-a', 'owner'), SALES)).data
    expect(s.ticketSales.ticketsSold).toBe(2)
    expect(s.ticketSales.revenue[0].amountMinor).toBe(450000)
    await ingest(order('o1', [line('std', 150000, 1)], 'cancelled'))
    await ingest(order('o1', [line('std', 150000, 5)], 'paid'))
    s = (await gql(tenant('org-a', 'conf-a', 'owner'), SALES)).data
    expect(s.ticketSales).toMatchObject({
      ticketsSold: 0,
      orders: 0,
      revenue: [],
    })
  })

  it('refuses an EventRef bound to another conference, writing nothing', async () => {
    await ingest(order('o1'))
    await expect(
      ingest({ ...order('o2'), orgId: 'org-b', conferenceId: 'conf-b' }),
    ).rejects.toThrow(/another conference/)
    expect(count('ticket_orders')).toBe(1)
  })
})

describe('binding trust', () => {
  it('refuses an unbound EventRef, writing nothing', async () => {
    const input = { ...order('o1'), event: { ...EVENT, externalId: '999' } }
    await expect(ingest(input)).rejects.toThrow(/not bound/)
    expect([count('ticket_events'), count('ticket_orders')]).toEqual([2, 0])
  })

  const BIND = `mutation($e: TicketEventRefInput!) { bindTicketEvent(event: $e) }`
  const op = (org: string, conf: string) =>
    tenant(org, conf, null, { scopes: ['platform:operator'] })

  it('only an operator binds, and never onto another conference', async () => {
    const e = { provider: 'tito', accountId: 'acme', externalId: 'conf' }
    for (const role of ['owner', 'admin'])
      expect(
        (await gql(tenant('org-a', 'conf-a', role), BIND, { e })).errors[0]
          .extensions.code,
      ).toBe('FORBIDDEN')
    expect(count('ticket_events')).toBe(2)
    expect(
      (await gql(op('org-a', 'conf-a'), BIND, { e })).data.bindTicketEvent,
    ).toBe(true)
    expect(
      (await gql(op('org-a', 'conf-a'), BIND, { e })).data.bindTicketEvent,
    ).toBe(true)
    expect(
      (await gql(op('org-b', 'conf-b'), BIND, { e })).errors[0].extensions.code,
    ).toBe('FORBIDDEN')
    expect(count('ticket_events')).toBe(3)
  })
})

describe('order state', () => {
  it('status only moves forward', async () => {
    await ingest(order('o1'))
    await ingest(order('o1', [line('std', 150000, 2)], 'pending'))
    const st = () =>
      (
        sqlite.prepare('SELECT status FROM ticket_orders').get() as {
          status: string
        }
      ).status
    expect(st()).toBe('paid')
    await ingest(order('o1', [line('std', 150000, 2)], 'cancelled'))
    await ingest(order('o1'))
    expect(st()).toBe('cancelled')
  })

  it('a replayed cancelled order leaves ticket types alone', async () => {
    await ingest(order('o1', [line('std', 150000, 2)], 'cancelled'))
    const replay = order('o1', [line('std', 99000, 2)], 'cancelled')
    replay.order.lines[0].ticketType.name = 'Renamed'
    await ingest(replay)
    expect(
      sqlite.prepare('SELECT name, price_minor FROM ticket_types').get(),
    ).toEqual({
      name: 'Type std',
      price_minor: 150000,
    })
  })

  it('an older same-status update is ignored, using the provider updatedAt', async () => {
    const at = (iso: string, n: number) => {
      const i = order('o1', [line('std', 150000, n)])
      i.order.updatedAt = iso
      return i
    }
    await ingest(at('2026-11-02T00:00:00Z', 3))
    await ingest(at('2026-11-01T00:00:00Z', 1))
    const { data } = await gql(tenant('org-a', 'conf-a', 'admin'), SALES)
    expect(data.ticketSales.ticketsSold).toBe(3)
  })
})

describe('Money integrity', () => {
  const bad: [string, (i: IngestInput) => void][] = [
    ['total off by one', (i) => void i.order.total.amountMinor++],
    [
      'float amount',
      (i) => void (i.order.lines[0].ticketType.price.amountMinor = 1.5),
    ],
    ['negative', (i) => void (i.order.total.amountMinor = -1)],
    [
      'line in another currency',
      (i) => void (i.order.lines[0].ticketType.price.currency = 'EUR'),
    ],
    ['lower-case currency', (i) => void (i.order.total.currency = 'nok')],
    ['zero quantity', (i) => void (i.order.lines[0].quantity = 0)],
  ]
  it.each(bad)('refuses %s before writing', async (_, mutate) => {
    const input = order('o1')
    mutate(input)
    await expect(ingest(input)).rejects.toThrow(/invalid order/)
    expect(count('ticket_orders') + count('ticket_types')).toBe(0)
  })

  it('keeps currencies apart in revenue', async () => {
    await ingest(order('o1'))
    const eur = order('o2', [
      {
        ...line('std-eur', 10000, 1),
        ticketType: {
          ...line('std-eur', 10000, 1).ticketType,
          price: { amountMinor: 10000, currency: 'EUR' },
        },
      },
    ])
    eur.order.total.currency = 'EUR'
    await ingest(eur)
    const { data } = await gql(tenant('org-a', 'conf-a', 'admin'), SALES)
    expect(data.ticketSales.revenue).toEqual([
      { amountMinor: 10000, currency: 'EUR' },
      { amountMinor: 300000, currency: 'NOK' },
    ])
  })
})

describe('reads', () => {
  beforeEach(async () => {
    await ingest(order('o1'))
    await ingest({
      ...order('b1', [line('x', 5000, 7)]),
      orgId: 'org-b',
      conferenceId: 'conf-b',
      event: { ...EVENT, externalId: '200' },
    })
    reads.n = 0
  })

  it('sales: counts by type and revenue for owner and admin', async () => {
    for (const role of ['owner', 'admin']) {
      const { data } = await gql(tenant('org-a', 'conf-a', role), SALES)
      expect(data.ticketSales).toEqual({
        ticketsSold: 2,
        orders: 1,
        revenue: [{ amountMinor: 300000, currency: 'NOK' }],
        byType: [
          {
            name: 'Type std',
            sold: 2,
            capacity: 100,
            price: { amountMinor: 150000, currency: 'NOK' },
          },
        ],
      })
    }
  })

  it("another org's orders are invisible", async () => {
    // org-a's admin naming org-b's conference id: no row matches both ids.
    const s = await gql(tenant('org-a', 'conf-b', 'admin'), SALES)
    expect(s.data.ticketSales).toEqual({
      ticketsSold: 0,
      orders: 0,
      revenue: [],
      byType: [],
    })
    const o = await gql(tenant('org-a', 'conf-b', 'admin'), ORDERS)
    expect(o.data.ticketOrders).toEqual([])
    expect(
      (await gql(tenant('org-a', null, 'admin'), ORDERS)).data.ticketOrders,
    ).toBeNull()
    // No conference in the envelope: null, never the org's whole sales.
    expect(
      (await gql(tenant('org-a', null, 'admin'), SALES)).data.ticketSales,
    ).toBeNull()
  })

  it.each([
    ['member', tenant('org-a', 'conf-a', 'member')],
    ['anonymous', tenant('org-a', 'conf-a')],
    [
      'site lane',
      tenant('org-a', 'conf-a', null, {
        scopes: ['site:server'],
        userId: null,
      }),
    ],
  ])('refuses %s with null, before any read', async (_, as) => {
    const s = await gql(as, SALES)
    const o = await gql(as, ORDERS)
    expect([s.errors, o.errors]).toEqual([undefined, undefined])
    expect([s.data.ticketSales, o.data.ticketOrders]).toEqual([null, null])
    expect(reads.n).toBe(0)
  })

  it('buyer list: emails for owner and admin, newest first', async () => {
    const { data } = await gql(tenant('org-a', 'conf-a', 'admin'), ORDERS)
    expect(data.ticketOrders).toEqual([
      {
        externalId: 'o1',
        status: 'paid',
        buyerEmail: 'o1@example.com',
        total: { amountMinor: 300000, currency: 'NOK' },
      },
    ])
  })

  it('a PlatformContext gets no tenant read', async () => {
    const body = await gql(platform, SALES)
    expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
    expect(reads.n).toBe(0)
  })
})

describe('OperatorConferenceStats.ticketsSold', () => {
  const STATS = `query($r: [_Any!]!) { _entities(representations: $r) { ... on OperatorConferenceStats { conferenceId ticketsSold } } }`
  const reps = ['conf-a', 'conf-b', 'conf-none'].map((conferenceId) => ({
    __typename: 'OperatorConferenceStats',
    conferenceId,
  }))

  it('counts non-cancelled tickets per conference for an operator', async () => {
    await ingest(order('o1'))
    await ingest(order('o2', [line('std', 150000, 3)], 'cancelled'))
    await ingest({
      ...order('b1', [line('x', 5000, 7)]),
      orgId: 'org-b',
      conferenceId: 'conf-b',
      event: { ...EVENT, externalId: '200' },
    })
    const { data } = await gql(platform, STATS, { r: reps })
    expect(data._entities).toEqual([
      { conferenceId: 'conf-a', ticketsSold: 2 },
      { conferenceId: 'conf-b', ticketsSold: 7 },
      { conferenceId: 'conf-none', ticketsSold: null },
    ])
  })

  it('is 0 for a bound event with no orders, null without a bound event', async () => {
    const { data } = await gql(platform, STATS, { r: reps })
    expect(data._entities).toEqual([
      { conferenceId: 'conf-a', ticketsSold: 0 },
      { conferenceId: 'conf-b', ticketsSold: 0 },
      { conferenceId: 'conf-none', ticketsSold: null },
    ])
  })

  it('is null for a tenant, with no read', async () => {
    await ingest(order('o1'))
    reads.n = 0
    const { data } = await gql(tenant('org-a', 'conf-a', 'owner'), STATS, {
      r: reps,
    })
    expect(data._entities).toEqual([null, null, null])
    expect(reads.n).toBe(0)
  })
})

describe('seedTicketOrders', () => {
  const SEED = `mutation($e: TicketEventRefInput!, $o: [TicketOrderInput!]!) { seedTicketOrders(event: $e, orders: $o) }`
  const vars = {
    e: { provider: 'demo', accountId: 'demo', externalId: 'kk-2026' },
    o: [
      {
        externalId: 'd1',
        status: 'paid',
        total: { amountMinor: 200000, currency: 'NOK' },
        buyerEmail: 'demo@example.com',
        createdAt: '2026-11-01T10:00:00Z',
        lines: [
          {
            ticketTypeExternalId: 'std',
            ticketTypeName: 'Standard',
            unitPrice: { amountMinor: 100000, currency: 'NOK' },
            quantity: 2,
          },
        ],
      },
    ],
  }
  const demo = { orgKind: 'demo' as const }

  it('writes for a demo org owner, admin or operator, idempotently', async () => {
    for (const as of [
      tenant('org-d', 'conf-d', 'owner', demo),
      tenant('org-d', 'conf-d', 'admin', demo),
      tenant('org-d', 'conf-d', null, {
        ...demo,
        scopes: ['platform:operator'],
      }),
    ])
      expect((await gql(as, SEED, vars)).data.seedTicketOrders).toBe(1)
    expect(count('ticket_orders')).toBe(1)
    const row = sqlite
      .prepare('SELECT org_id, conference_id FROM ticket_orders')
      .get()
    expect(row).toEqual({ org_id: 'org-d', conference_id: 'conf-d' })
  })

  it('refuses a real provider ref, and namespaces the demo ref to the org', async () => {
    const as = tenant('org-d', 'conf-d', 'owner', demo)
    const real = { ...vars, e: { ...EVENT } }
    expect((await gql(as, SEED, real)).errors[0].extensions.code).toBe(
      'FORBIDDEN',
    )
    expect(count('ticket_events')).toBe(2)
    // A demo ref copying a real one's ids is stored under accountId = org.
    const copy = {
      ...vars,
      e: { provider: 'demo', accountId: '1', externalId: '100' },
    }
    expect((await gql(as, SEED, copy)).data.seedTicketOrders).toBe(1)
    expect(
      sqlite
        .prepare(
          "SELECT account_id, org_id FROM ticket_events WHERE provider = 'demo'",
        )
        .all(),
    ).toEqual([{ account_id: 'org-d', org_id: 'org-d' }])
    // The real event's ingest is unaffected.
    await ingest(order('o1'))
    const s = await gql(tenant('org-a', 'conf-a', 'admin'), SALES)
    expect(s.data.ticketSales.ticketsSold).toBe(2)
  })

  it.each([
    [
      'a customer org owner',
      tenant('org-a', 'conf-a', 'owner', { orgKind: 'customer' }),
    ],
    ['an org with no kind', tenant('org-a', 'conf-a', 'owner')],
    [
      'a customer org operator',
      tenant('org-a', 'conf-a', null, { scopes: ['platform:operator'] }),
    ],
    ['a demo org member', tenant('org-d', 'conf-d', 'member', demo)],
    ['a PlatformContext', platform],
  ])('refuses %s, writing nothing', async (_, as) => {
    const body = await gql(as, SEED, vars)
    expect(body.errors[0].extensions.code).toBe('FORBIDDEN')
    expect(count('ticket_events')).toBe(2)
  })
})
