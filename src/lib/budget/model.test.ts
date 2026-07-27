import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DINNER_PARTICIPATION,
  DEFAULT_TICKETING_FEE_RATE,
  DEFAULT_VAT_RATE,
  computeScenario,
  computeScenarios,
  dinnerParticipationRate,
  exVat,
  sponsorIncludedTickets,
  type BudgetModel,
  type BudgetScenario,
} from './model'

/**
 * Golden parity tests against the CloudNativeBergen/budget Python generator.
 *
 * The fixture below is SYNTHETIC: it keeps the reference model's exact
 * structure (ticket types, cost categories, optional-cost flags, scenario
 * shapes) but uses generic placeholder figures — no real vendor quotes or
 * conference projections are embedded here.
 *
 * The expectations were produced by running the reference implementation
 * against these same synthetic inputs: edit budget.py's config section
 * (TICKET_TYPES / SPONSOR_LEVELS / SPONSOR_ADDONS / UNIT_COSTS /
 * FIXED_COSTS / SCENARIOS) in a checkout of CloudNativeBergen/budget to
 * match this fixture (sponsor prices there are incl VAT = priceExVat *
 * 1.25), then run `rtk mise exec -- python budget.py` +
 * `rtk mise exec -- python validate_budget.py --update-snapshot` (Baseline
 * via expected_values.json) and a calc_sections.py-style full-precision dump
 * for the per-scenario values. Both paths must agree before updating the
 * numbers below.
 */

const ticket = (
  key: string,
  name: string,
  priceInclVat: number,
  conf: number,
  ws: number,
  crew: number,
  sponsorIncluded = false,
) => ({
  key,
  name,
  priceInclVat,
  attendsConference: conf === 1,
  attendsWorkshop: ws === 1,
  workshopCrew: crew === 1,
  sponsorIncluded,
})

const referenceModel: BudgetModel = {
  vatRate: DEFAULT_VAT_RATE,
  ticketingFeeRate: DEFAULT_TICKETING_FEE_RATE,
  dinnerParticipation: DEFAULT_DINNER_PARTICIPATION,
  ticketTypes: [
    ticket('conf-eb', 'Conf Only - Early Bird', 2500, 1, 0, 0),
    ticket('conf-std', 'Conf Only - Standard', 3125, 1, 0, 0),
    ticket('conf-lb', 'Conf Only - Late Bird', 3750, 1, 0, 0),
    ticket('ws-eb', 'Conf + Workshop - Early Bird', 5500, 1, 1, 0),
    ticket('ws-std', 'Conf + Workshop - Standard', 5500, 1, 1, 0),
    ticket('ws-lb', 'Conf + Workshop - Late Bird', 6500, 1, 1, 0),
    ticket('student', 'Student (Conf Only)', 1337, 1, 0, 0),
    ticket('sponsor-incl', 'Sponsor Included', 0, 1, 0, 0, true),
    ticket('sponsor-disc', 'Sponsor Discount (20%)', 2500, 1, 0, 0),
    ticket('sponsor-ws', 'Sponsor Workshop Upgrade', 1500, 0, 1, 0),
    ticket('speaker', 'Speaker', 0, 1, 0, 1),
    ticket('organizer', 'Organizer', 0, 1, 0, 1),
    ticket('volunteer', 'Volunteer', 0, 1, 0, 1),
  ],
  sponsorTiers: [
    // 31,250 NOK incl VAT in the source model = 25,000 ex VAT here.
    {
      key: 'community-partner',
      name: 'Community Partner',
      priceExVat: 25000,
      includedTickets: 2,
    },
  ],
  sponsorAddons: [
    // Source-model prices were incl VAT; stored ex VAT here (price / 1.25).
    { key: 'streaming', name: 'Streaming Sponsor', priceExVat: 20000 },
    { key: 'dinner', name: 'Speakers Dinner', priceExVat: 30000 },
    { key: 'lanyard', name: 'Lanyard Sponsor', priceExVat: 25000 },
    { key: 'barista', name: 'Barista Bar', priceExVat: 25000 },
    { key: 'track', name: 'Track Sponsor', priceExVat: 20000 },
    { key: 'afterparty', name: 'The Afterparty', priceExVat: 20000 },
  ],
  variableCosts: [
    {
      key: 'd2-lunch',
      name: 'Day 2 Lunch',
      category: 'catering',
      amountPerPerson: 300,
      basis: 'conference',
    },
    {
      key: 'd2-coffee',
      name: 'Day 2 Coffee/Snacks',
      category: 'catering',
      amountPerPerson: 350,
      basis: 'conference',
    },
    {
      key: 'd2-dinner',
      name: 'Day 2 Dinner',
      category: 'catering',
      amountPerPerson: 600,
      basis: 'dinner',
    },
    {
      key: 'd2-drinks',
      name: 'Day 2 Drinks',
      category: 'catering',
      amountPerPerson: 200,
      basis: 'dinner',
    },
    {
      key: 'd1-lunch',
      name: 'Day 1 Lunch',
      category: 'catering',
      amountPerPerson: 300,
      basis: 'workshop',
    },
    {
      key: 'd1-coffee',
      name: 'Day 1 Coffee/Snacks',
      category: 'catering',
      amountPerPerson: 200,
      basis: 'workshop',
    },
    {
      key: 'badge',
      name: 'Badge & Lanyard',
      category: 'other',
      amountPerPerson: 50,
      basis: 'conference',
    },
    {
      key: 'swag',
      name: 'Swag/Stickers',
      category: 'other',
      amountPerPerson: 50,
      basis: 'conference',
    },
  ],
  fixedCosts: [
    {
      key: 'venue-d2',
      name: 'Venue - Day 2 (incl diverse)',
      category: 'venue',
      amount: 100000,
      optional: false,
    },
    {
      key: 'venue-d1',
      name: 'Venue - Day 1 (incl diverse)',
      category: 'venue',
      amount: 40000,
      optional: false,
    },
    {
      key: 'sound-tech',
      name: 'Teknikere (Sound tech)',
      category: 'venue',
      amount: 25000,
      optional: false,
    },
    {
      key: 'streaming',
      name: 'Streaming/AV Production',
      category: 'production',
      amount: 100000,
      optional: true,
    },
    {
      key: 'photo',
      name: 'Photography',
      category: 'production',
      amount: 50000,
      optional: true,
    },
    {
      key: 'print',
      name: 'Print Materials',
      category: 'marketing',
      amount: 40000,
      optional: false,
    },
    {
      key: 'barista',
      name: 'Barista Bar',
      category: 'catering',
      amount: 15000,
      optional: true,
    },
    {
      key: 'speaker-travel',
      name: 'Speaker Travel Support',
      category: 'speakers',
      amount: 25000,
      optional: false,
    },
    {
      key: 'speaker-dinner',
      name: 'Speaker + Organizer Dinner',
      category: 'speakers',
      amount: 120000,
      optional: false,
    },
    {
      key: 'other-travel',
      name: 'Other Travel',
      category: 'speakers',
      amount: 10000,
      optional: false,
    },
    {
      key: 'speaker-gifts',
      name: 'Speaker Gifts',
      category: 'speakers',
      amount: 10000,
      optional: false,
    },
    {
      key: 'tshirts',
      name: 'Organizer T-shirts',
      category: 'admin',
      amount: 10000,
      optional: false,
    },
    {
      key: 'fiken',
      name: 'Fiken (Accounting)',
      category: 'admin',
      amount: 5000,
      optional: false,
    },
    {
      key: 'meetup',
      name: 'Meetup.com',
      category: 'admin',
      amount: 2000,
      optional: false,
    },
    {
      key: 'hosting',
      name: 'Web hosting',
      category: 'admin',
      amount: 5000,
      optional: false,
    },
    {
      key: 'buffer',
      name: 'Miscellaneous / Buffer',
      category: 'other',
      amount: 5000,
      optional: false,
    },
  ],
  scenarios: [],
}

const ticketKeys = referenceModel.ticketTypes.map((t) => t.key)

const scenario = (
  key: string,
  name: string,
  tickets: number[],
  tiers: number,
  addons: number[],
  cutCostKeys: string[] = [],
): BudgetScenario => ({
  key,
  name,
  ticketCounts: Object.fromEntries(
    ticketKeys.map((ticketKey, i) => [ticketKey, tickets[i]]),
  ),
  tierCounts: { 'community-partner': tiers },
  addonCounts: Object.fromEntries(
    referenceModel.sponsorAddons.map((addon, i) => [addon.key, addons[i]]),
  ),
  cutCostKeys,
})

// Synthetic scenario quantities (sponsor-incl slot is auto-derived, ignored).
const conservative = scenario(
  'conservative',
  'Conservative',
  [20, 60, 10, 10, 30, 5, 5, 0, 50, 10, 40, 10, 10],
  10,
  [0, 1, 0, 0, 0, 1],
  ['streaming', 'photo', 'barista'],
)
const baseline = scenario(
  'baseline',
  'Baseline',
  [25, 75, 15, 15, 40, 10, 5, 0, 60, 15, 45, 10, 15],
  15,
  [0, 1, 0, 0, 1, 1],
)
const target = scenario(
  'target',
  'Target',
  [30, 90, 20, 20, 50, 10, 10, 0, 80, 20, 50, 10, 15],
  20,
  [1, 1, 1, 0, 2, 1],
)
const optimistic = scenario(
  'optimistic',
  'Optimistic',
  [40, 110, 25, 25, 60, 15, 10, 0, 100, 25, 55, 10, 15],
  25,
  [1, 1, 1, 1, 3, 2],
)

describe('budget domain model (ported from CloudNativeBergen/budget)', () => {
  it('matches expected_values.json for the Baseline scenario', () => {
    const r = computeScenario(referenceModel, baseline)
    // Headcounts (Dashboard N5-N8)
    expect(r.headcounts.conference).toBe(345)
    expect(r.headcounts.workshop).toBe(80)
    expect(r.headcounts.crew).toBe(70)
    expect(r.headcounts.totalTickets).toBe(360)
    expect(r.headcounts.sponsorIncludedTickets).toBe(30)
    // Income (Detailed Budget D4-D6)
    expect(r.ticketRevenue).toBeCloseTo(719848.0, 5)
    expect(r.sponsorTierRevenue).toBeCloseTo(375000.0, 5)
    expect(r.sponsorAddonRevenue).toBeCloseTo(70000.0, 5)
    expect(r.totalIncome).toBeCloseTo(1164848.0, 5)
    // Expenses (Detailed Budget D19, D39, D41, D43)
    expect(r.totalVariableExpenses).toBeCloseTo(527041.45, 3)
    expect(r.totalFixedExpenses).toBeCloseTo(562000, 5)
    expect(r.totalExpenses).toBeCloseTo(1089041.45, 3)
    expect(r.netResult).toBeCloseTo(75806.55, 3)
  })

  it.each([
    [
      conservative,
      {
        conference: 270,
        workshop: 55,
        crew: 60,
        dinner: 170,
        ticketRevenue: 539348.0,
        sponsorRevenue: 300000.0,
        totalIncome: 839348.0,
        totalVariableExpenses: 426338.325,
        totalFixedExpenses: 397000,
        netResult: 16009.675,
      },
    ],
    [
      target,
      {
        conference: 425,
        workshop: 100,
        crew: 75,
        dinner: 202,
        ticketRevenue: 899696.0,
        sponsorRevenue: 635000.0,
        totalIncome: 1534696.0,
        totalVariableExpenses: 618457.9,
        totalFixedExpenses: 562000,
        netResult: 354238.1,
      },
    ],
    [
      optimistic,
      {
        conference: 515,
        workshop: 125,
        crew: 80,
        dinner: 206,
        ticketRevenue: 1122696.0,
        sponsorRevenue: 825000.0,
        totalIncome: 1947696.0,
        totalVariableExpenses: 716701.65,
        totalFixedExpenses: 562000,
        netResult: 668994.35,
      },
    ],
  ])('matches the reference implementation for $name', (scen, expected) => {
    const r = computeScenario(referenceModel, scen)
    expect(r.headcounts.conference).toBe(expected.conference)
    expect(r.headcounts.workshop).toBe(expected.workshop)
    expect(r.headcounts.crew).toBe(expected.crew)
    expect(r.headcounts.dinner).toBe(expected.dinner)
    expect(r.ticketRevenue).toBeCloseTo(expected.ticketRevenue, 2)
    expect(r.sponsorRevenue).toBeCloseTo(expected.sponsorRevenue, 2)
    expect(r.totalIncome).toBeCloseTo(expected.totalIncome, 2)
    expect(r.totalVariableExpenses).toBeCloseTo(
      expected.totalVariableExpenses,
      2,
    )
    expect(r.totalFixedExpenses).toBeCloseTo(expected.totalFixedExpenses, 2)
    expect(r.netResult).toBeCloseTo(expected.netResult, 2)
  })

  describe('sponsor-included flag semantics (exactly one sink row)', () => {
    it('applies the derived count to the single flagged row without warnings', () => {
      const r = computeScenario(referenceModel, baseline)
      expect(r.warnings).toEqual([])
      // 15 tiers x 2 included tickets land on the one flagged row only.
      expect(r.headcounts.sponsorIncludedTickets).toBe(30)
      expect(r.headcounts.totalTickets).toBe(360)
    })

    it('warns and excludes the derived count when NO row is flagged', () => {
      const model: BudgetModel = {
        ...referenceModel,
        ticketTypes: referenceModel.ticketTypes.map((t) => ({
          ...t,
          sponsorIncluded: false,
        })),
      }
      const r = computeScenario(model, baseline)
      // The derived quantity is still reported, but no longer lands on any
      // row: the undercount is EXPLICIT, not silent.
      expect(r.headcounts.sponsorIncludedTickets).toBe(30)
      expect(r.headcounts.totalTickets).toBe(330)
      expect(r.headcounts.conference).toBe(315)
      expect(r.warnings).toEqual([
        expect.objectContaining({
          code: 'no-sponsor-included',
          excludedTickets: 30,
        }),
      ])
      expect(r.warnings[0].message).toContain('No ticket type is marked')
    })

    it('does not warn about a missing flag when nothing derives (0 tiers)', () => {
      const model: BudgetModel = {
        ...referenceModel,
        ticketTypes: referenceModel.ticketTypes.map((t) => ({
          ...t,
          sponsorIncluded: false,
        })),
      }
      const noTiers = { ...baseline, tierCounts: {} }
      expect(computeScenario(model, noTiers).warnings).toEqual([])
    })

    it('warns and uses only the FIRST flagged row when several are flagged', () => {
      const model: BudgetModel = {
        ...referenceModel,
        ticketTypes: referenceModel.ticketTypes.map((t) =>
          t.key === 'sponsor-disc' ? { ...t, sponsorIncluded: true } : t,
        ),
      }
      const r = computeScenario(model, baseline)
      // First flagged row ('sponsor-incl') is the sink; the extra flagged
      // row counts 0 (its scenario quantity of 60 is ignored, NOT doubled).
      expect(r.headcounts.sponsorIncludedTickets).toBe(30)
      expect(r.headcounts.totalTickets).toBe(300)
      expect(r.warnings).toEqual([
        expect.objectContaining({
          code: 'multiple-sponsor-included',
          usedTicketTypeName: 'Sponsor Included',
          ignoredTicketTypeNames: ['Sponsor Discount (20%)'],
        }),
      ])
      expect(r.warnings[0].message).toContain('Multiple ticket types')
    })
  })

  it('derives sponsor-included tickets from tier counts', () => {
    expect(
      sponsorIncludedTickets(referenceModel.sponsorTiers, {
        'community-partner': 15,
      }),
    ).toBe(30)
    expect(sponsorIncludedTickets(referenceModel.sponsorTiers, {})).toBe(0)
  })

  it('models dinner participation decay with a floor', () => {
    const m = DEFAULT_DINNER_PARTICIPATION
    expect(dinnerParticipationRate(100, m)).toBeCloseTo(0.8)
    expect(dinnerParticipationRate(400, m)).toBeCloseTo(0.5)
    expect(dinnerParticipationRate(600, m)).toBeCloseTo(0.4) // floor
    expect(dinnerParticipationRate(900, m)).toBeCloseTo(0.4) // floor
  })

  it('reports revenue excl VAT', () => {
    expect(exVat(3125, 0.25)).toBeCloseTo(2500)
    expect(exVat(0, 0.25)).toBe(0)
  })

  it('only cuts optional fixed costs', () => {
    const withBogusCut = {
      ...baseline,
      cutCostKeys: ['venue-d2', 'streaming'],
    }
    const r = computeScenario(referenceModel, withBogusCut)
    const venue = r.expenseLines.find((line) => line.key === 'venue-d2')
    const streaming = r.expenseLines.find((line) => line.key === 'streaming')
    expect(venue?.cut).toBe(false)
    expect(venue?.amount).toBe(100000)
    expect(streaming?.cut).toBe(true)
    expect(streaming?.amount).toBe(0)
  })

  it('treats missing scenario counts as zero and income of 0 as 0 margin', () => {
    const empty: BudgetScenario = {
      key: 'empty',
      name: 'Empty',
      ticketCounts: {},
      tierCounts: {},
      addonCounts: {},
      cutCostKeys: [],
    }
    const model = { ...referenceModel, fixedCosts: [], variableCosts: [] }
    const r = computeScenario(model, empty)
    expect(r.totalIncome).toBe(0)
    expect(r.marginPct).toBe(0)
    expect(r.netResult).toBe(0)
  })

  it('computes all scenarios of a model', () => {
    const model = {
      ...referenceModel,
      scenarios: [conservative, baseline, target, optimistic],
    }
    const results = computeScenarios(model)
    expect(results.map((r) => r.scenarioKey)).toEqual([
      'conservative',
      'baseline',
      'target',
      'optimistic',
    ])
  })
})
