#!/usr/bin/env tsx

/**
 * One-off importer: load Cloud Native Days Norway's REAL 2026 budget into the
 * `conferenceBudget` Sanity document.
 *
 * WHAT IT DOES
 *   Transcribes the authoritative 2026 figures from the Python source of truth
 *   (github.com/CloudNativeBergen/budget — budget.py) into a single
 *   `conferenceBudget` document for the 2026 conference edition, then PROVES the
 *   transcription is faithful: it runs the production TypeScript budget model
 *   (src/lib/budget/model.ts) over the constructed document and compares every
 *   scenario's headcounts + ticket revenue + sponsor revenue + total expenses +
 *   net result against the numbers the Python model computes (a subset of which
 *   is frozen in the repo's expected_values.json). If any scenario disagrees
 *   beyond a rounding epsilon the import is considered WRONG: it prints the diff
 *   and exits non-zero WITHOUT writing.
 *
 *   Price conventions (see src/lib/budget/model.ts): ticket prices INCLUDE VAT,
 *   sponsor tier/add-on prices EXCLUDE VAT, costs INCLUDE VAT. The Python source
 *   stores sponsor prices INCL VAT and divides at revenue time; here we store the
 *   ex-VAT value directly (price / 1.25) so the model's `priceExVat * count` is
 *   arithmetically identical.
 *
 * USAGE
 *   rtk pnpm tsx scripts/import-budget-2026.ts        # dry-run (default): prints
 *                                                     # resolved conference, full
 *                                                     # document JSON and the
 *                                                     # parity table. Writes nothing.
 *   rtk pnpm tsx scripts/import-budget-2026.ts --write # after parity PASSES, does a
 *                                                     # createOrReplace of the doc.
 *
 *   --write refuses to run if the model reports any structural warnings; add
 *   --allow-warnings to proceed once they have been reviewed and are expected.
 *
 *   Idempotent: the document _id is deterministic (budgetDocumentId(conferenceId)),
 *   so re-running --write replaces the same document rather than creating duplicates.
 *
 * ENVIRONMENT
 *   Reads NEXT_PUBLIC_SANITY_PROJECT_ID / NEXT_PUBLIC_SANITY_DATASET and a Sanity
 *   token from .env / .env.local. Precedence is shell/CI > .env.local > .env:
 *   explicitly exported variables always win, so a CI job or an operator export
 *   cannot be silently overridden by a stale .env.local (which would risk writing
 *   to the wrong dataset). The resolved projectId/dataset are printed before any
 *   --write for confirmation. Resolving the conference needs read access;
 *   --write needs SANITY_API_TOKEN_WRITE. If no read token is configured you can
 *   still exercise the parity proof by passing the target id explicitly:
 *     CONFERENCE_ID=<id> rtk pnpm tsx scripts/import-budget-2026.ts
 *   (the default path queries Sanity for the id and does NOT need this). With
 *   --write, a CONFERENCE_ID whose conference cannot be read is refused (fail
 *   closed) so a typo'd id can never create a dangling budget document.
 */

// Load env BEFORE importing anything that constructs the Sanity client at module
// load time (client.ts reads process.env eagerly). App modules are pulled in via
// dynamic import() below so they are not hoisted above this config() call.
//
// Precedence: shell/CI (already-set process.env) > .env.local > .env. dotenv never
// overwrites an existing key, so loading .env.local before .env gives .env.local
// priority over .env while both defer to anything the operator/CI exported. We do
// NOT pass override:true — that would let a stale .env.local clobber a deliberate
// shell/CI SANITY_* value and mis-target the write.
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import type {
  BudgetFixedCostItem,
  BudgetScenarioItem,
  BudgetSponsorAddonItem,
  BudgetSponsorTierItem,
  BudgetTicketTypeItem,
  BudgetVariableCostItem,
  ConferenceBudgetDocument,
} from '../src/lib/budget/types'

// ===========================================================================
// REAL 2026 CONFIGURATION — transcribed verbatim from CloudNativeBergen/budget
// budget.py (VAT_RATE, TICKETING_FEE_RATE, DINNER_PARTICIPATION_*, TICKET_TYPES,
// SPONSOR_LEVELS, SPONSOR_ADDONS, UNIT_COSTS, FIXED_COSTS, SCENARIOS). These are
// the conference's real vendor quotes (Kulturhuset Jan 2026) and belong in the
// DATA document, unlike the sanitized placeholder figures in defaults.ts.
// ===========================================================================

const VAT_RATE = 0.25
const TICKETING_FEE_RATE = 0.045
const DINNER_PARTICIPATION = { floor: 0.4, base: 0.9, decay: 1000 }

/** ex-VAT price for a Python figure quoted incl VAT (sponsor prices). */
const exVatPrice = (inclVat: number): number => inclVat / (1 + VAT_RATE)

// Ticket types (budget.py TICKET_TYPES). Order preserved; the "Sponsor Included"
// row carries the sponsorIncluded flag (quantity auto-derived from tier counts).
const ticketTypes: BudgetTicketTypeItem[] = [
  {
    _key: 'conf-early-bird',
    name: 'Conf Only - Early Bird',
    priceInclVat: 2500,
    attendsConference: true,
    attendsWorkshop: false,
    workshopCrew: false,
  },
  {
    _key: 'conf-standard',
    name: 'Conf Only - Standard',
    priceInclVat: 3125,
    attendsConference: true,
    attendsWorkshop: false,
    workshopCrew: false,
  },
  {
    _key: 'conf-late-bird',
    name: 'Conf Only - Late Bird',
    priceInclVat: 3750,
    attendsConference: true,
    attendsWorkshop: false,
    workshopCrew: false,
  },
  {
    _key: 'ws-early-bird',
    name: 'Conf + Workshop - Early Bird',
    priceInclVat: 5500,
    attendsConference: true,
    attendsWorkshop: true,
    workshopCrew: false,
  },
  {
    _key: 'ws-standard',
    name: 'Conf + Workshop - Standard',
    priceInclVat: 5500,
    attendsConference: true,
    attendsWorkshop: true,
    workshopCrew: false,
  },
  {
    _key: 'ws-late-bird',
    name: 'Conf + Workshop - Late Bird',
    priceInclVat: 6500,
    attendsConference: true,
    attendsWorkshop: true,
    workshopCrew: false,
  },
  {
    _key: 'student',
    name: 'Student (Conf Only)',
    priceInclVat: 1337,
    attendsConference: true,
    attendsWorkshop: false,
    workshopCrew: false,
  },
  {
    _key: 'sponsor-included',
    name: 'Sponsor Included',
    priceInclVat: 0,
    attendsConference: true,
    attendsWorkshop: false,
    workshopCrew: false,
    sponsorIncluded: true,
  },
  {
    _key: 'sponsor-discount',
    name: 'Sponsor Discount (20%)',
    priceInclVat: 2500,
    attendsConference: true,
    attendsWorkshop: false,
    workshopCrew: false,
  },
  {
    _key: 'sponsor-ws-upgrade',
    name: 'Sponsor Workshop Upgrade',
    priceInclVat: 1500,
    attendsConference: false,
    attendsWorkshop: true,
    workshopCrew: false,
  },
  {
    _key: 'speaker',
    name: 'Speaker',
    priceInclVat: 0,
    attendsConference: true,
    attendsWorkshop: false,
    workshopCrew: true,
  },
  {
    _key: 'organizer',
    name: 'Organizer',
    priceInclVat: 0,
    attendsConference: true,
    attendsWorkshop: false,
    workshopCrew: true,
  },
  {
    _key: 'volunteer',
    name: 'Volunteer',
    priceInclVat: 0,
    attendsConference: true,
    attendsWorkshop: false,
    workshopCrew: true,
  },
]

// Sponsor tiers (budget.py SPONSOR_LEVELS). Python price 31250 is INCL VAT
// (25,000 ex VAT per the source comment); stored here ex VAT.
const sponsorTierAssumptions: BudgetSponsorTierItem[] = [
  {
    _key: 'community-partner',
    name: 'Community Partner',
    priceExVat: exVatPrice(31250), // 25000
    includedTickets: 2,
  },
]

// Sponsor add-ons (budget.py SPONSOR_ADDONS). Python prices are INCL VAT;
// stored ex VAT so the model's ex-VAT revenue matches the Python computation.
const sponsorAddonAssumptions: BudgetSponsorAddonItem[] = [
  {
    _key: 'streaming',
    name: 'Streaming Sponsor',
    priceExVat: exVatPrice(25000),
  }, // 20000
  {
    _key: 'speakers-dinner',
    name: 'Speakers Dinner',
    priceExVat: exVatPrice(40000),
  }, // 32000
  { _key: 'lanyard', name: 'Lanyard Sponsor', priceExVat: exVatPrice(30000) }, // 24000
  { _key: 'barista', name: 'Barista Bar', priceExVat: exVatPrice(30000) }, // 24000
  { _key: 'track', name: 'Track Sponsor', priceExVat: exVatPrice(25000) }, // 20000
  { _key: 'afterparty', name: 'The Afterparty', priceExVat: exVatPrice(25000) }, // 20000
]

// Per-person variable costs (budget.py UNIT_COSTS). Basis follows how the Python
// calc multiplies each line: Day 2 lunch/coffee + swag by Day-2 headcount
// (conference); dinner/drinks by estimated dinner guests (dinner); Day 1
// lunch/coffee by Day-1 people = workshop attendees + crew (workshop).
const variableCosts: BudgetVariableCostItem[] = [
  {
    _key: 'd2-lunch',
    name: 'Day 2 Lunch',
    category: 'catering',
    amountPerPerson: 295,
    basis: 'conference',
  },
  {
    _key: 'd2-coffee',
    name: 'Day 2 Coffee/Snacks',
    category: 'catering',
    amountPerPerson: 367,
    basis: 'conference',
  },
  {
    _key: 'd2-dinner',
    name: 'Day 2 Dinner',
    category: 'catering',
    amountPerPerson: 649,
    basis: 'dinner',
  },
  {
    _key: 'd2-drinks',
    name: 'Day 2 Drinks',
    category: 'catering',
    amountPerPerson: 250,
    basis: 'dinner',
  },
  {
    _key: 'd1-lunch',
    name: 'Day 1 Lunch',
    category: 'catering',
    amountPerPerson: 295,
    basis: 'workshop',
  },
  {
    _key: 'd1-coffee',
    name: 'Day 1 Coffee/Snacks',
    category: 'catering',
    amountPerPerson: 268,
    basis: 'workshop',
  },
  {
    _key: 'badge',
    name: 'Badge & Lanyard',
    category: 'other',
    amountPerPerson: 60,
    basis: 'conference',
  },
  {
    _key: 'swag',
    name: 'Swag/Stickers',
    category: 'other',
    amountPerPerson: 50,
    basis: 'conference',
  },
]

// Fixed costs (budget.py FIXED_COSTS). `optional` mirrors the Python flag; only
// optional lines may be cut by a scenario.
const fixedCosts: BudgetFixedCostItem[] = [
  {
    _key: 'venue-d2',
    name: 'Venue - Day 2 (incl diverse)',
    category: 'venue',
    amount: 107350,
    optional: false,
  },
  {
    _key: 'venue-d1',
    name: 'Venue - Day 1 (incl diverse)',
    category: 'venue',
    amount: 45150,
    optional: false,
  },
  {
    _key: 'sound-tech',
    name: 'Teknikere (Sound tech)',
    category: 'venue',
    amount: 24375,
    optional: false,
  },
  {
    _key: 'streaming-av',
    name: 'Streaming/AV Production',
    category: 'production',
    amount: 111000,
    optional: true,
  },
  {
    _key: 'photography',
    name: 'Photography',
    category: 'production',
    amount: 62500,
    optional: true,
  },
  {
    _key: 'print',
    name: 'Print Materials',
    category: 'marketing',
    amount: 45000,
    optional: false,
  },
  {
    _key: 'barista-bar',
    name: 'Barista Bar',
    category: 'catering',
    amount: 15000,
    optional: true,
  },
  {
    _key: 'speaker-travel',
    name: 'Speaker Travel Support',
    category: 'speakers',
    amount: 26000,
    optional: false,
  },
  {
    _key: 'speaker-dinner',
    name: 'Speaker + Organizer Dinner',
    category: 'speakers',
    amount: 120000,
    optional: false,
  },
  {
    _key: 'other-travel',
    name: 'Other Travel',
    category: 'speakers',
    amount: 10500,
    optional: false,
  },
  {
    _key: 'speaker-gifts',
    name: 'Speaker Gifts',
    category: 'speakers',
    amount: 10500,
    optional: false,
  },
  {
    _key: 'org-tshirts',
    name: 'Organizer T-shirts',
    category: 'admin',
    amount: 10500,
    optional: false,
  },
  {
    _key: 'accounting',
    name: 'Fiken (Accounting)',
    category: 'admin',
    amount: 3500,
    optional: false,
  },
  {
    _key: 'meetup',
    name: 'Meetup.com',
    category: 'admin',
    amount: 1500,
    optional: false,
  },
  {
    _key: 'hosting',
    name: 'Web hosting',
    category: 'admin',
    amount: 4000,
    optional: false,
  },
  {
    _key: 'buffer',
    name: 'Miscellaneous / Buffer',
    category: 'other',
    amount: 5000,
    optional: false,
  },
]

// Scenario ticket order in budget.py SCENARIOS["…"]["tickets"]. The
// sponsor-included key (index 7) is KEPT here for positional parity with the
// raw `tickets` arrays, but its scenario quantity is filtered out when building
// `ticketCounts` — the model auto-derives that row's count from sponsor tiers
// and ignores any per-scenario quantity for it.
const SCENARIO_TICKET_KEYS = [
  'conf-early-bird',
  'conf-standard',
  'conf-late-bird',
  'ws-early-bird',
  'ws-standard',
  'ws-late-bird',
  'student',
  'sponsor-included',
  'sponsor-discount',
  'sponsor-ws-upgrade',
  'speaker',
  'organizer',
  'volunteer',
] as const

// Scenario add-on order in budget.py SCENARIOS["…"]["sponsor_addons"].
const SCENARIO_ADDON_KEYS = [
  'streaming',
  'speakers-dinner',
  'lanyard',
  'barista',
  'track',
  'afterparty',
] as const

interface RawScenario {
  key: string
  name: string
  description: string
  tickets: number[] // aligned with SCENARIO_TICKET_KEYS
  tiers: number[] // aligned with sponsorTierAssumptions (community-partner)
  addons: number[] // aligned with SCENARIO_ADDON_KEYS
  cutCosts: string[] // fixed-cost _keys cut in this scenario
}

const RAW_SCENARIOS: RawScenario[] = [
  {
    key: 'conservative',
    name: 'Conservative',
    description:
      '~350 attendees, cautious sponsor acquisition, optional costs cut',
    tickets: [20, 70, 15, 12, 35, 8, 4, 0, 60, 12, 40, 10, 12],
    tiers: [12],
    addons: [0, 1, 0, 0, 0, 1],
    cutCosts: ['streaming-av', 'photography', 'barista-bar'],
  },
  {
    key: 'baseline',
    name: 'Baseline',
    description: '~400 attendees (similar to 2025), 15 sponsors, full costs',
    tickets: [25, 90, 20, 15, 45, 10, 5, 0, 75, 15, 45, 10, 15],
    tiers: [15],
    addons: [0, 1, 0, 0, 1, 1],
    cutCosts: [],
  },
  {
    key: 'target',
    name: 'Target',
    description: '~450 attendees (growth target), 20 sponsors, more add-ons',
    tickets: [30, 100, 25, 18, 55, 10, 5, 0, 100, 18, 50, 10, 15],
    tiers: [20],
    addons: [1, 1, 1, 0, 2, 1],
    cutCosts: [],
  },
  {
    key: 'optimistic',
    name: 'Optimistic',
    description: '~500 attendees (stretch goal), 25 sponsors, all add-ons sold',
    tickets: [35, 120, 30, 22, 65, 12, 8, 0, 150, 22, 55, 10, 15],
    tiers: [25],
    addons: [1, 1, 1, 1, 3, 2],
    cutCosts: [],
  },
]

/**
 * Assert a raw scenario's positional arrays line up with the key lists they are
 * mapped against. `raw.tickets[i]` etc. assume exact index alignment; a length or
 * order drift would yield `undefined` quantities/counts that the mapper treats as
 * 0 (parity may still pass) and then fail Sanity validation on --write. Fail loud
 * and early instead, with a message naming the offending scenario and array.
 */
function assertScenarioAlignment(raw: RawScenario): void {
  const checks: Array<{ name: string; got: number; want: number }> = [
    {
      name: 'tickets',
      got: raw.tickets.length,
      want: SCENARIO_TICKET_KEYS.length,
    },
    {
      name: 'tiers',
      got: raw.tiers.length,
      want: sponsorTierAssumptions.length,
    },
    {
      name: 'addons',
      got: raw.addons.length,
      want: SCENARIO_ADDON_KEYS.length,
    },
  ]
  for (const { name, got, want } of checks) {
    if (got !== want) {
      throw new Error(
        `Scenario "${raw.key}": ${name} array has ${got} entries but ${want} ` +
          `are required (must align 1:1 with its key list). Fix the ${name} ` +
          `array so every position maps to a known key.`,
      )
    }
  }
  // Every ticket quantity must be a finite integer — an undefined/NaN slot would
  // otherwise silently become 0 and later fail the Sanity `quantity` requirement.
  raw.tickets.forEach((q, i) => {
    if (!Number.isInteger(q)) {
      throw new Error(
        `Scenario "${raw.key}": tickets[${i}] (${SCENARIO_TICKET_KEYS[i]}) is ` +
          `${q}, expected an integer quantity.`,
      )
    }
  })
}

function buildScenario(raw: RawScenario): BudgetScenarioItem {
  assertScenarioAlignment(raw)

  const ticketCounts = SCENARIO_TICKET_KEYS.map((ticketType, i) => ({
    ticketType,
    quantity: raw.tickets[i],
  }))
    // Drop the sponsor-included row: its quantity is auto-derived from tier
    // counts, and the model ignores any scenario quantity supplied for it.
    .filter((c) => c.ticketType !== 'sponsor-included')
    .map((c) => ({ _key: `tc-${c.ticketType}`, ...c }))

  const tierCounts = sponsorTierAssumptions.map((tier, i) => ({
    _key: `st-${tier._key}`,
    tier: tier._key,
    count: raw.tiers[i] ?? 0,
  }))

  const addonCounts = SCENARIO_ADDON_KEYS.map((addon, i) => ({
    _key: `ad-${addon}`,
    addon,
    count: raw.addons[i] ?? 0,
  })).filter((c) => c.count > 0)

  return {
    _key: raw.key,
    name: raw.name,
    description: raw.description,
    ticketCounts,
    tierCounts,
    addonCounts,
    cutCosts: raw.cutCosts,
  }
}

// ===========================================================================
// AUTHORITATIVE EXPECTED OUTPUTS — computed by the Python model
// (calc_sections.py, same formulas the workbook uses). Baseline exactly
// reproduces the committed expected_values.json snapshot
// (ticketRevenue 824348, sponsorRevenue 447000, totalExpenses 1210731.575,
// netResult 60616.425, day2 385 / ws 85 / crew 70 / total 400).
// ===========================================================================

interface ExpectedScenario {
  conference: number
  workshop: number
  crew: number
  dinner: number
  totalTickets: number
  sponsorIncludedTickets: number
  ticketRevenue: number
  sponsorRevenue: number
  totalExpenses: number
  netResult: number
}

const EXPECTED: Record<string, ExpectedScenario> = {
  conservative: {
    conference: 310,
    workshop: 67,
    crew: 62,
    dinner: 183,
    totalTickets: 322,
    sponsorIncludedTickets: 24,
    ticketRevenue: 647078.4,
    sponsorRevenue: 352000.0,
    totalExpenses: 926237.16,
    netResult: 72841.24,
  },
  baseline: {
    conference: 385,
    workshop: 85,
    crew: 70,
    dinner: 198,
    totalTickets: 400,
    sponsorIncludedTickets: 30,
    ticketRevenue: 824348.0,
    sponsorRevenue: 447000.0,
    totalExpenses: 1210731.575,
    netResult: 60616.425,
  },
  target: {
    conference: 458,
    workshop: 101,
    crew: 75,
    dinner: 202,
    totalTickets: 476,
    sponsorIncludedTickets: 40,
    ticketRevenue: 985148.0,
    sponsorRevenue: 636000.0,
    totalExpenses: 1291551.575,
    netResult: 329596.425,
  },
  optimistic: {
    conference: 572,
    workshop: 121,
    crew: 80,
    dinner: 229,
    totalTickets: 594,
    sponsorIncludedTickets: 50,
    ticketRevenue: 1240156.8,
    sponsorRevenue: 825000.0,
    totalExpenses: 1432251.82,
    netResult: 632904.98,
  },
}

const MONEY_EPSILON = 0.01 // 1 øre; identical IEEE-754 ops match far tighter.

// ===========================================================================
// SCRIPT
// ===========================================================================

interface ResolvedConference {
  _id: string
  title: string
  startDate?: string
  /**
   * True only when the conference was confirmed to exist via a successful Sanity
   * read. False when a CONFERENCE_ID override was supplied but the confirmatory
   * read failed or returned nothing — such an id is safe for the parity proof
   * (dry-run) but must NOT back a --write (see main()).
   */
  resolved: boolean
}

async function resolveConference(): Promise<ResolvedConference> {
  const override = process.env.CONFERENCE_ID
  if (override) {
    const { clientReadUncached } = await import('../src/lib/sanity/client')
    const doc = await clientReadUncached
      .fetch<{ _id: string; title: string; startDate?: string } | null>(
        `*[_type == "conference" && _id == $id][0]{ _id, title, startDate }`,
        { id: override },
      )
      .catch(() => null)
    if (doc) return { ...doc, resolved: true }
    // Read may be unauthorized in this environment (or the id is a typo). Trust
    // the override for the dry-run parity proof, but mark it UNRESOLVED so the
    // write path can fail closed rather than create a dangling budget document.
    return {
      _id: override,
      title: '(unresolved — CONFERENCE_ID override)',
      resolved: false,
    }
  }

  const { clientReadUncached } = await import('../src/lib/sanity/client')
  const editions = await clientReadUncached.fetch<
    { _id: string; title: string; startDate?: string }[]
  >(
    `*[_type == "conference" && organization->slug.current == $org]
       | order(startDate desc){ _id, title, startDate }`,
    { org: 'cloud-native-bergen' },
  )

  if (editions.length === 0) {
    throw new Error(
      "No conference found for organization slug 'cloud-native-bergen'.",
    )
  }

  // Pick the 2026 edition: prefer a startDate in 2026, else a title match.
  const y2026 = editions.filter(
    (e) => e.startDate?.startsWith('2026') || /2026/.test(e.title),
  )
  if (y2026.length === 1) return { ...y2026[0], resolved: true }
  if (y2026.length > 1) {
    throw new Error(
      `Ambiguous 2026 edition — multiple matches:\n${y2026
        .map((e) => `  ${e._id}  ${e.title}  (${e.startDate ?? '?'})`)
        .join('\n')}`,
    )
  }
  throw new Error(
    `No 2026 edition among cloud-native-bergen conferences:\n${editions
      .map((e) => `  ${e._id}  ${e.title}  (${e.startDate ?? '?'})`)
      .join('\n')}`,
  )
}

function buildDocument(
  conferenceId: string,
  documentId: string,
): ConferenceBudgetDocument {
  return {
    _id: documentId,
    _type: 'conferenceBudget',
    conference: {
      _type: 'reference',
      _ref: conferenceId,
    } as ConferenceBudgetDocument['conference'],
    vatRate: VAT_RATE,
    ticketingFeeRate: TICKETING_FEE_RATE,
    dinnerParticipation: { ...DINNER_PARTICIPATION },
    ticketTypes,
    sponsorTierAssumptions,
    sponsorAddonAssumptions,
    variableCosts,
    fixedCosts,
    scenarios: RAW_SCENARIOS.map(buildScenario),
  }
}

interface ParityRow {
  scenario: string
  field: string
  expected: number
  actual: number
  diff: number
  pass: boolean
}

interface ScenarioWarningRow {
  scenario: string
  code: string
  message: string
}

async function runParity(doc: ConferenceBudgetDocument): Promise<{
  rows: ParityRow[]
  warnings: ScenarioWarningRow[]
  allPass: boolean
}> {
  const { budgetDocumentToModel } = await import('../src/lib/budget/mapper')
  const { computeScenario } = await import('../src/lib/budget/model')
  const model = budgetDocumentToModel(doc)

  const rows: ParityRow[] = []
  const warnings: ScenarioWarningRow[] = []
  for (const scenario of model.scenarios) {
    const expected = EXPECTED[scenario.key]
    if (!expected) {
      throw new Error(`No expected values for scenario "${scenario.key}".`)
    }
    const r = computeScenario(model, scenario)
    // The production model flags structural misconfiguration (e.g. no
    // sponsor-included sink for derived sponsor tickets) via `warnings`. A
    // scenario can match every number yet still carry a warning, so collect
    // them and surface prominently — parity numbers alone are not a full proof.
    for (const w of r.warnings) {
      warnings.push({
        scenario: scenario.name,
        code: w.code,
        message: w.message,
      })
    }
    const actual: ExpectedScenario = {
      conference: r.headcounts.conference,
      workshop: r.headcounts.workshop,
      crew: r.headcounts.crew,
      dinner: r.headcounts.dinner,
      totalTickets: r.headcounts.totalTickets,
      sponsorIncludedTickets: r.headcounts.sponsorIncludedTickets,
      ticketRevenue: r.ticketRevenue,
      sponsorRevenue: r.sponsorRevenue,
      totalExpenses: r.totalExpenses,
      netResult: r.netResult,
    }
    const headcountFields = [
      'conference',
      'workshop',
      'crew',
      'dinner',
      'totalTickets',
      'sponsorIncludedTickets',
    ] as const
    for (const field of Object.keys(actual) as (keyof ExpectedScenario)[]) {
      const exp = expected[field]
      const act = actual[field]
      const diff = act - exp
      const isHeadcount = (headcountFields as readonly string[]).includes(field)
      // Headcounts are integers by definition: require EXACT integer equality —
      // no rounding tolerance, so 309.6 can never pass as 310. Only money floats
      // get the small IEEE-754 epsilon.
      const pass = isHeadcount
        ? Number.isInteger(act) && act === exp
        : Math.abs(diff) <= MONEY_EPSILON
      rows.push({
        scenario: scenario.name,
        field,
        expected: exp,
        actual: act,
        diff,
        pass,
      })
    }
  }
  return { rows, warnings, allPass: rows.every((row) => row.pass) }
}

function printScenarioWarnings(warnings: ScenarioWarningRow[]): void {
  if (warnings.length === 0) return
  console.log(
    '\n' +
      '!'.repeat(88) +
      `\nMODEL WARNINGS (${warnings.length}) — the production budget model flags ` +
      `structural\nmisconfiguration in the constructed document. The numbers may ` +
      `still match, but\nthese MUST be reviewed before trusting the import:`,
  )
  for (const w of warnings) {
    console.log(`\n  [${w.scenario}] ${w.code}\n    ${w.message}`)
  }
  console.log('\n' + '!'.repeat(88))
}

function printParityTable(rows: ParityRow[]): void {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3))
  const col = (s: string, w: number) => s.padEnd(w)
  const colR = (s: string, w: number) => s.padStart(w)
  console.log(
    '\n' +
      col('Scenario', 14) +
      col('Field', 24) +
      colR('Expected', 16) +
      colR('Actual', 16) +
      colR('Diff', 12) +
      '  Result',
  )
  console.log('-'.repeat(88))
  let lastScenario = ''
  for (const row of rows) {
    const scen = row.scenario === lastScenario ? '' : row.scenario
    lastScenario = row.scenario
    console.log(
      col(scen, 14) +
        col(row.field, 24) +
        colR(fmt(row.expected), 16) +
        colR(fmt(row.actual), 16) +
        colR(row.diff === 0 ? '0' : row.diff.toFixed(4), 12) +
        (row.pass ? '  PASS' : '  ***FAIL***'),
    )
  }
  console.log('-'.repeat(88))
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  const allowWarnings = process.argv.includes('--allow-warnings')

  const { budgetDocumentId } = await import('../src/lib/budget/sanity')

  console.log('Resolving Cloud Native Days 2026 conference…')
  const conference = await resolveConference()
  const documentId = budgetDocumentId(conference._id)
  console.log(
    `  Conference: ${conference.title}\n` +
      `  _id:        ${conference._id}\n` +
      `  Budget doc: ${documentId}` +
      (conference.startDate ? `\n  Starts:     ${conference.startDate}` : ''),
  )

  const doc = buildDocument(conference._id, documentId)

  console.log('\nConstructed conferenceBudget document:')
  console.log(JSON.stringify(doc, null, 2))

  console.log('\nParity check (production TS model vs Python expected values):')
  const { rows, warnings, allPass } = await runParity(doc)
  printParityTable(rows)
  printScenarioWarnings(warnings)

  if (!allPass) {
    console.error(
      '\nPARITY FAILED — the constructed budget does not reproduce the Python ' +
        'figures. Refusing to write. Fix the transcription and re-run.',
    )
    process.exit(1)
  }
  console.log('\nParity PASS — all four scenarios match the Python model.')

  if (!write) {
    console.log(
      '\nDry-run complete. No changes written. Re-run with --write to commit ' +
        `the document (createOrReplace on ${documentId}).`,
    )
    if (warnings.length > 0) {
      console.log(
        `NOTE: ${warnings.length} model warning(s) above — a --write would be ` +
          'refused until they are resolved (or explicitly acknowledged with ' +
          '--allow-warnings).',
      )
    }
    return
  }

  // --write safety gate 1: never write against a conference we could not confirm
  // exists. A typo'd/unauthorized CONFERENCE_ID is fine for the dry-run proof but
  // would otherwise create a dangling budget document pointing at a bad _ref.
  if (!conference.resolved) {
    console.error(
      '\nRefusing to --write: the conference could not be confirmed to exist ' +
        `(CONFERENCE_ID="${process.env.CONFERENCE_ID ?? ''}" read failed or ` +
        'returned nothing). Configure SANITY_API_TOKEN_READ so the id can be ' +
        'verified, or fix the id. Not writing to an unverified conference.',
    )
    process.exit(1)
  }

  // --write safety gate 2: the model flagged structural misconfiguration. Numbers
  // match, but do not silently write a document the model considers misconfigured
  // unless the operator has seen the warnings and explicitly acknowledged them.
  if (warnings.length > 0 && !allowWarnings) {
    console.error(
      `\nRefusing to --write: the model reported ${warnings.length} warning(s) ` +
        '(shown above). Review them; if they are expected, re-run with ' +
        '--write --allow-warnings to proceed.',
    )
    process.exit(1)
  }

  const { clientWrite } = await import('../src/lib/sanity/client')
  // Print the exact write target for operator confirmation — this is what env
  // precedence actually resolved to, so a mis-targeted dataset is caught by eye
  // before anything is committed.
  const writeConfig = clientWrite.config()
  console.log(
    `\n--write target:\n` +
      `  projectId:  ${writeConfig.projectId ?? '(unset!)'}\n` +
      `  dataset:    ${writeConfig.dataset ?? '(unset!)'}\n` +
      `  document:   ${documentId}` +
      (allowWarnings && warnings.length > 0
        ? `\n  (proceeding past ${warnings.length} acknowledged warning(s))`
        : ''),
  )

  console.log(`\n--write: committing ${documentId}…`)
  try {
    const written = await clientWrite.createOrReplace(
      doc as unknown as Record<string, unknown> & {
        _id: string
        _type: string
      },
    )
    console.log(`Wrote document: ${written._id}`)
  } catch (err) {
    console.error(
      '\nWRITE FAILED:',
      err instanceof Error ? err.message : String(err),
    )
    console.error(
      'The document was NOT written. Check that SANITY_API_TOKEN_WRITE is set ' +
        'and has write access to the dataset.',
    )
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\nImport error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
