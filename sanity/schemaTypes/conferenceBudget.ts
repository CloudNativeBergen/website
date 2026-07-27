import { defineField, defineType } from 'sanity'

import {
  EXPENSE_CATEGORY_LABELS,
  VARIABLE_COST_BASIS_LABELS,
} from '../../src/lib/budget/model'

/**
 * Per-conference budget document (budget module M1, ported from the
 * CloudNativeBergen/budget Python generator).
 *
 * Holds the PLANNING side of conference finances: ticket-mix assumptions,
 * sponsor tier/add-on assumptions, per-person variable costs, fixed costs
 * with optional-cost flags, and named scenarios (Conservative / Baseline /
 * Target / Optimistic). The ACTUAL income side is derived live from the
 * sponsor pipeline (closed-won deals) and the ticketing provider - it is
 * deliberately NOT stored here. Manually-entered actuals (ticket counts when
 * no ticketing provider is configured, expense actuals) live on the
 * respective line items.
 *
 * Price conventions (see src/lib/budget/model.ts):
 * - ticket prices INCLUDE VAT (consumer-facing price),
 * - sponsor tier/add-on prices EXCLUDE VAT (sponsor CRM convention),
 * - costs INCLUDE VAT (what the org pays).
 *
 * Scenario line items cross-reference assumption rows by their `_key`.
 */

const EXPENSE_CATEGORY_LIST = Object.entries(EXPENSE_CATEGORY_LABELS).map(
  ([value, title]) => ({ title, value }),
)

const BASIS_LIST = Object.entries(VARIABLE_COST_BASIS_LABELS).map(
  ([value, title]) => ({ title, value }),
)

/**
 * Array-level uniqueness of a reference field inside scenario count rows:
 * duplicate refs would collapse in the computation model (the mapper keeps
 * the first entry), so Studio edits must not create them.
 */
const uniqueRefValidation =
  (field: string, label: string) =>
  (items: Record<string, unknown>[] | undefined) => {
    const refs = (items ?? []).map((item) => item?.[field])
    const seen = new Set<unknown>()
    for (const ref of refs) {
      if (ref == null) continue
      if (seen.has(ref)) {
        return `Each ${label} can only be referenced once per scenario (duplicate: "${ref}").`
      }
      seen.add(ref)
    }
    return true
  }

export default defineType({
  name: 'conferenceBudget',
  title: 'Conference Budget',
  type: 'document',
  fields: [
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      description: 'The conference edition this budget belongs to.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'vatRate',
      title: 'VAT rate',
      type: 'number',
      description:
        'VAT rate applied to ticket prices (0.25 = 25%, Norwegian standard rate).',
      initialValue: 0.25,
      validation: (Rule) => Rule.required().min(0).max(1),
    }),
    defineField({
      name: 'ticketingFeeRate',
      title: 'Ticketing platform fee rate',
      type: 'number',
      description:
        'Platform fee as a fraction of gross ticket revenue (0.045 = 4.5%, Checkin non-profit rate).',
      initialValue: 0.045,
      validation: (Rule) => Rule.required().min(0).max(1),
    }),
    defineField({
      name: 'dinnerParticipation',
      title: 'Dinner participation model',
      type: 'object',
      description:
        'Estimated dinner attendance: rate = max(floor, base - attendees / decay).',
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({
          name: 'floor',
          title: 'Floor rate',
          type: 'number',
          initialValue: 0.4,
          validation: (Rule) => Rule.required().min(0).max(1),
        }),
        defineField({
          name: 'base',
          title: 'Base rate',
          type: 'number',
          initialValue: 0.9,
          validation: (Rule) => Rule.required().min(0).max(1),
        }),
        defineField({
          name: 'decay',
          title: 'Decay (attendees)',
          type: 'number',
          initialValue: 1000,
          validation: (Rule) => Rule.required().min(1),
        }),
      ],
    }),
    defineField({
      name: 'ticketTypes',
      title: 'Ticket types',
      type: 'array',
      description:
        'Ticket-mix assumptions. Attendance flags drive per-person variable costs. "Actual sold" is the manual fallback when no ticketing provider is connected.',
      // Cross-row invariant (mirrors the tRPC UpdateTicketTypesSchema
      // refinement so Studio edits cannot bypass it): the derived
      // sponsor-included quantity has exactly one sink row — multiple
      // flagged rows would double-count sponsor tickets in projections.
      validation: (Rule) =>
        Rule.custom((items?: { sponsorIncluded?: boolean }[]) =>
          (items ?? []).filter((item) => item?.sponsorIncluded).length > 1
            ? 'At most one ticket type can be marked "Sponsor-included tickets" — its quantity is auto-derived from sponsor tier counts, and multiple rows would double-count those tickets.'
            : true,
        ),
      of: [
        {
          type: 'object',
          options: { collapsible: true, collapsed: true },
          validation: (Rule) =>
            Rule.custom(
              (item?: { attendsWorkshop?: boolean; workshopCrew?: boolean }) =>
                item?.attendsWorkshop && item?.workshopCrew
                  ? 'A ticket type is either a workshop attendee or workshop-day crew, not both (it would be double-counted in workshop-day costs).'
                  : true,
            ),
          fields: [
            defineField({
              name: 'name',
              title: 'Name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'priceInclVat',
              title: 'Price (NOK, incl VAT)',
              type: 'number',
              validation: (Rule) => Rule.required().min(0),
            }),
            defineField({
              name: 'attendsConference',
              title: 'Attends conference day',
              type: 'boolean',
              initialValue: true,
            }),
            defineField({
              name: 'attendsWorkshop',
              title: 'Attends workshop day',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'workshopCrew',
              title: 'Workshop-day crew (setup/support)',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'sponsorIncluded',
              title: 'Sponsor-included tickets (auto quantity)',
              type: 'boolean',
              description:
                'Quantity is derived from sponsor tier counts x included tickets; scenario quantities are ignored.',
              initialValue: false,
            }),
            defineField({
              name: 'actualCount',
              title: 'Actual sold (manual)',
              type: 'number',
              description:
                'Manually-entered sold count; used only when no ticketing provider is connected.',
              validation: (Rule) => Rule.min(0),
            }),
          ],
          preview: {
            select: { title: 'name', price: 'priceInclVat' },
            prepare({ title, price }) {
              return { title, subtitle: `${price ?? 0} kr incl VAT` }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'sponsorTierAssumptions',
      title: 'Sponsor tier assumptions',
      type: 'array',
      description:
        'Planning assumptions for sponsor tiers (prices ex VAT). Actual sponsor income is derived from the sponsor CRM pipeline, not from these rows.',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'name',
              title: 'Name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'priceExVat',
              title: 'Price (NOK, ex VAT)',
              type: 'number',
              validation: (Rule) => Rule.required().min(0),
            }),
            defineField({
              name: 'includedTickets',
              title: 'Included tickets',
              type: 'number',
              initialValue: 0,
              validation: (Rule) => Rule.required().min(0),
            }),
          ],
          preview: {
            select: { title: 'name', price: 'priceExVat' },
            prepare({ title, price }) {
              return { title, subtitle: `${price ?? 0} kr ex VAT` }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'sponsorAddonAssumptions',
      title: 'Sponsor add-on assumptions',
      type: 'array',
      description:
        'Planning assumptions for a la carte sponsor add-ons (prices ex VAT).',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'name',
              title: 'Name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'priceExVat',
              title: 'Price (NOK, ex VAT)',
              type: 'number',
              validation: (Rule) => Rule.required().min(0),
            }),
          ],
          preview: {
            select: { title: 'name', price: 'priceExVat' },
            prepare({ title, price }) {
              return { title, subtitle: `${price ?? 0} kr ex VAT` }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'variableCosts',
      title: 'Variable costs (per person)',
      type: 'array',
      description:
        'Per-person costs (NOK incl VAT) multiplied by the headcount of their basis.',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'name',
              title: 'Name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'category',
              title: 'Category',
              type: 'string',
              options: { list: EXPENSE_CATEGORY_LIST },
              initialValue: 'catering',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'amountPerPerson',
              title: 'Amount per person (NOK, incl VAT)',
              type: 'number',
              validation: (Rule) => Rule.required().min(0),
            }),
            defineField({
              name: 'basis',
              title: 'Headcount basis',
              type: 'string',
              options: { list: BASIS_LIST },
              initialValue: 'conference',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'actualAmount',
              title: 'Actual total (NOK, manual)',
              type: 'number',
              description: 'Actual total spent on this line, once known.',
              validation: (Rule) => Rule.min(0),
            }),
          ],
          preview: {
            select: {
              title: 'name',
              amount: 'amountPerPerson',
              basis: 'basis',
            },
            prepare({ title, amount, basis }) {
              return { title, subtitle: `${amount ?? 0} kr/person (${basis})` }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'fixedCosts',
      title: 'Fixed costs',
      type: 'array',
      description:
        'Fixed expense lines (NOK incl VAT). Optional costs can be cut in tight scenarios.',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'name',
              title: 'Name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'category',
              title: 'Category',
              type: 'string',
              options: { list: EXPENSE_CATEGORY_LIST },
              initialValue: 'other',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'amount',
              title: 'Amount (NOK, incl VAT)',
              type: 'number',
              validation: (Rule) => Rule.required().min(0),
            }),
            defineField({
              name: 'optional',
              title: 'Optional (can be cut in tight scenarios)',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'actualAmount',
              title: 'Actual total (NOK, manual)',
              type: 'number',
              description: 'Actual total spent on this line, once known.',
              validation: (Rule) => Rule.min(0),
            }),
          ],
          preview: {
            select: { title: 'name', amount: 'amount', optional: 'optional' },
            prepare({ title, amount, optional }) {
              return {
                title,
                subtitle: `${amount ?? 0} kr${optional ? ' (optional)' : ''}`,
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'scenarios',
      title: 'Scenarios',
      type: 'array',
      description:
        'Named projections (e.g. Conservative / Baseline / Target / Optimistic). Line items reference assumption rows by their _key.',
      of: [
        {
          type: 'object',
          options: { collapsible: true, collapsed: true },
          fields: [
            defineField({
              name: 'name',
              title: 'Name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'description',
              title: 'Description',
              type: 'string',
            }),
            defineField({
              name: 'ticketCounts',
              title: 'Ticket quantities',
              type: 'array',
              validation: (Rule) =>
                Rule.custom(uniqueRefValidation('ticketType', 'ticket type')),
              of: [
                {
                  type: 'object',
                  fields: [
                    defineField({
                      name: 'ticketType',
                      title: 'Ticket type (_key)',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    }),
                    defineField({
                      name: 'quantity',
                      title: 'Quantity',
                      type: 'number',
                      initialValue: 0,
                      validation: (Rule) => Rule.required().min(0),
                    }),
                  ],
                  preview: {
                    select: { title: 'ticketType', qty: 'quantity' },
                    prepare({ title, qty }) {
                      return { title, subtitle: `${qty ?? 0}` }
                    },
                  },
                },
              ],
            }),
            defineField({
              name: 'tierCounts',
              title: 'Sponsor tier counts',
              type: 'array',
              validation: (Rule) =>
                Rule.custom(uniqueRefValidation('tier', 'sponsor tier')),
              of: [
                {
                  type: 'object',
                  fields: [
                    defineField({
                      name: 'tier',
                      title: 'Tier (_key)',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    }),
                    defineField({
                      name: 'count',
                      title: 'Count',
                      type: 'number',
                      initialValue: 0,
                      validation: (Rule) => Rule.required().min(0),
                    }),
                  ],
                  preview: {
                    select: { title: 'tier', qty: 'count' },
                    prepare({ title, qty }) {
                      return { title, subtitle: `${qty ?? 0}` }
                    },
                  },
                },
              ],
            }),
            defineField({
              name: 'addonCounts',
              title: 'Sponsor add-on counts',
              type: 'array',
              validation: (Rule) =>
                Rule.custom(uniqueRefValidation('addon', 'add-on')),
              of: [
                {
                  type: 'object',
                  fields: [
                    defineField({
                      name: 'addon',
                      title: 'Add-on (_key)',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    }),
                    defineField({
                      name: 'count',
                      title: 'Count',
                      type: 'number',
                      initialValue: 0,
                      validation: (Rule) => Rule.required().min(0),
                    }),
                  ],
                  preview: {
                    select: { title: 'addon', qty: 'count' },
                    prepare({ title, qty }) {
                      return { title, subtitle: `${qty ?? 0}` }
                    },
                  },
                },
              ],
            }),
            defineField({
              name: 'cutCosts',
              title: 'Cut optional costs (_keys)',
              type: 'array',
              of: [{ type: 'string' }],
              description:
                'Fixed-cost _keys cut in this scenario (only optional costs are honoured).',
            }),
          ],
          preview: {
            select: { title: 'name', subtitle: 'description' },
          },
        },
      ],
    }),
  ],
  preview: {
    select: { conference: 'conference.title' },
    prepare({ conference }) {
      return {
        title: `Budget: ${conference ?? 'Unassigned'}`,
      }
    },
  },
})
