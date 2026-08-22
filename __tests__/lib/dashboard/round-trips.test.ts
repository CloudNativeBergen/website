/**
 * SANITY ROUND-TRIPS PER DASHBOARD PAGEVIEW — the measurement, not a claim that
 * things "feel faster".
 *
 * The admin dashboard is the single largest per-pageview cost against this
 * project's Sanity API quota: it used to paint itself with one server action per
 * widget, and each action re-ran the authorization gate, re-resolved the
 * conference and issued its own 1-3 queries.
 *
 * HOW IT COUNTS. Two counters, because the two costs behave differently in
 * production:
 *
 *  - `dataQueries` — every `fetch` that reaches a Sanity client. `next-sanity`
 *    is aliased suite-wide to `__tests__/mocks/sanity-client.ts`, whose
 *    `createClient` returns a client with a `vi.fn()` `fetch`, so the three
 *    clients in `src/lib/sanity/client.ts` ARE spies at the real network
 *    boundary. Nothing between the action and the wire is stubbed, so no
 *    per-module mock can hide a query from the tally. The two library functions
 *    that must be mocked because they carry `'use cache'`/`cacheLife` (which
 *    throws outside a Next build) push a marker into the same list, so their
 *    round-trip is still counted.
 *
 *  - `conferenceResolutions` — calls to `getConferenceForCurrentDomain`. This
 *    read is `'use cache'`d for hours in production, so N calls do NOT mean N
 *    reads; counting it in `dataQueries` would flatter or punish either side
 *    unfairly. It is still worth pinning at 1: each distinct options object is a
 *    distinct cache entry, and the old code asked for two of them.
 *
 * MEASURED with this harness, run unchanged against the pre-refactor tree
 * (`git show HEAD:.../actions.ts` restored beside the new one) and then against
 * this one:
 *
 *                              data queries   conference resolutions
 *   planning preset (7 widgets, the default)
 *                    BEFORE          9                  7
 *                    AFTER           2                  1
 *   all 13 widgets   BEFORE         17                 13
 *                    AFTER           5                  1
 *
 * The numbers below are a RATCHET on the "after" side.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Mock } from 'vitest'

/** Everything that costs a Sanity round-trip, in call order. */
const roundTrips: string[] = []
const conferenceResolutionOptions: unknown[] = []

const CONFERENCE_DOC = {
  _id: 'conf-1',
  title: 'Test Conference',
  domains: ['test.example.com'],
  organization: { _ref: 'org-test' },
  teams: [],
  startDate: '2099-06-01',
  endDate: '2099-06-02',
  cfpStartDate: '2099-01-01',
  cfpEndDate: '2099-03-01',
  cfpNotifyDate: '2099-04-01',
  programDate: '2099-05-01',
  checkinCustomerId: 1,
  checkinEventId: 2,
  schedules: [],
}

vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => ({
    speaker: {
      _id: 'speaker-1',
      isOrganizer: true,
      organizerOrgIds: ['org-test'],
    },
  }),
  AppEnvironment: {},
}))

vi.mock('@/lib/organization/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOrganizationRefForCurrentConference: async () => 'org-test',
  getOrganizationById: async () => null,
}))

// `getConferenceForCurrentDomain` is `'use cache'` + `cacheLife('hours')`, which
// throws outside a Next build — so it is mocked, and its calls are counted
// separately (see the header).
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async (options: unknown = {}) => {
    conferenceResolutionOptions.push(options)
    return {
      conference: { ...CONFERENCE_DOC },
      domain: 'test.example.com',
      error: null,
      status: 'resolved',
    }
  },
}))

// Same reason: `getSpeakers` carries `'use cache'`. It IS one round-trip on a
// cache miss, so it records one.
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: async () => {
    roundTrips.push('[getSpeakers]')
    return { speakers: [], err: null }
  },
}))

// Keep the ticketing widget off the network; the only reads it can still
// contribute are Sanity reads, which is what we are counting.
vi.mock('@/lib/tickets/provider', () => ({
  conferenceProviderType: () => 'checkin',
  resolveTicketingProvider: () => ({
    configured: true,
    provider: { fetchEventTickets: async () => [] },
    eventRef: { customerId: 1, eventId: 2 },
  }),
}))

import {
  clientReadCached,
  clientReadUncached,
  clientWrite,
} from '@/lib/sanity/client'
import { fetchDashboardData } from '@/app/(admin)/admin/actions'
import { PRESET_CONFIGS } from '@/lib/dashboard/presets'
import type { DashboardWidgetKey } from '@/lib/dashboard/widget-data'

/**
 * Minimal but shape-correct responses. The point is the CALL COUNT, so every
 * root answers empty — an empty dashboard issues exactly the queries a full one
 * does.
 */
function respond(query: string): unknown {
  // The composed dashboard query is an object projection, so an object back.
  if (query.trimStart().startsWith('{')) return {}
  return []
}

function install(client: { fetch: unknown }): void {
  ;(client.fetch as Mock).mockImplementation(async (query: string) => {
    roundTrips.push(query)
    return respond(query)
  })
}

/** The default dashboard: the `planning` preset, what a new organizer sees. */
const PLANNING_WIDGETS = PRESET_CONFIGS.planning.widgets.map(
  (w) => w.type,
) as DashboardWidgetKey[]

const composedQueries = () =>
  roundTrips.filter((q) => q.trimStart().startsWith('{'))

beforeEach(() => {
  roundTrips.length = 0
  conferenceResolutionOptions.length = 0
  install(clientReadCached)
  install(clientReadUncached)
  install(clientWrite)
})

describe('dashboard Sanity round-trips', () => {
  it('is the 7-widget planning preset the numbers are about', () => {
    // Pin the widget set, so a preset change cannot silently move the goalposts.
    expect(PLANNING_WIDGETS).toEqual([
      'quick-actions',
      'sponsor-pipeline',
      'upcoming-deadlines',
      'cfp-health',
      'recent-activity',
      'ticket-sales',
      'speaker-engagement',
    ])
  })

  it('paints the default dashboard in 2 data queries and 1 conference resolution', async () => {
    const batch = await fetchDashboardData(PLANNING_WIDGETS)

    // Every requested widget produced a result. A low query count achieved by
    // quietly dropping widgets would be no win at all — this is the assertion
    // that makes the count below mean something.
    for (const key of PLANNING_WIDGETS) {
      expect(batch[key], `no result for ${key}`).toBeDefined()
      expect(
        batch[key]?.ok,
        `${key} failed: ${JSON.stringify(batch[key])}`,
      ).toBe(true)
    }

    // 2 = the composed query + `getSpeakers` (which is `'use cache'`d anyway).
    // Was 9 before this refactor. Ratchet, not a target.
    expect(roundTrips.length).toBeLessThanOrEqual(2)
    expect(composedQueries()).toHaveLength(1)

    // ONE authorization pass, ONE conference resolution.
    expect(conferenceResolutionOptions).toHaveLength(1)
  })

  it('adding widgets adds ROOTS to the same query, not more queries', async () => {
    await fetchDashboardData([
      ...PLANNING_WIDGETS,
      'proposal-pipeline',
      'review-progress',
      'travel-support',
    ])

    expect(composedQueries()).toHaveLength(1)
    expect(conferenceResolutionOptions).toHaveLength(1)

    const composed = composedQueries()[0]
    expect(composed).toContain('"travelSupports"')
    expect(composed).toContain('"reviews"')
  })

  it('the schedule widget still costs exactly one conference resolution', async () => {
    await fetchDashboardData(['schedule-builder', 'cfp-health'])

    // The schedule-expanded document is a superset read, so it replaces the
    // plain one rather than being fetched alongside it.
    expect(conferenceResolutionOptions).toEqual([
      { schedule: true, confirmedTalksOnly: false },
    ])
    expect(composedQueries()).toHaveLength(1)
  })

  it('a widget that is NOT on the dashboard contributes no root', async () => {
    await fetchDashboardData(['cfp-health'])

    const composed = composedQueries()[0]
    expect(composed).toContain('"proposals"')
    // Composing must not become "always read everything".
    expect(composed).not.toContain('"sponsors"')
    expect(composed).not.toContain('"travelSupports"')
    expect(composed).not.toContain('"activities"')
    expect(composed).not.toContain('"reviews"')
    expect(composed).not.toContain('"featuredSpeakerCount"')
  })

  it('a dashboard of conference-only widgets issues no data query at all', async () => {
    const batch = await fetchDashboardData(['upcoming-deadlines'])

    expect(batch['upcoming-deadlines']?.ok).toBe(true)
    expect(roundTrips).toHaveLength(0)
  })

  it('ignores widget keys that are not in the registry', async () => {
    const batch = await fetchDashboardData([
      'cfp-health',
      'not-a-widget',
      '../../etc/passwd',
    ])

    expect(Object.keys(batch)).toEqual(['cfp-health'])
    expect(composedQueries()).toHaveLength(1)
  })
})
