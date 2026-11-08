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
  createdAt: string
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
  createdAt: string
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
  const now = new Date().toISOString()
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
      now,
    )
    .run()
  const ev = await db
    .prepare(
      `SELECT id, org_id, conference_id FROM ticket_events
       WHERE provider = ? AND account_id = ? AND external_id = ?`,
    )
    .bind(event.provider, event.accountId, event.externalId)
    .first<{ id: string; org_id: string; conference_id: string }>()
  if (!ev || ev.org_id !== orgId || ev.conference_id !== conferenceId)
    throw fail('event is bound to another conference', 'FORBIDDEN')

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
        `INSERT INTO ticket_orders (id, org_id, conference_id, event_id, external_id, status, total_minor, currency, buyer_email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (event_id, external_id) DO UPDATE SET
           status = excluded.status, total_minor = excluded.total_minor,
           currency = excluded.currency, buyer_email = excluded.buyer_email,
           updated_at = excluded.updated_at
         WHERE ticket_orders.status != 'cancelled'`,
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
        order.createdAt,
        now,
      ),
    db
      .prepare(
        `DELETE FROM ticket_order_lines WHERE order_id =
           (SELECT id FROM ticket_orders WHERE event_id = ? AND external_id = ? AND status != 'cancelled')`,
      )
      .bind(ev.id, order.externalId),
    ...order.lines.map(({ ticketType: t, quantity }) =>
      db
        .prepare(
          `INSERT INTO ticket_order_lines (order_id, ticket_type_id, org_id, conference_id, quantity, unit_price_minor)
           SELECT o.id, t.id, ?, ?, ?, ? FROM ticket_orders o, ticket_types t
           WHERE o.event_id = ? AND o.external_id = ? AND o.status != 'cancelled'
             AND t.event_id = ? AND t.external_id = ?`,
        )
        .bind(
          ...tenant,
          quantity,
          t.price.amountMinor,
          ev.id,
          order.externalId,
          ev.id,
          t.externalId,
        ),
    ),
  )
  await db.batch(stmts)
  const row = await db
    .prepare(
      'SELECT id FROM ticket_orders WHERE event_id = ? AND external_id = ?',
    )
    .bind(ev.id, order.externalId)
    .first<{ id: string }>()
  return { orderId: row!.id }
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
    const { results } = await rawDb(this.d1)
      .prepare(
        `SELECT id, external_id, status, total_minor, currency, buyer_email, created_at
         FROM ticket_orders WHERE org_id = ? AND conference_id = ?
         ORDER BY created_at DESC, id`,
      )
      .bind(org_id, conference_id)
      .all<Record<string, unknown>>()
    return results.map((r) => ({
      id: r.id as string,
      externalId: r.external_id as string,
      status: r.status as OrderStatus,
      total: {
        amountMinor: r.total_minor as number,
        currency: r.currency as string,
      },
      buyerEmail: (r.buyer_email as string | null) ?? null,
      createdAt: r.created_at as string,
    }))
  }

  /**
   * Sample orders for a demo org only (#2150): an owner or admin of it, or an
   * operator acting for it. A customer org's sales come from its provider,
   * never from here. The tenant comes from the envelope.
   */
  async seed(event: EventRef, orders: OrderInput[]): Promise<number> {
    const p = principalOf(this.tenant)
    if (this.tenant.orgKind !== 'demo' || !can(p, 'conference.update_settings'))
      throw fail(
        'seeding orders requires a demo org owner or admin',
        'FORBIDDEN',
      )
    const { org_id, conference_id } = this.columns
    if (!conference_id) throw fail('no conference in this request', 'NOT_FOUND')
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
          `SELECT l.conference_id AS id, sum(l.quantity) AS n FROM ticket_order_lines l
           JOIN ticket_orders o ON o.id = l.order_id AND o.status != 'cancelled'
           WHERE l.conference_id IN (SELECT value FROM json_each(?))
           GROUP BY l.conference_id`,
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
