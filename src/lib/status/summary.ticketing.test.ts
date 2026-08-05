/**
 * @vitest-environment node
 *
 * THE TICKETING KILL SWITCH IN THE WEEKLY SLACK SUMMARY (#836).
 *
 * `buildTicketSection` fed live ticket counts and revenue to two organizer
 * outputs — the weekly Slack post (`/api/cron/weekly-update`, which runs on a
 * schedule with no organizer present) and the admin status page — with no
 * feature check at all. A deny that silences the UI while Slack keeps posting
 * sales figures is not a switch-off.
 *
 * WHY THIS CANNOT PASS FOR THE WRONG REASON. `tickets: null` is ALSO what an
 * unconfigured or a broken conference produces, so "the summary has no tickets"
 * proves nothing on its own. Every denied case therefore additionally asserts
 * that `resolveTicketingProvider` was NEVER CALLED — the conference below is
 * fully configured and its provider resolves, so with the gate removed the
 * resolver runs and real numbers come back. Only the gate can produce a summary
 * where the resolver was not even reached.
 *
 * The gate resolves through the REAL feature modules over a mocked
 * `getOrganizationById`, so override direction and expiry are exercised.
 */

const h = vi.hoisted(() => ({
  getOrganizationById: vi.fn(),
  resolveTicketingProvider: vi.fn(),
  fetchEventTickets: vi.fn(),
  listSponsorsForConference: vi.fn(),
  getProposals: vi.fn(),
  getSpeakers: vi.fn(),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: h.getOrganizationById,
  getOrganizationRefForCurrentConference: () => null,
}))
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingProvider: h.resolveTicketingProvider,
}))
vi.mock('@/lib/sponsor-crm/sanity', () => ({
  listSponsorsForConference: h.listSponsorsForConference,
}))
vi.mock('@/lib/proposal/server', () => ({
  getProposals: h.getProposals,
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: h.getSpeakers,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Conference } from '@/lib/conference/types'
import { buildConferenceStatusSummary } from './summary'

const ORG = 'organization-cloud-native-days'

/**
 * THE RULE-2 SHAPE: `community` (no `plan`), no operator override. Not entitled
 * to `ticketing` by plan — `minPlan` is `'pro'` — yet `features/ticketing.ts`
 * rule 2 keeps its ticketing surface on its own provider credentials, so its
 * weekly numbers must keep arriving. Not a snapshot of any live tenant;
 * production's org carries `plan: 'pro'`, covered separately below.
 */
const communityOrgDocument = {
  _id: ORG,
  name: 'Cloud Native Days Norway',
  slug: 'cloud-native-days-norway',
}

const conference = {
  _id: 'conf-cndn',
  title: 'Cloud Native Days Bergen',
  organization: { _ref: ORG, _type: 'reference' },
  checkinCustomerId: 7,
  checkinEventId: 4242,
  organizers: [{ _id: 'o1' }],
} as unknown as Conference

function denyTicketing() {
  h.getOrganizationById.mockResolvedValue({
    ...communityOrgDocument,
    featureOverrides: [{ feature: 'ticketing', enabled: false }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getOrganizationById.mockResolvedValue(communityOrgDocument)
  // A CONFIGURED conference with real sales — the section is only empty
  // because something refused it, never because there was nothing to report.
  h.resolveTicketingProvider.mockResolvedValue({
    configured: true,
    provider: { fetchEventTickets: h.fetchEventTickets },
    eventRef: { provider: 'checkin', customerId: 7, eventId: 4242 },
  })
  h.fetchEventTickets.mockResolvedValue([
    {
      id: 1,
      order_id: 500,
      sum: '1000',
      category: 'Regular',
      order_date: '2026-01-05',
    },
    {
      id: 2,
      order_id: 501,
      sum: '0',
      category: 'Speaker',
      order_date: '2026-01-06',
    },
  ])
  h.listSponsorsForConference.mockResolvedValue({ sponsors: [], error: null })
  h.getProposals.mockResolvedValue({ proposals: [] })
  h.getSpeakers.mockResolvedValue({ speakers: [{ _id: 'sp1' }] })
})

describe('buildTicketSection honours the operator kill switch (#836)', () => {
  it('reports NO ticket data for a denied org, and never resolves the provider', async () => {
    denyTicketing()
    const summary = await buildConferenceStatusSummary(conference)

    expect(summary.tickets).toBeNull()
    expect(summary.targetProgress).toBeNull()
    // The distinguishing assertion: a denied org costs zero provider work.
    expect(h.resolveTicketingProvider).not.toHaveBeenCalled()
    expect(h.fetchEventTickets).not.toHaveBeenCalled()
  })

  it('switches off ticketing, not the whole weekly update', async () => {
    denyTicketing()
    h.getProposals.mockResolvedValue({
      proposals: [{ status: 'submitted' }, { status: 'accepted' }],
    })
    const summary = await buildConferenceStatusSummary(conference)

    // The other sections still report, and the deny is not an ERROR — nothing
    // failed, so nothing should be logged as a failed section.
    expect(summary.proposals?.total).toBe(2)
    expect(summary.errors).toEqual([])
  })
})

/**
 * THE HARD CONSTRAINT: an org with no operator deny keeps its weekly numbers.
 * The rule-2 org below is NOT entitled to `ticketing` by plan (no plan →
 * community; ticketing is `minPlan: 'pro'`), so an entitlement-shaped gate would
 * silence a Slack post that works today — which is exactly what must not happen.
 * The pro case at the end is the other side of the same constraint: the shape
 * production actually runs.
 */
describe('an org without an operator deny keeps its ticket numbers', () => {
  it('reports live counts for the un-denied rule-2 org', async () => {
    const summary = await buildConferenceStatusSummary(conference)

    expect(h.resolveTicketingProvider).toHaveBeenCalledTimes(1)
    expect(summary.tickets).toMatchObject({
      paidTickets: 1,
      totalRevenue: 1000,
      freeTicketsClaimed: 1,
    })
  })

  it('is unaffected by an EXPIRED deny or a deny on another feature', async () => {
    h.getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
      featureOverrides: [
        {
          feature: 'ticketing',
          enabled: false,
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
        { feature: 'badges', enabled: false },
      ],
    })
    const summary = await buildConferenceStatusSummary(conference)
    expect(summary.tickets?.paidTickets).toBe(1)
  })

  it('keeps reporting when the organization read REJECTS — an accident is not a decision', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    const summary = await buildConferenceStatusSummary(conference)
    expect(summary.tickets?.paidTickets).toBe(1)
    logged.mockRestore()
  })

  it('keys the deny on the conference OWNER, not the request host', async () => {
    await buildConferenceStatusSummary(conference)
    expect(h.getOrganizationById).toHaveBeenCalledWith(ORG)
  })

  /**
   * THE SHAPE PRODUCTION ACTUALLY HAS, queried from the live dataset on
   * 2026-08-05: `plan: 'pro'`, `featureOverrides: null`. Entitled by plan and
   * carrying no operator decision, so its weekly post must keep its numbers.
   * Deny-only passes it trivially — it is here as the positive control the live
   * shape did not previously have.
   */
  it('reports live counts for the production shape — pro plan, no overrides', async () => {
    h.getOrganizationById.mockResolvedValue({
      ...communityOrgDocument,
      plan: 'pro',
      featureOverrides: null,
    })
    const summary = await buildConferenceStatusSummary(conference)

    expect(h.resolveTicketingProvider).toHaveBeenCalledTimes(1)
    expect(summary.tickets).toMatchObject({
      paidTickets: 1,
      totalRevenue: 1000,
      freeTicketsClaimed: 1,
    })
  })
})
