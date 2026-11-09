// Public data layer. createData is the ONLY export resolvers see: it returns
// the Scoped repository and the operator-lane batch, never the raw handle.
// `ingestOrder` is for the Ingest entrypoint (src/index.ts) only: the site's
// webhook has resolved the tenant from the provider event before it calls.
import { createGraphQLError } from 'graphql-yoga'
import {
  ScopedRepository,
  can,
  platformBatch,
  principalOf,
  type Envelope,
} from '@runkonf/tenancy'
import { rawDb } from './db'

/** Integer minor units plus an ISO 4217 code. Never a float. */
export interface Money {
  amountMinor: number
  currency: string
}

/** The provider event, as src/lib/tickets/provider/types.ts EventRef. */
export interface EventRef {
  provider: string
  accountId: string
  externalId: string
}

export const ORDER_STATUSES = ['pending', 'paid', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export interface OrderInput {
  externalId: string
  status: OrderStatus
  total: Money
  buyerEmail: string | null
  /** PII, like buyerEmail. */
  buyerName?: string | null
  createdAt: string
  /** The provider's last-change time, if it sends one: orders same-status updates. */
  updatedAt?: string | null
  lines: {
    ticketType: {
      externalId: string
      name: string
      price: Money
      capacity?: number | null
    }
    quantity: number
  }[]
}

export interface IngestInput {
  orgId: string
  conferenceId: string
  event: EventRef
  order: OrderInput
}

export interface TicketSales {
  ticketsSold: number
  orders: number
  /** One entry per currency: amounts in different currencies never add. */
  revenue: Money[]
  byType: {
    id: string
    name: string
    price: Money
    capacity: number | null
    sold: number
  }[]
}

export interface TicketOrder {
  id: string
  externalId: string
  status: OrderStatus
  total: Money
  buyerEmail: string | null
  buyerName: string | null
  createdAt: string
  lines: {
    ticketTypeId: string
    ticketTypeName: string
    quantity: number
    unitPrice: Money
  }[]
}

const fail = (message: string, code: string) =>
  createGraphQLError(message, { extensions: { code } })

const minor = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0
const CURRENCY = /^[A-Z]{3}$/
const nonEmpty = (s: unknown) => typeof s === 'string' && s.trim() !== ''

/**
 * Money integrity, before anything is written: amounts are non-negative safe
 * integers, every line is in the order's currency, and the total is exactly
 * the sum of the lines.
 */
export function validateOrder(input: IngestInput) {
  const bad = (why: string) => fail(`invalid order: ${why}`, 'BAD_USER_INPUT')
  const { event, order } = input
  if (![input.orgId, input.conferenceId].every(nonEmpty))
    throw bad('tenant ids')
  if (![event?.provider, event?.accountId, event?.externalId].every(nonEmpty))
    throw bad('event ref')
  if (!nonEmpty(order?.externalId)) throw bad('externalId')
  if (!ORDER_STATUSES.includes(order.status)) throw bad('status')
  if (Number.isNaN(Date.parse(order.createdAt))) throw bad('createdAt')
  if (order.updatedAt != null && Number.isNaN(Date.parse(order.updatedAt)))
    throw bad('updatedAt')
  const { total } = order
  if (!minor(total?.amountMinor) || !CURRENCY.test(total?.currency))
    throw bad('total')
  if (!Array.isArray(order.lines) || order.lines.length === 0)
    throw bad('no lines')
  let sum = 0
  const seen = new Set<string>()
  for (const { ticketType: t, quantity } of order.lines) {
    if (!nonEmpty(t?.externalId) || !nonEmpty(t.name)) throw bad('ticket type')
    if (seen.has(t.externalId)) throw bad('duplicate ticket type')
    seen.add(t.externalId)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw bad('quantity')
    if (t.capacity != null && !minor(t.capacity)) throw bad('capacity')
    if (!minor(t.price?.amountMinor)) throw bad('price')
    if (t.price.currency !== total.currency) throw bad('currency mismatch')
    sum += t.price.amountMinor * quantity
  }
  if (!Number.isSafeInteger(sum) || sum !== total.amountMinor)
    throw bad('total is not the sum of the lines')
}

/**
 * Upserts one order idempotently on (EventRef, order externalId): a replay
 * changes nothing, a later state overwrites, and a cancelled order stays
 * cancelled. The event row binds the EventRef to one tenant; an EventRef
 * already bound to another conference is refused, so no tenant can write
 * into another's sales. Types, order and lines are one D1 batch.
 */
export async function ingestOrder(
  d1: D1Database,
  input: IngestInput,
): Promise<{ orderId: string }> {
  validateOrder(input)
  const db = rawDb(d1)
  const { orgId, conferenceId, event, order } = input
  const ev = await db
    .prepare(
      `SELECT id, org_id, conference_id FROM ticket_events
       WHERE provider = ? AND account_id = ? AND external_id = ?`,
    )
    .bind(event.provider, event.accountId, event.externalId)
    .first<{ id: string; org_id: string; conference_id: string }>()
  // Only a bound EventRef is ingested (bindEvent): no first-writer binding.
  // The tenant comes from the binding; a payload naming another is refused.
  if (!ev) throw fail('event is not bound to a conference', 'NOT_FOUND')
  if (ev.org_id !== orgId || ev.conference_id !== conferenceId)
    throw fail('event is bound to another conference', 'FORBIDDEN')
  const updatedAt = order.updatedAt ?? new Date().toISOString()
  // Status only moves forward (pending, paid, cancelled); a same-status
  // update applies unless it is older than the stored one. A stale or
  // replayed event writes nothing, ticket types included.
  const prev = await db
    .prepare(
      'SELECT status, updated_at FROM ticket_orders WHERE event_id = ? AND external_id = ?',
    )
    .bind(ev.id, order.externalId)
    .first<{ status: OrderStatus; updated_at: string }>()
  const rank = (st: string) => ORDER_STATUSES.indexOf(st as OrderStatus)
  if (
    prev &&
    (rank(order.status) < rank(prev.status) ||
      (order.status === prev.status &&
        (prev.status === 'cancelled' || updatedAt < prev.updated_at)))
  )
    return (await orderId(db, ev.id, order.externalId))!
  const tenant = [orgId, conferenceId] as const
  const stmts = order.lines.map(({ ticketType: t }) =>
    db
      .prepare(
        `INSERT INTO ticket_types (id, org_id, conference_id, event_id, external_id, name, price_minor, currency, capacity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (event_id, external_id) DO UPDATE SET
           name = excluded.name, price_minor = excluded.price_minor,
           currency = excluded.currency,
           capacity = coalesce(excluded.capacity, ticket_types.capacity)`,
      )
      .bind(
        crypto.randomUUID(),
        ...tenant,
        ev.id,
        t.externalId,
        t.name,
        t.price.amountMinor,
        t.price.currency,
        t.capacity ?? null,
      ),
  )
  stmts.push(
    db
      .prepare(
        `INSERT INTO ticket_orders (id, org_id, conference_id, event_id, external_id, status, total_minor, currency, buyer_email, buyer_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (event_id, external_id) DO UPDATE SET
           status = excluded.status, total_minor = excluded.total_minor,
           currency = excluded.currency, buyer_email = excluded.buyer_email,
           buyer_name = excluded.buyer_name,
           updated_at = excluded.updated_at
         WHERE ${RANK('excluded.status')} > ${RANK('ticket_orders.status')}
           OR (excluded.status = ticket_orders.status AND ticket_orders.status != 'cancelled'
               AND excluded.updated_at >= ticket_orders.updated_at)`,
      )
      .bind(
        crypto.randomUUID(),
        ...tenant,
        ev.id,
        order.externalId,
        order.status,
        order.total.amountMinor,
        order.total.currency,
        order.buyerEmail,
        order.buyerName ?? null,
        order.createdAt,
        updatedAt,
      ),
    db
      .prepare(
        `DELETE FROM ticket_order_lines WHERE order_id =
           (SELECT id FROM ticket_orders WHERE event_id = ? AND external_id = ? AND status = ? AND updated_at = ?)`,
      )
      .bind(ev.id, order.externalId, order.status, updatedAt),
    ...order.lines.map(({ ticketType: t, quantity }) =>
      db
        .prepare(
          `INSERT INTO ticket_order_lines (order_id, ticket_type_id, org_id, conference_id, quantity, unit_price_minor)
           SELECT o.id, t.id, ?, ?, ?, ? FROM ticket_orders o, ticket_types t
           WHERE o.event_id = ? AND o.external_id = ? AND o.status = ? AND o.updated_at = ?
             AND t.event_id = ? AND t.external_id = ?`,
        )
        .bind(
          ...tenant,
          quantity,
          t.price.amountMinor,
          ev.id,
          order.externalId,
          order.status,
          updatedAt,
          ev.id,
          t.externalId,
        ),
    ),
  )
  await db.batch(stmts)
  return (await orderId(db, ev.id, order.externalId))!
}

const RANK = (col: string) =>
  `CASE ${col} WHEN 'pending' THEN 0 WHEN 'paid' THEN 1 ELSE 2 END`

async function orderId(
  db: ReturnType<typeof rawDb>,
  eventId: string,
  externalId: string,
) {
  const row = await db
    .prepare(
      'SELECT id FROM ticket_orders WHERE event_id = ? AND external_id = ?',
    )
    .bind(eventId, externalId)
    .first<{ id: string }>()
  return row ? { orderId: row.id } : null
}

/**
 * The trusted mapping from a provider EventRef to one conference. Only this
 * creates a ticket_events row. Re-binding the same conference is a no-op;
 * an EventRef bound to another conference is refused.
 */
async function bindEventRow(
  d1: D1Database,
  orgId: string,
  conferenceId: string,
  event: EventRef,
) {
  if (![event?.provider, event?.accountId, event?.externalId].every(nonEmpty))
    throw fail('invalid event ref', 'BAD_USER_INPUT')
  const db = rawDb(d1)
  await db
    .prepare(
      `INSERT INTO ticket_events (id, org_id, conference_id, provider, account_id, external_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (provider, account_id, external_id) DO NOTHING`,
    )
    .bind(
      crypto.randomUUID(),
      orgId,
      conferenceId,
      event.provider,
      event.accountId,
      event.externalId,
      new Date().toISOString(),
    )
    .run()
  const ev = await db
    .prepare(
      'SELECT org_id, conference_id FROM ticket_events WHERE provider = ? AND account_id = ? AND external_id = ?',
    )
    .bind(event.provider, event.accountId, event.externalId)
    .first<{ org_id: string; conference_id: string }>()
  if (ev?.org_id !== orgId || ev.conference_id !== conferenceId)
    throw fail('event is bound to another conference', 'FORBIDDEN')
}

class Ticketing extends ScopedRepository {
  constructor(
    private readonly d1: D1Database,
    envelope: Envelope,
  ) {
    super(envelope)
  }

  /**
   * Guard before fetch. A refusal is null, as identity's `members` and
   * `invitations`: it says nothing about what is stored.
   */
  private allowed(action: 'ticketing.read' | 'attendee.read_pii') {
    return can(principalOf(this.tenant), action)
  }

  /** The envelope's conference sales (`ticketing.read`). Cancelled orders do not count. */
  async sales(): Promise<TicketSales | null> {
    const { org_id, conference_id } = this.columns
    if (!this.allowed('ticketing.read') || !conference_id) return null
    const db = rawDb(this.d1)
    const [types, totals] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `SELECT t.id, t.name, t.price_minor, t.currency, t.capacity,
             coalesce((SELECT sum(l.quantity) FROM ticket_order_lines l
               JOIN ticket_orders o ON o.id = l.order_id AND o.status != 'cancelled'
               WHERE l.ticket_type_id = t.id), 0) AS sold
           FROM ticket_types t WHERE t.org_id = ? AND t.conference_id = ?
           ORDER BY t.name, t.id`,
        )
        .bind(org_id, conference_id),
      db
        .prepare(
          `SELECT currency, sum(total_minor) AS amount, count(*) AS n
           FROM ticket_orders WHERE org_id = ? AND conference_id = ? AND status != 'cancelled'
           GROUP BY currency ORDER BY currency`,
        )
        .bind(org_id, conference_id),
    ])
    const byType = (types.results ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      price: {
        amountMinor: r.price_minor as number,
        currency: r.currency as string,
      },
      capacity: (r.capacity as number | null) ?? null,
      sold: r.sold as number,
    }))
    const rows = totals.results ?? []
    return {
      ticketsSold: byType.reduce((n, t) => n + t.sold, 0),
      orders: rows.reduce((n, r) => n + (r.n as number), 0),
      revenue: rows.map((r) => ({
        amountMinor: r.amount as number,
        currency: r.currency as string,
      })),
      byType,
    }
  }

  /** The buyer list: PII, `attendee.read_pii` only; null otherwise. Newest first. */
  async orders(): Promise<TicketOrder[] | null> {
    const { org_id, conference_id } = this.columns
    if (!this.allowed('attendee.read_pii') || !conference_id) return null
    // ponytail: unpaginated; add a cursor when an edition passes a few thousand orders.
    const db = rawDb(this.d1)
    const [orders, lines] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `SELECT id, external_id, status, total_minor, currency, buyer_email, buyer_name, created_at
           FROM ticket_orders WHERE org_id = ? AND conference_id = ?
           ORDER BY created_at DESC, id`,
        )
        .bind(org_id, conference_id),
      db
        .prepare(
          `SELECT l.order_id, t.id, t.name, t.currency, l.quantity, l.unit_price_minor
           FROM ticket_order_lines l JOIN ticket_types t ON t.id = l.ticket_type_id
           WHERE l.org_id = ? AND l.conference_id = ?
           ORDER BY t.name, t.id`,
        )
        .bind(org_id, conference_id),
    ])
    const byOrder = new Map<unknown, Record<string, unknown>[]>()
    for (const l of lines.results ?? [])
      byOrder.set(l.order_id, [...(byOrder.get(l.order_id) ?? []), l])
    return (orders.results ?? []).map((r) => ({
      id: r.id as string,
      externalId: r.external_id as string,
      status: r.status as OrderStatus,
      total: {
        amountMinor: r.total_minor as number,
        currency: r.currency as string,
      },
      buyerEmail: (r.buyer_email as string | null) ?? null,
      buyerName: (r.buyer_name as string | null) ?? null,
      createdAt: r.created_at as string,
      lines: (byOrder.get(r.id) ?? []).map((l) => ({
        ticketTypeId: l.id as string,
        ticketTypeName: l.name as string,
        quantity: l.quantity as number,
        unitPrice: {
          amountMinor: l.unit_price_minor as number,
          currency: l.currency as string,
        },
      })),
    }))
  }

  /**
   * Binds a provider event to the envelope's conference: the trusted mapping
   * Ingest reads. `conference.bind_ticketing` (platform operators, #745):
   * the provider credentials are shared, so an org admin must not claim
   * another org's event.
   */
  async bindEvent(event: EventRef): Promise<boolean> {
    if (!can(principalOf(this.tenant), 'conference.bind_ticketing'))
      throw fail(
        'only a platform operator can bind a ticketing event',
        'FORBIDDEN',
      )
    const { org_id, conference_id } = this.columns
    if (!conference_id) throw fail('no conference in this request', 'NOT_FOUND')
    if (event.provider === 'demo')
      throw fail('demo events are bound by seedTicketOrders', 'BAD_USER_INPUT')
    await bindEventRow(this.d1, org_id, conference_id, event)
    console.log(
      JSON.stringify({
        event: 'operator.write',
        'konf.user_id': this.tenant.userId,
        'konf.org_id': org_id,
        'konf.conference_id': conference_id,
        fields: ['ticket_events'],
      }),
    )
    return true
  }

  /**
   * Sample orders for a demo org only (#2150): an owner or admin of it, or an
   * operator acting for it. A customer org's sales come from its provider,
   * never from here. The tenant comes from the envelope.
   */
  async seed(input: EventRef, orders: OrderInput[]): Promise<number> {
    const p = principalOf(this.tenant)
    if (this.tenant.orgKind !== 'demo' || !can(p, 'conference.update_settings'))
      throw fail(
        'seeding orders requires a demo org owner or admin',
        'FORBIDDEN',
      )
    const { org_id, conference_id } = this.columns
    if (!conference_id) throw fail('no conference in this request', 'NOT_FOUND')
    // Always a `demo` ref namespaced to this org (accountId = orgId): a seed
    // can never bind or write a real provider's event.
    if (input.provider !== 'demo')
      throw fail('seeded events must use provider demo', 'FORBIDDEN')
    const event = {
      provider: 'demo',
      accountId: org_id,
      externalId: input.externalId,
    }
    await bindEventRow(this.d1, org_id, conference_id, event)
    for (const order of orders)
      await ingestOrder(this.d1, {
        orgId: org_id,
        conferenceId: conference_id,
        event,
        order,
      })
    if (p.has('Op'))
      console.log(
        JSON.stringify({
          event: 'operator.write',
          'konf.user_id': this.tenant.userId,
          'konf.org_id': org_id,
          'konf.conference_id': conference_id,
          fields: ['ticket_orders'],
          n: orders.length,
        }),
      )
    return orders.length
  }
}

export function createData(d1: D1Database, envelope: Envelope) {
  // Operator conference stats (#2142): tickets on non-cancelled orders.
  // platformBatch refuses anything but a PlatformContext before the query.
  const ticketsSold = platformBatch<number>(
    envelope,
    'operator conference stats: tickets sold (#2148)',
    async (ids) => {
      const { results } = await rawDb(d1)
        .prepare(
          `SELECT DISTINCT e.conference_id AS id, coalesce((
             SELECT sum(l.quantity) FROM ticket_order_lines l
             JOIN ticket_orders o ON o.id = l.order_id AND o.status != 'cancelled'
             WHERE l.conference_id = e.conference_id), 0) AS n
           FROM ticket_events e
           WHERE e.conference_id IN (SELECT value FROM json_each(?))`,
        )
        .bind(JSON.stringify(ids))
        .all<{ id: string; n: number }>()
      return new Map(results.map((r) => [r.id, r.n]))
    },
  )
  // Built on first use: the constructor refuses a PlatformContext, and that
  // should fail the resolver, not the whole request.
  let ticketing: Ticketing | undefined
  return {
    ticketsSold,
    ticketing: () => (ticketing ??= new Ticketing(d1, envelope)),
  }
}
