// ticketing (#2148): sales and buyers of the envelope's conference, read from
// D1. No argument picks the tenant: it comes from the envelope only. Gates are
// `can()` rows (docs/AUTHORIZATION.md §4): `ticketing.read` for the sales
// summary, `attendee.read_pii` for the buyer list.
import { builder } from './builder'
import {
  ORDER_STATUSES,
  type Money as MoneyValue,
  type TicketOrder as TicketOrderValue,
  type TicketSales as TicketSalesValue,
} from './data'

const Money = builder.objectRef<MoneyValue>('TicketMoney').implement({
  description:
    'An amount in integer minor units (øre, cents) and its currency.',
  fields: (t) => ({
    amountMinor: t.exposeInt('amountMinor'),
    currency: t.exposeString('currency', { description: 'ISO 4217.' }),
  }),
})

const OrderStatus = builder.enumType('TicketOrderStatus', {
  values: ORDER_STATUSES,
})

const TypeSales = builder
  .objectRef<TicketSalesValue['byType'][number]>('TicketTypeSales')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      name: t.exposeString('name'),
      price: t.field({ type: Money, resolve: (r) => r.price }),
      capacity: t.exposeInt('capacity', { nullable: true }),
      sold: t.exposeInt('sold', {
        description: 'Tickets on non-cancelled orders.',
      }),
    }),
  })

const TicketSales = builder
  .objectRef<TicketSalesValue>('TicketSales')
  .implement({
    fields: (t) => ({
      ticketsSold: t.exposeInt('ticketsSold'),
      orders: t.exposeInt('orders'),
      revenue: t.field({
        type: [Money],
        description:
          'Totals of non-cancelled orders, one per currency (never added across currencies).',
        resolve: (r) => r.revenue,
      }),
      byType: t.field({ type: [TypeSales], resolve: (r) => r.byType }),
    }),
  })

const TicketOrder = builder
  .objectRef<TicketOrderValue>('TicketOrder')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      externalId: t.exposeString('externalId'),
      status: t.field({ type: OrderStatus, resolve: (o) => o.status }),
      total: t.field({ type: Money, resolve: (o) => o.total }),
      buyerEmail: t.exposeString('buyerEmail', {
        nullable: true,
        description: 'PII.',
      }),
      createdAt: t.exposeString('createdAt'),
    }),
  })

const MoneyInput = builder.inputType('TicketMoneyInput', {
  fields: (t) => ({
    amountMinor: t.int({ required: true }),
    currency: t.string({ required: true }),
  }),
})

const EventRefInput = builder.inputType('TicketEventRefInput', {
  fields: (t) => ({
    provider: t.string({ required: true }),
    accountId: t.string({ required: true }),
    externalId: t.string({ required: true }),
  }),
})

const LineInput = builder.inputType('TicketOrderLineInput', {
  fields: (t) => ({
    ticketTypeExternalId: t.string({ required: true }),
    ticketTypeName: t.string({ required: true }),
    unitPrice: t.field({ type: MoneyInput, required: true }),
    capacity: t.int(),
    quantity: t.int({ required: true }),
  }),
})

const OrderInput = builder.inputType('TicketOrderInput', {
  fields: (t) => ({
    externalId: t.string({ required: true }),
    status: t.field({ type: OrderStatus, required: true }),
    total: t.field({ type: MoneyInput, required: true }),
    buyerEmail: t.string(),
    createdAt: t.string({ required: true }),
    updatedAt: t.string(),
    lines: t.field({ type: [LineInput], required: true }),
  }),
})

// Operator conference stats (#2142): this subgraph's count on the entity
// tenant-directory's operator `conferences` list returns. Guard before fetch:
// only a PlatformContext resolves the reference.
const OperatorConferenceStats = builder
  .objectRef<{ conferenceId: string }>('OperatorConferenceStats')
  .implement({
    fields: (t) => ({
      conferenceId: t.exposeID('conferenceId'),
      ticketsSold: t.int({
        tag: 'operator',
        description:
          'Tickets on non-cancelled orders, from the ticketing subgraph (#2148). Null when the conference has no ticket event bound; 0 when one is bound and has no orders.',
        resolve: async ({ conferenceId }, _, ctx) =>
          (await ctx.data.ticketsSold(conferenceId)) ?? null,
      }),
    }),
  })
builder.asEntity(OperatorConferenceStats, {
  key: builder.selection<{ conferenceId: string }>('conferenceId'),
  resolveReference: (ref, ctx) =>
    ctx.envelope?.typ === 'platform' ? ref : null,
})

builder.queryType({
  fields: (t) => ({
    ticketSales: t.field({
      type: TicketSales,
      nullable: true,
      description:
        "The envelope conference's ticket sales: counts by type and revenue. Owners, admins and operators (ticketing.read); null otherwise.",
      resolve: (_, __, ctx) => ctx.data.ticketing().sales(),
    }),
    ticketOrders: t.field({
      type: [TicketOrder],
      nullable: true,
      description:
        "The envelope conference's orders with buyer email, newest first. Owners, admins and operators (attendee.read_pii); null otherwise.",
      resolve: (_, __, ctx) => ctx.data.ticketing().orders(),
    }),
  }),
})

builder.mutationType({
  fields: (t) => ({
    bindTicketEvent: t.boolean({
      description:
        "Binds a provider event to the envelope's conference, the mapping ticket ingest trusts. Platform operators only (conference.bind_ticketing).",
      args: { event: t.arg({ type: EventRefInput, required: true }) },
      resolve: (_, { event }, ctx) => ctx.data.ticketing().bindEvent(event),
    }),
    seedTicketOrders: t.int({
      description:
        'Writes sample orders for a demo org (orgKind demo, owner or admin, or an operator for it). The event must have provider `demo`; its accountId is always the org id. Idempotent per order externalId. Returns the number of orders.',
      args: {
        event: t.arg({ type: EventRefInput, required: true }),
        orders: t.arg({ type: [OrderInput], required: true }),
      },
      resolve: (_, { event, orders }, ctx) =>
        ctx.data.ticketing().seed(
          event,
          orders.map((o) => ({
            externalId: o.externalId,
            status: o.status,
            total: o.total,
            buyerEmail: o.buyerEmail ?? null,
            createdAt: o.createdAt,
            updatedAt: o.updatedAt ?? null,
            lines: o.lines.map((l) => ({
              quantity: l.quantity,
              ticketType: {
                externalId: l.ticketTypeExternalId,
                name: l.ticketTypeName,
                price: l.unitPrice,
                capacity: l.capacity ?? null,
              },
            })),
          })),
        ),
    }),
  }),
})

export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.9',
  federationDirectives: ['@key', '@tag'],
})
