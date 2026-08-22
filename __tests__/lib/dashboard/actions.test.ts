/**
 * Dashboard Server Actions Tests
 *
 * Tests the data transformation layer that sits between domain data
 * and dashboard widgets. The thirteen per-widget actions are now ONE action
 * (`fetchDashboardData`) whose Sanity-backed sources are composed into a single
 * GROQ object projection; each describe-block below still exercises exactly one
 * widget's payload, through the batch.
 */

// --- Mocks ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

// Auth — no external variable in factory to avoid hoisting issues
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(),
  // Re-export AppEnvironment that auth.ts re-exports
  AppEnvironment: {},
}))

// Speakers — `getSpeakers` is `'use cache'`d and org-scoped, so speaker
// engagement is one of the four sources that stay out of the composed query.
const mockGetSpeakers = vi.fn<AnyFn>()
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: (...args: unknown[]) => mockGetSpeakers(...args),
}))

// Tickets — the ticket-sales widget resolves the ticketing ADMIN ACCESS state
// from the domain conference (provider + feature gate); mock the provider seam
// so the provider's fetchEventTickets is the spy, and let the real gate run on
// the mocked organization document. The resolver mirrors the real
// unconfigured/configured branching.
const mockFetchEventTickets = vi.fn<AnyFn>()
vi.mock('@/lib/tickets/provider', () => ({
  conferenceProviderType: () => 'checkin',
  resolveTicketingProvider: (conference: {
    checkinCustomerId?: number
    checkinEventId?: number
  }) => {
    if (!conference.checkinCustomerId || !conference.checkinEventId) {
      return { configured: false, provider: null, eventRef: null }
    }
    return {
      configured: true,
      provider: {
        fetchEventTickets: (...args: unknown[]) =>
          mockFetchEventTickets(...args),
      },
      eventRef: {
        customerId: conference.checkinCustomerId,
        eventId: conference.checkinEventId,
      },
    }
  },
}))

vi.mock('@/lib/tickets/processor', () => ({
  TicketSalesProcessor: vi.fn().mockImplementation(() => ({
    process: () => ({
      statistics: { totalPaidTickets: 0, totalRevenue: 0 },
      progression: [],
      performance: {},
      capacity: {},
    }),
  })),
}))

vi.mock('@/lib/tickets/config', () => ({
  DEFAULT_TARGET_CONFIG: {},
  DEFAULT_CAPACITY: 500,
}))

// Workshops — paginated signups, so it stays its own call too.
const mockGetWorkshopStatistics = vi.fn<AnyFn>()
vi.mock('@/lib/workshop/sanity', () => ({
  getWorkshopStatistics: (...args: unknown[]) =>
    mockGetWorkshopStatistics(...args),
}))

// Messaging — "My areas" reads its message view counts through its own
// (already composed) query; mocked so no describe-block here can reach Sanity.
const mockGetConversationViewCounts = vi.fn<AnyFn>()
vi.mock('@/lib/messaging/sanity', () => ({
  getConversationViewCounts: (...args: unknown[]) =>
    mockGetConversationViewCounts(...args),
}))

// Sanity client. `clientReadUncached.fetch` is now THE dashboard read: one
// composed object projection per batch, keyed by source name.
const mockClientReadFetch = vi.fn<AnyFn>()
const mockClientWriteFetch = vi.fn<AnyFn>()
const mockCreateOrReplace = vi.fn<AnyFn>()
const mockCreate = vi.fn<AnyFn>()
const mockPatch = vi.fn<AnyFn>()
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (...args: unknown[]) => mockClientWriteFetch(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    createOrReplace: (...args: unknown[]) => mockCreateOrReplace(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
  clientReadUncached: {
    fetch: (...args: unknown[]) => mockClientReadFetch(...args),
  },
}))

// Conference resolution — NO action in the module accepts a client
// conference/conferenceId; they resolve it from the request domain like the
// tRPC routers (resolveConferenceId for id-only actions,
// getConferenceForCurrentDomain when conference fields are needed).
const mockResolveConferenceId = vi.fn<AnyFn>()
vi.mock('@/server/trpc', () => ({
  resolveConferenceId: (...args: unknown[]) => mockResolveConferenceId(...args),
}))

const mockGetConferenceForCurrentDomain = vi.fn<AnyFn>()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConferenceForCurrentDomain(...args),
}))

// Org resolution — `requireOrganizer` is ORG-SCOPED: it grants only when the
// session speaker's `organizerOrgIds` contains the org the REQUEST resolves to
// (`isOrganizerForCurrentOrg` → `getOrganizationRefForCurrentConference`), so
// the request org has to be pinned to the one the session below carries.
const mockGetOrganizationById = vi.fn<AnyFn>(async () => null)
vi.mock('@/lib/organization/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOrganizationRefForCurrentConference: async () => 'org-test',
  // The ticketing feature gate reads the org document (plan + overrides).
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
}))

// Time utilities
vi.mock('@/lib/time', () => ({
  formatRelativeTime: vi.fn((d: string) => d || 'unknown'),
  formatLabel: vi.fn((v: string) => v.charAt(0).toUpperCase() + v.slice(1)),
  formatConferenceDateShort: vi.fn((d: string) => d || 'unknown'),
}))

import type { Conference } from '@/lib/conference/types'
import { Status } from '@/lib/proposal/types'
import type {
  DeadlineData,
  CFPHealthData,
  ProposalPipelineData,
  ReviewProgressData,
  SpeakerEngagementData,
  TravelSupportData,
  ScheduleStatusData,
  ActivityItem,
  QuickAction,
  TicketSalesData,
  SponsorPipelineWidgetData,
} from '@/lib/dashboard/data-types'
import type { WorkshopStatistics } from '@/lib/workshop/types'
import type {
  DashboardWidgetKey,
  DashboardWidgetDataMap,
} from '@/lib/dashboard/widget-data'
import type { SerializedWidget } from '@/app/(admin)/admin/actions'

// vi.mock calls are hoisted automatically by Vitest
import {
  fetchDashboardData,
  loadDashboardConfig,
  saveDashboardConfig,
} from '@/app/(admin)/admin/actions'
import type { Mock } from 'vitest'
import { getAuthSession } from '@/lib/auth'

const mockGetAuthSession = getAuthSession as Mock

// --- Test fixtures ---

const baseConference: Conference = {
  _id: 'conf-1',
  title: 'Test Conference',
  organizer: 'Test Org',
  city: 'Bergen',
  country: 'Norway',
  tagline: 'Test',
  startDate: '2025-06-01',
  endDate: '2025-06-02',
  cfpStartDate: '2025-01-01',
  cfpEndDate: '2025-03-31',
  cfpNotifyDate: '2025-04-15',
  cfpEmail: 'cfp@test.com',
  sponsorEmail: 'sponsor@test.com',
  programDate: '2025-05-01',
  registrationEnabled: true,
  contactEmail: 'info@test.com',
  organizers: [],
  domains: ['test.dev'],
  formats: [],
  topics: [],
}

/** Point the mocked domain resolution at a specific conference document. */
function setDomainConference(conference: Conference) {
  mockGetConferenceForCurrentDomain.mockImplementation(async () => ({
    conference,
    domain: 'test.dev',
    error: null,
  }))
}

/**
 * The composed query's result: ONE object keyed by source name. Only the
 * sources the requested widgets need are ever present in production, so a
 * fixture names exactly the roots its widget reads.
 */
function mockDashboardQuery(result: Record<string, unknown>) {
  mockClientReadFetch.mockResolvedValue(result)
}

/**
 * One widget's payload out of the batch. Every widget describe-block goes
 * through this, so each still asserts on the same shape its own action used to
 * return — and a widget that settled as a failure throws here rather than
 * silently asserting on `undefined`.
 */
async function widget<K extends DashboardWidgetKey>(
  key: K,
): Promise<DashboardWidgetDataMap[K]> {
  const batch = await fetchDashboardData([key])
  const slice = batch[key]
  if (!slice) throw new Error(`no slice for ${key}`)
  if (!slice.ok) throw new Error(slice.error)
  return slice.value as DashboardWidgetDataMap[K]
}

/** The composed query text of the (single) read this batch issued. */
function composedQuery(): string {
  expect(mockClientReadFetch).toHaveBeenCalledTimes(1)
  return mockClientReadFetch.mock.calls[0][0] as string
}

/** The composed query's PARAMS — where the tenant key lives. */
function composedParams(): Record<string, unknown> {
  expect(mockClientReadFetch).toHaveBeenCalledTimes(1)
  return mockClientReadFetch.mock.calls[0][1] as Record<string, unknown>
}

/**
 * Tenant scope is a GROQ PARAMETER, never interpolated: the batch issued ONE
 * read, its roots filter on `$conferenceId`, and the value bound to it is the
 * domain-resolved id.
 */
function expectTenantScopedRead() {
  expect(mockClientReadFetch).toHaveBeenCalledTimes(1)
  expect(composedQuery()).toContain('conference._ref == $conferenceId')
  expect(composedParams()).toMatchObject({ conferenceId: 'conf-1' })
}

/**
 * A row of the composed query's `proposals` root. It arrives ALREADY filtered
 * to non-draft and ordered `_updatedAt desc` (the GROQ does both), and carries
 * raw speaker REFERENCES rather than dereferenced speakers.
 */
function proposalRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: `proposal-${Math.random().toString(36).slice(2)}`,
    title: 'Test Talk',
    status: Status.submitted,
    format: 'presentation',
    _createdAt: '2025-02-15T10:00:00Z',
    speakerIds: null,
    ...overrides,
  }
}

// --- Tests ---

describe('Dashboard Server Actions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-02-15T12:00:00Z'))
    vi.clearAllMocks()
    mockFetchEventTickets.mockResolvedValue([])
    mockDashboardQuery({})
    mockClientWriteFetch.mockResolvedValue(null)
    mockCreateOrReplace.mockResolvedValue({ _id: 'personal-config' })
    mockResolveConferenceId.mockResolvedValue('conf-1')
    setDomainConference(baseConference)
    mockGetAuthSession.mockResolvedValue({
      user: { name: 'Admin', email: 'admin@test.com' },
      expires: '2099-01-01T00:00:00Z',
      // `organizerOrgIds` — not the deprecated global `isOrganizer` flag — is
      // what grants; it must contain the request's resolved org.
      speaker: {
        _id: 'speaker-1',
        isOrganizer: true,
        organizerOrgIds: ['org-test'],
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('fetchDashboardData', () => {
    it('authorizes ONCE, before any read, and rejects a non-organizer', async () => {
      mockGetAuthSession.mockResolvedValue({
        user: { name: 'User', email: 'user@test.com' },
        expires: '2099-01-01T00:00:00Z',
        speaker: { _id: 'speaker-1', isOrganizer: false, organizerOrgIds: [] },
      })

      // Authorization failure is the ONE failure that is not per-widget: it
      // rejects the whole call, and nothing is read on the caller's behalf.
      await expect(fetchDashboardData(['cfp-health'])).rejects.toThrow(
        /Unauthorized/,
      )
      expect(mockClientReadFetch).not.toHaveBeenCalled()
    })

    it('serves every Sanity-backed widget from ONE round-trip', async () => {
      mockDashboardQuery({
        proposals: [proposalRow()],
        reviews: [],
        sponsors: [],
        activities: [],
        recentProposals: [],
      })

      const batch = await fetchDashboardData([
        'cfp-health',
        'proposal-pipeline',
        'review-progress',
        'quick-actions',
        'sponsor-pipeline',
        'recent-activity',
      ])

      expect(mockClientReadFetch).toHaveBeenCalledTimes(1)
      for (const key of [
        'cfp-health',
        'proposal-pipeline',
        'review-progress',
        'quick-actions',
        'sponsor-pipeline',
        'recent-activity',
      ] as const) {
        expect(batch[key]?.ok).toBe(true)
      }
    })

    it('emits only the roots the requested widgets need', async () => {
      await fetchDashboardData(['cfp-health'])

      const query = composedQuery()
      expect(query).toContain('"proposals"')
      // A widget that is not on this dashboard contributes no source.
      expect(query).not.toContain('"sponsors"')
      expect(query).not.toContain('"travelSupports"')
      expect(query).not.toContain('"reviews"')
    })

    it('drops unknown widget keys and reads nothing for an empty selection', async () => {
      expect(await fetchDashboardData(['not-a-widget'])).toEqual({})
      expect(await fetchDashboardData([])).toEqual({})
      expect(mockClientReadFetch).not.toHaveBeenCalled()
    })

    it('never interpolates the tenant into the query text', async () => {
      await fetchDashboardData(['cfp-health'])

      expectTenantScopedRead()
      // The conference id is BOUND, not spliced: a query carrying the literal
      // would be unreviewable and injectable.
      expect(composedQuery()).not.toContain('conf-1')
    })

    /**
     * The contract `fetchDashboardData` documents: "a widget whose source
     * fails carries `{ ok: false }` and every other widget still renders".
     * Collapsing thirteen actions into one read is exactly where that is easy
     * to lose — await the composed query OUTSIDE `settle` and a single Sanity
     * blip rejects the WHOLE action, taking down `ticket-sales` and
     * `workshop-capacity`, which read no Sanity at all.
     */
    it('isolates a failing source to its own widget', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockClientReadFetch.mockRejectedValue(new Error('Sanity is down'))

      const batch = await fetchDashboardData(['cfp-health', 'ticket-sales'])
      expect(batch['cfp-health']).toEqual({
        ok: false,
        error: expect.any(String),
      })
      // A widget with no Sanity source must not be taken down with it.
      expect(batch['ticket-sales']?.ok).toBe(true)

      consoleSpy.mockRestore()
    })
  })

  describe('fetchDeadlines', () => {
    it('returns deadlines sorted by days remaining ascending', async () => {
      const deadlines = await widget('upcoming-deadlines')
      const daysValues = deadlines.map((d) => d.daysRemaining)
      expect(daysValues).toEqual([...daysValues].sort((a, b) => a - b))
      // Deadlines are derived from the already-resolved conference document,
      // so a dashboard of only deadlines issues no query at all.
      expect(mockClientReadFetch).not.toHaveBeenCalled()
    })

    it('assigns urgency levels based on days remaining', async () => {
      const confSoon: Conference = {
        ...baseConference,
        cfpEndDate: '2025-02-20', // 5 days → high
        cfpNotifyDate: '2025-03-10', // 23 days → medium
        programDate: '2025-04-20', // 64 days → low
        startDate: '2025-06-01', // 106 days → low
      }
      setDomainConference(confSoon)
      const deadlines = await widget('upcoming-deadlines')
      const urgencyMap = Object.fromEntries(
        deadlines.map((d) => [d.name, d.urgency]),
      )

      expect(urgencyMap['CFP Closes']).toBe('high')
      expect(urgencyMap['Notify Speakers']).toBe('medium')
      expect(urgencyMap['Conference Day']).toBe('low')
    })

    it('excludes past deadlines (negative days remaining)', async () => {
      const deadlines = await widget('upcoming-deadlines')
      for (const d of deadlines) {
        expect(d.daysRemaining).toBeGreaterThan(0)
      }
    })

    it('returns empty array when all dates are in the past', async () => {
      const pastConf: Conference = {
        ...baseConference,
        cfpStartDate: '2024-01-01',
        cfpEndDate: '2024-03-31',
        cfpNotifyDate: '2024-04-15',
        programDate: '2024-05-01',
        startDate: '2024-06-01',
        endDate: '2024-06-02',
      }
      setDomainConference(pastConf)
      const deadlines = await widget('upcoming-deadlines')
      expect(deadlines).toHaveLength(0)
    })
  })

  describe('fetchCFPHealth', () => {
    it('computes submission count excluding drafts', async () => {
      // Drafts never reach the shaper: the exclusion is a predicate on the
      // `proposals` root, with the status itself bound as a parameter.
      mockDashboardQuery({
        proposals: [
          proposalRow({ status: Status.submitted }),
          proposalRow({ status: Status.accepted }),
        ],
      })

      const health = await widget('cfp-health')
      expect(health.totalSubmissions).toBe(2) // excludes draft
      expect(composedQuery()).toContain('status != $draftStatus')
      expect(composedParams()).toMatchObject({ draftStatus: 'draft' })
    })

    it('computes average submissions per day since CFP opened', async () => {
      // CFP started 2025-01-01, now is 2025-02-15 = 45 days
      const proposals = Array.from({ length: 45 }, (_, i) =>
        proposalRow({
          status: Status.submitted,
          _createdAt: `2025-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        }),
      )
      mockDashboardQuery({ proposals })

      const health = await widget('cfp-health')
      expect(health.averagePerDay).toBe(1)
      expect(health.totalSubmissions).toBe(45)
    })

    it('groups submissions by format', async () => {
      mockDashboardQuery({
        proposals: [
          proposalRow({ status: Status.submitted, format: 'presentation' }),
          proposalRow({ status: Status.submitted, format: 'presentation' }),
          proposalRow({ status: Status.submitted, format: 'lightning' }),
        ],
      })

      const health = await widget('cfp-health')
      expect(health.formatDistribution).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ format: 'Presentation', count: 2 }),
          expect.objectContaining({ format: 'Lightning', count: 1 }),
        ]),
      )
    })

    it('handles zero submissions', async () => {
      mockDashboardQuery({ proposals: [] })

      const health = await widget('cfp-health')
      expect(health.totalSubmissions).toBe(0)
      expect(health.averagePerDay).toBe(0)
      expect(health.formatDistribution).toHaveLength(0)
      expectTenantScopedRead()
    })
  })

  describe('fetchProposalPipeline', () => {
    it('computes correct status counts and acceptance rate', async () => {
      mockDashboardQuery({
        proposals: [
          proposalRow({ status: Status.submitted }),
          proposalRow({ status: Status.submitted }),
          proposalRow({ status: Status.accepted }),
          proposalRow({ status: Status.confirmed }),
          proposalRow({ status: Status.rejected }),
          // a draft would be here — the query already excluded it
        ],
      })

      const pipeline = await widget('proposal-pipeline')

      expect(pipeline.submitted).toBe(5) // non-draft total
      expect(pipeline.accepted).toBe(1)
      expect(pipeline.confirmed).toBe(1)
      expect(pipeline.rejected).toBe(1)
      expect(pipeline.pendingDecisions).toBe(2)
      // acceptanceRate = (accepted + confirmed) / submitted * 100 = 2/5 * 100 = 40
      expect(pipeline.acceptanceRate).toBe(40)
    })

    it('counts distinct speakers across confirmed talks only, deduped', async () => {
      mockDashboardQuery({
        proposals: [
          proposalRow({
            status: Status.confirmed,
            speakerIds: ['sp-1'],
          }),
          proposalRow({
            status: Status.confirmed,
            // Alice co-speaks again + Bob — Alice must not double count
            speakerIds: ['sp-1', 'sp-2'],
          }),
          proposalRow({
            // accepted (not confirmed) — excluded from the speaker count
            status: Status.accepted,
            speakerIds: ['sp-3'],
          }),
        ],
      })

      const pipeline = await widget('proposal-pipeline')
      expect(pipeline.distinctSpeakers).toBe(2) // Alice + Bob
    })

    it('returns zero acceptance rate when no proposals', async () => {
      mockDashboardQuery({ proposals: [] })

      const pipeline = await widget('proposal-pipeline')
      expect(pipeline.submitted).toBe(0)
      expect(pipeline.acceptanceRate).toBe(0)
    })

    it('handles all-draft proposals', async () => {
      // An all-draft corpus reaches the shaper as an EMPTY row set, because
      // the draft filter lives in the root predicate now.
      mockDashboardQuery({ proposals: [] })

      const pipeline = await widget('proposal-pipeline')
      expect(pipeline.submitted).toBe(0)
      expect(pipeline.acceptanceRate).toBe(0)
      expect(composedQuery()).toContain('status != $draftStatus')
      expect(composedParams()).toMatchObject({ draftStatus: 'draft' })
    })
  })

  describe('fetchReviewProgress', () => {
    // Review progress joins the `reviews` root to the `proposals` root in JS,
    // by `proposalId` — one review read for the whole dashboard, never one
    // correlated subquery per talk.
    const reviewRow = (proposalId: string, content = 4) => ({
      proposalId,
      score: { content, relevance: content, speaker: content },
    })

    it('computes percentage of reviewed proposals', async () => {
      mockDashboardQuery({
        proposals: [
          proposalRow({ _id: 'p1' }),
          proposalRow({ _id: 'p2' }),
          proposalRow({ _id: 'p3' }),
        ],
        reviews: [reviewRow('p1')],
      })

      const progress = await widget('review-progress')
      // 3 non-draft, 1 has reviews
      expect(progress.totalProposals).toBe(3)
      expect(progress.reviewedCount).toBe(1)
      expect(progress.percentage).toBeCloseTo(33.33, 0)
    })

    it('requests only a trimmed projection without reviewer joins', async () => {
      mockDashboardQuery({ proposals: [], reviews: [] })
      await widget('review-progress')

      expect(mockClientReadFetch).toHaveBeenCalledTimes(1)
      const query = composedQuery()
      expect(query).toContain('score')
      expect(query).not.toContain('reviewer')
      // Drafts are still excluded in the query; the status is a parameter now.
      expect(query).toContain('status != $draftStatus')
      expect(composedParams()).toMatchObject({ draftStatus: 'draft' })
      // Reviews are tenant-scoped by traversal, not by correlation to a talk.
      expect(query).toContain('proposal->conference._ref == $conferenceId')
    })

    it('finds the next unreviewed submitted proposal', async () => {
      mockDashboardQuery({
        proposals: [
          proposalRow({ _id: 'reviewed-1' }),
          proposalRow({ _id: 'unreviewed-1', title: 'Needs Review' }),
        ],
        reviews: [reviewRow('reviewed-1', 3)],
      })

      const progress = await widget('review-progress')
      expect(progress.nextUnreviewed).toEqual({
        id: 'unreviewed-1',
        title: 'Needs Review',
      })
    })

    it('returns no nextUnreviewed when all are reviewed', async () => {
      mockDashboardQuery({
        proposals: [proposalRow({ _id: 'p1' })],
        reviews: [reviewRow('p1', 5)],
      })

      const progress = await widget('review-progress')
      expect(progress.nextUnreviewed).toBeUndefined()
    })
  })

  describe('fetchSpeakerEngagement', () => {
    it('counts speakers by flags and computes metrics', async () => {
      mockGetSpeakers.mockResolvedValue({
        speakers: [
          {
            _id: 's1',
            name: 'Alice',
            flags: ['diverse', 'local'],
            proposals: [
              { status: Status.submitted },
              { status: Status.submitted },
            ],
          },
          {
            _id: 's2',
            name: 'Bob',
            flags: ['first-time'],
            proposals: [{ status: Status.accepted }],
          },
          {
            _id: 's3',
            name: 'Carol',
            flags: [],
            proposals: [{ status: Status.confirmed }],
          },
        ],
        err: null,
      })

      // The featured count rides in the composed query as a `count()` root.
      mockDashboardQuery({ featuredSpeakerCount: 1 })

      const data = await widget('speaker-engagement')
      expect(data.totalSpeakers).toBe(3)
      expect(data.diverseSpeakers).toBe(1) // Alice
      expect(data.localSpeakers).toBe(1) // Alice
      expect(data.newSpeakers).toBe(1) // Bob (first-time)
      // No derived "returning" stat: untagged speakers are not assumed returning
      expect(data).not.toHaveProperty('returningSpeakers')
      expect(data.awaitingConfirmation).toBe(1) // Bob (status=accepted)
      expect(data.featuredCount).toBe(1)
      // totalProposals = 2+1+1 = 4, speakers = 3, avg = 1.3
      expect(data.averageProposalsPerSpeaker).toBe(1.3)
      // The count root is a point read of the domain-resolved conference, so
      // the tenant is the document id — still a bound parameter.
      expect(composedQuery()).toContain('_id == $conferenceId')
      expect(composedParams()).toMatchObject({ conferenceId: 'conf-1' })
      expect(mockGetSpeakers).toHaveBeenCalledWith('conf-1', [
        Status.submitted,
        Status.accepted,
        Status.confirmed,
      ])
    })

    it('handles zero speakers', async () => {
      mockGetSpeakers.mockResolvedValue({ speakers: [], err: null })
      mockDashboardQuery({ featuredSpeakerCount: 0 })

      const data = await widget('speaker-engagement')
      expect(data.totalSpeakers).toBe(0)
      expect(data.averageProposalsPerSpeaker).toBe(0)
    })
  })

  describe('fetchTravelSupport', () => {
    it('aggregates travel support budgets and counts', async () => {
      const confWithBudget = { ...baseConference, travelSupportBudget: 50000 }

      mockDashboardQuery({
        travelSupports: [
          {
            _id: 'ts1',
            _createdAt: '2025-02-01T10:00:00Z',
            status: 'submitted',
            totalAmount: 5000,
            expenseAmounts: [3000, 2000],
            speakerName: 'Alice',
          },
          {
            _id: 'ts2',
            _createdAt: '2025-02-02T10:00:00Z',
            status: 'approved',
            totalAmount: 8000,
            approvedAmount: 7500,
            expenseAmounts: [8000],
            speakerName: 'Bob',
          },
          {
            _id: 'ts3',
            _createdAt: '2025-02-03T10:00:00Z',
            status: 'paid',
            totalAmount: 3000,
            approvedAmount: 3000,
            expenseAmounts: [3000],
            speakerName: 'Carol',
          },
        ],
      })

      setDomainConference(confWithBudget)
      const data = await widget('travel-support')
      expect(data.pendingApprovals).toBe(1) // submitted only
      expect(data.approvedCount).toBe(2) // approved + paid
      expect(data.totalRequested).toBe(16000) // 5000+8000+3000
      expect(data.totalApproved).toBe(10500) // 7500+3000 (approved+paid)
      expect(data.budgetAllocated).toBe(50000)
      expect(data.averageRequest).toBeCloseTo(5333.33, 0)
      expect(data.requests).toHaveLength(1) // top 5 pending
      expect(data.requests[0].speaker).toBe('Alice')
      expectTenantScopedRead()
    })

    it('returns zero budget when conference has no travel_support_budget', async () => {
      mockDashboardQuery({ travelSupports: [] })

      const data = await widget('travel-support')
      expect(data.budgetAllocated).toBe(0)
      expect(data.pendingApprovals).toBe(0)
      expect(data.averageRequest).toBe(0)
    })
  })

  describe('fetchWorkshopCapacity', () => {
    it('delegates to getWorkshopStatistics and returns domain type', async () => {
      const mockStats = {
        workshops: [
          {
            workshopId: 'w1',
            workshopTitle: 'Kubernetes 101',
            capacity: 30,
            totalSignups: 25,
            confirmedSignups: 20,
            pendingSignups: 0,
            waitlistSignups: 5,
            cancelledSignups: 0,
            utilization: 66.67,
          },
        ],
        totals: {
          totalWorkshops: 1,
          totalCapacity: 30,
          totalSignups: 25,
          uniqueParticipants: 20,
          totalConfirmed: 20,
          totalPending: 0,
          totalWaitlist: 5,
          totalCancelled: 0,
          averageUtilization: 66.67,
        },
      }
      mockGetWorkshopStatistics.mockResolvedValue(mockStats)

      const result = await widget('workshop-capacity')
      expect(result).toEqual(mockStats)
      expect(mockGetWorkshopStatistics).toHaveBeenCalledWith('conf-1')
      // Signups paginate, so this one keeps its own call — and issues no
      // composed read of its own.
      expect(mockClientReadFetch).not.toHaveBeenCalled()
    })
  })

  describe('fetchSponsorPipelineData', () => {
    it('maps pipeline stages and formats activities', async () => {
      mockDashboardQuery({
        sponsors: [
          { _id: 's1', status: 'prospect' },
          { _id: 's2', status: 'prospect' },
          { _id: 's3', status: 'prospect' },
          {
            _id: 's4',
            status: 'closed-won',
            contractValue: 350000,
            sponsor: { name: 'Acme Corp' },
          },
        ],
        activities: [
          {
            _id: 'a1',
            description: 'Sent proposal',
            createdAt: '2025-02-14T10:00:00Z',
            _createdAt: '2025-02-14T10:00:00Z',
            sponsorName: 'Acme Corp',
            createdByName: 'Admin',
          },
        ],
      })

      // Revenue goal comes from the domain-resolved conference document,
      // never from a client argument.
      setDomainConference({ ...baseConference, sponsorRevenueGoal: 500000 })
      const data = await widget('sponsor-pipeline')

      expect(data.stages).toHaveLength(4)
      expect(data.stages[0]).toMatchObject({
        name: 'Prospect',
        count: 3,
        value: 0,
      })
      expect(data.totalValue).toBe(350000)
      expect(data.wonDeals).toBe(1)
      expect(data.lostDeals).toBe(0)
      expect(data.revenueGoal).toBe(500000)
      expect(data.recentActivity).toHaveLength(1)
      expect(data.recentActivity[0].sponsor).toBe('Acme Corp')
      expectTenantScopedRead()
    })
  })

  describe('fetchScheduleStatus', () => {
    it('counts schedule slots and detects unassigned talks', async () => {
      const confWithSchedule = {
        ...baseConference,
        schedules: [
          {
            _id: 'sched-1',
            date: '2025-06-01',
            tracks: [
              {
                trackTitle: 'Main',
                trackDescription: '',
                talks: [
                  {
                    talk: { _id: 'talk-1' },
                    startTime: '09:00',
                    endTime: '09:45',
                  },
                  {
                    talk: { _id: 'talk-2' },
                    startTime: '10:00',
                    endTime: '10:45',
                  },
                  { placeholder: 'TBD', startTime: '11:00', endTime: '11:45' },
                  { startTime: '13:00', endTime: '13:45' },
                ],
              },
            ],
          },
        ],
      } as unknown as Conference

      mockDashboardQuery({
        proposals: [
          proposalRow({ _id: 'talk-1', status: Status.confirmed }),
          proposalRow({ _id: 'talk-2', status: Status.confirmed }),
          proposalRow({ _id: 'talk-3', status: Status.confirmed }), // unassigned
          proposalRow({ _id: 'talk-4', status: Status.accepted }), // unassigned
        ],
      })

      setDomainConference(confWithSchedule)
      const data = await widget('schedule-builder')
      // The dereferenced schedules are fetched server-side, with every
      // assigned slot counted regardless of talk status.
      expect(mockGetConferenceForCurrentDomain).toHaveBeenCalledWith({
        schedule: true,
        confirmedTalksOnly: false,
      })
      expect(data.totalSlots).toBe(4)
      expect(data.filledSlots).toBe(2)
      expect(data.placeholderSlots).toBe(1)
      expect(data.percentage).toBe(50)
      expect(data.unassignedConfirmedTalks).toBe(2) // talk-3 + talk-4
      expect(data.byDay).toHaveLength(1)
    })

    it('handles conference with no schedules', async () => {
      mockDashboardQuery({ proposals: [] })

      const data = await widget('schedule-builder')
      expect(data.totalSlots).toBe(0)
      expect(data.filledSlots).toBe(0)
      expect(data.percentage).toBe(0)
      expect(data.byDay).toHaveLength(0)
    })
  })

  describe('fetchRecentActivity', () => {
    // Both feeds are ordered + limited IN the composed query — the newest 15
    // sponsor activities and the newest 5 proposals, never a full corpus.
    it('merges sponsor activities and proposals sorted by date', async () => {
      mockDashboardQuery({
        activities: [
          {
            _id: 'a1',
            description: 'Contacted sponsor',
            createdAt: '2025-02-14T10:00:00Z',
            _createdAt: '2025-02-14T10:00:00Z',
            sponsorName: 'Acme',
            createdByName: 'Admin',
          },
        ],
        recentProposals: [
          {
            _id: 'p1',
            title: 'Latest Talk',
            _createdAt: '2025-02-15T09:00:00Z',
            speakerNames: ['Speaker A'],
          },
        ],
      })

      const items = await widget('recent-activity')
      expect(items.length).toBeGreaterThanOrEqual(2)
      // Most recent first
      expect(items[0].type).toBe('proposal') // Feb 15
      expect(items[1].type).toBe('sponsor') // Feb 14
      expect(items[0].user).toBe('Speaker A')
    })

    it('pushes ordering and limits into the proposal query', async () => {
      mockDashboardQuery({ activities: [], recentProposals: [] })

      await widget('recent-activity')

      const query = composedQuery()
      expect(query).toContain('order(_createdAt desc)')
      expect(query).toContain('[0...5]')
      // Bounded activity fetch on the other source — same query, same trip.
      expect(query).toContain('order(createdAt desc)')
      expect(query).toContain('[0...15]')
    })

    it('returns at most 15 items', async () => {
      mockDashboardQuery({
        activities: Array.from({ length: 15 }, (_, i) => ({
          _id: `a${i}`,
          description: `Activity ${i}`,
          createdAt: `2025-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
          _createdAt: `2025-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
          sponsorName: 'Sponsor',
          createdByName: 'Admin',
        })),
        recentProposals: Array.from({ length: 5 }, (_, i) => ({
          _id: `p${i}`,
          title: `Talk ${i}`,
          _createdAt: `2025-02-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
          speakerNames: ['Speaker'],
        })),
      })

      const items = await widget('recent-activity')
      expect(items.length).toBeLessThanOrEqual(15)
    })
  })

  describe('fetchQuickActions', () => {
    beforeEach(() => {
      mockDashboardQuery({
        sponsors: [
          { _id: 's1', status: 'prospect' },
          { _id: 's2', status: 'contacted' },
          { _id: 's3', status: 'closed-won' },
        ],
        proposals: [
          proposalRow({ status: Status.submitted }),
          proposalRow({ status: Status.accepted }),
        ],
      })
    })

    // The phase is computed SERVER-SIDE from the domain-resolved conference
    // (the client no longer supplies a phase argument), so each case sets a
    // conference fixture whose dates land in the desired phase relative to
    // the fake system time (2025-02-15).

    it('returns phase-specific actions for planning phase', async () => {
      // CFP open (2025-01-01..2025-03-31) → planning
      const actions = await widget('quick-actions')
      expect(actions.length).toBe(6)
      const labels = actions.map((a) => a.label)
      expect(labels).toContain('Review Proposals')
      expect(labels).toContain('Manage Speakers')
    })

    it('returns phase-specific actions for execution phase', async () => {
      // Program published (2025-02-01), conference not over → execution
      setDomainConference({ ...baseConference, programDate: '2025-02-01' })
      const actions = await widget('quick-actions')
      const labels = actions.map((a) => a.label)
      expect(labels).toContain('Finalize Schedule')
      expect(labels).toContain('Ticket Sales')
    })

    it('includes badge counts from live data', async () => {
      const actions = await widget('quick-actions')
      const proposalAction = actions.find((a) => a.label === 'Review Proposals')
      expect(proposalAction?.badge).toBe(1) // 1 submitted
    })

    it('returns initialization actions before the CFP opens', async () => {
      // CFP not yet open (starts 2025-03-01) → initialization
      setDomainConference({
        ...baseConference,
        cfpStartDate: '2025-03-01',
        cfpEndDate: '2025-04-30',
      })
      const actions = await widget('quick-actions')
      expect(actions.length).toBe(6)
      const labels = actions.map((a) => a.label)
      expect(labels).toContain('Configure CFP')
    })
  })

  describe('fetchTicketSales', () => {
    /** ENTITLED but not bound yet — the one state that IS a settings fix. */
    it('returns unconfigured when an entitled conference lacks checkin IDs', async () => {
      setDomainConference({
        ...baseConference,
        organization: { _ref: 'org-test', _type: 'reference' },
      } as Conference)
      mockGetOrganizationById.mockResolvedValue({
        _id: 'org-test',
        name: 'Tenant',
        slug: 'tenant',
        plan: 'pro',
      })

      const result = await widget('ticket-sales')
      expect(result).toEqual({ status: 'unconfigured' })
      expect(mockFetchEventTickets).not.toHaveBeenCalled()
    })

    it('queries Checkin with the DOMAIN conference ids only', async () => {
      const confWithTickets: Conference = {
        ...baseConference,
        checkinCustomerId: 123,
        checkinEventId: 456,
        ticketCapacity: 500,
      }
      setDomainConference(confWithTickets)

      const result = await widget('ticket-sales')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') throw new Error('expected ok result')
      expect(result.data.capacity).toBe(500)
      expect(result.data.milestones).toHaveLength(3)
      expect(result.data.milestones[0].name).toBe('Early Bird')
      // The checkin customer/event ids come from the resolved conference —
      // there is no client argument that could point the server's Checkin
      // credentials at another account.
      expect(mockFetchEventTickets).toHaveBeenCalledWith({
        customerId: 123,
        eventId: 456,
      })
    })

    /**
     * THE KILL SWITCH REACHES THE DASHBOARD TILE. An explicit operator deny
     * blocks the ticket pages; a widget that kept streaming live sales for the
     * same organization would make it a half-switch. Reported as its own status
     * so the tile does not tell a denied org to go and configure something.
     */
    it('returns disabled — and never fetches — when an operator has denied ticketing', async () => {
      setDomainConference({
        ...baseConference,
        checkinCustomerId: 123,
        checkinEventId: 456,
        organization: { _ref: 'org-test', _type: 'reference' },
      } as Conference)
      mockGetOrganizationById.mockResolvedValue({
        _id: 'org-test',
        name: 'Tenant',
        slug: 'tenant',
        plan: 'pro',
        featureOverrides: [{ feature: 'ticketing', enabled: false }],
      })

      const result = await widget('ticket-sales')
      expect(result).toEqual({ status: 'disabled' })
      expect(mockFetchEventTickets).not.toHaveBeenCalled()
    })

    /**
     * NOT "unconfigured": ticketing is sold from the entry paid tier, so a
     * community org has nothing to connect. Telling it to go and configure a
     * provider is the dead end #828 set out to remove.
     */
    it('returns unavailable for an organization that does not have ticketing', async () => {
      setDomainConference({
        ...baseConference,
        organization: { _ref: 'org-test', _type: 'reference' },
      } as Conference)
      mockGetOrganizationById.mockResolvedValue({
        _id: 'org-test',
        name: 'Tenant',
        slug: 'tenant',
        plan: 'community',
      })

      const result = await widget('ticket-sales')
      expect(result).toEqual({ status: 'unavailable' })
      expect(mockFetchEventTickets).not.toHaveBeenCalled()
    })

    it('returns error (not unconfigured) when the ticket API fails', async () => {
      setDomainConference({
        ...baseConference,
        checkinCustomerId: 123,
        checkinEventId: 456,
      })
      mockFetchEventTickets.mockRejectedValueOnce(new Error('API down'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await widget('ticket-sales')
      expect(result).toEqual({ status: 'error' })
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('Dashboard Config Persistence', () => {
    // Length-prefixed ('conf-1'.length = 6) so ids containing '-' stay unambiguous.
    const PERSONAL_ID = 'dashboardConfig-6-conf-1-speaker-1'

    const storedWidget = (overrides: Record<string, unknown> = {}) => ({
      _key: 'widget-0',
      widgetId: 'w1',
      widgetType: 'quick-actions',
      title: 'Quick Actions',
      row: 0,
      col: 0,
      rowSpan: 2,
      colSpan: 3,
      ...overrides,
    })

    const validWidget = (
      overrides: Partial<SerializedWidget> = {},
    ): SerializedWidget => ({
      id: 'w1',
      type: 'quick-actions',
      title: 'Quick Actions',
      position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
      ...overrides,
    })

    describe('loadDashboardConfig', () => {
      it('returns null when neither a personal nor a legacy doc exists', async () => {
        const result = await loadDashboardConfig()
        expect(result).toBeNull()
        // Fallback chain: personal doc by deterministic id, then legacy doc
        expect(mockClientWriteFetch).toHaveBeenCalledTimes(2)
        expect(mockClientWriteFetch.mock.calls[0][1]).toEqual({
          id: PERSONAL_ID,
        })
        expect(mockClientWriteFetch.mock.calls[1][0]).toContain(
          '!defined(speaker)',
        )
      })

      it('returns the personal doc without consulting the legacy doc', async () => {
        mockClientWriteFetch.mockResolvedValueOnce({
          _id: PERSONAL_ID,
          _type: 'dashboardConfig',
          conference: { _ref: 'conf-1', _type: 'reference' },
          speaker: { _ref: 'speaker-1', _type: 'reference' },
          widgets: [storedWidget()],
        })

        const result = await loadDashboardConfig()
        expect(result).toEqual([
          {
            id: 'w1',
            type: 'quick-actions',
            title: 'Quick Actions',
            position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
            config: undefined,
          },
        ])
        expect(mockClientWriteFetch).toHaveBeenCalledTimes(1)
      })

      it('falls back to the legacy shared doc when no personal doc exists', async () => {
        mockClientWriteFetch
          .mockResolvedValueOnce(null) // personal
          .mockResolvedValueOnce({
            _id: 'legacy-config',
            _type: 'dashboardConfig',
            conference: { _ref: 'conf-1', _type: 'reference' },
            widgets: [storedWidget({ widgetId: 'legacy-w1' })],
          })

        const result = await loadDashboardConfig()
        expect(result).toEqual([expect.objectContaining({ id: 'legacy-w1' })])
      })

      it('returns [] for an EMPTY personal doc (deliberately cleared layout)', async () => {
        mockClientWriteFetch.mockResolvedValueOnce({
          _id: PERSONAL_ID,
          _type: 'dashboardConfig',
          conference: { _ref: 'conf-1', _type: 'reference' },
          speaker: { _ref: 'speaker-1', _type: 'reference' },
          widgets: [],
        })

        const result = await loadDashboardConfig()
        expect(result).toEqual([])
        // The legacy default must NOT override a deliberate empty layout
        expect(mockClientWriteFetch).toHaveBeenCalledTimes(1)
      })

      it('returns null for an empty LEGACY doc (falls through to preset)', async () => {
        mockClientWriteFetch
          .mockResolvedValueOnce(null) // personal
          .mockResolvedValueOnce({
            _id: 'legacy-config',
            _type: 'dashboardConfig',
            conference: { _ref: 'conf-1', _type: 'reference' },
            widgets: [],
          })

        const result = await loadDashboardConfig()
        expect(result).toBeNull()
      })

      it('keeps tolerating unknown STORED widget types (load is lenient)', async () => {
        mockClientWriteFetch.mockResolvedValueOnce({
          _id: PERSONAL_ID,
          _type: 'dashboardConfig',
          conference: { _ref: 'conf-1', _type: 'reference' },
          speaker: { _ref: 'speaker-1', _type: 'reference' },
          widgets: [storedWidget({ widgetType: 'retired-widget' })],
        })

        const result = await loadDashboardConfig()
        expect(result).toEqual([
          expect.objectContaining({ type: 'retired-widget' }),
        ])
      })

      it('rejects when the caller is not an organizer', async () => {
        mockGetAuthSession.mockResolvedValue({
          user: { name: 'User', email: 'user@test.com' },
          expires: '2099-01-01T00:00:00Z',
          // Organizes no org at all, so the request's org is not in the set.
          speaker: {
            _id: 'speaker-1',
            isOrganizer: false,
            organizerOrgIds: [],
          },
        })

        await expect(loadDashboardConfig()).rejects.toThrow(/Unauthorized/)
      })
    })

    describe('saveDashboardConfig', () => {
      it('createOrReplaces the personal doc with a deterministic _id and speaker ref', async () => {
        await saveDashboardConfig([
          validWidget({ config: { showTrend: true } }),
        ])

        expect(mockCreateOrReplace).toHaveBeenCalledTimes(1)
        expect(mockCreateOrReplace).toHaveBeenCalledWith({
          _id: PERSONAL_ID,
          _type: 'dashboardConfig',
          conference: { _ref: 'conf-1', _type: 'reference' },
          speaker: { _ref: 'speaker-1', _type: 'reference' },
          widgets: [
            {
              _key: 'widget-0',
              widgetId: 'w1',
              widgetType: 'quick-actions',
              title: 'Quick Actions',
              row: 0,
              col: 0,
              rowSpan: 2,
              colSpan: 3,
              config: JSON.stringify({ showTrend: true }),
            },
          ],
        })
      })

      it('NEVER touches the legacy doc: no fetch-then-patch, no create', async () => {
        await saveDashboardConfig([validWidget()])

        // No lookup of an existing doc (the deterministic id kills the
        // fetch-then-create race) and no writes via patch/create.
        expect(mockClientWriteFetch).not.toHaveBeenCalled()
        expect(mockPatch).not.toHaveBeenCalled()
        expect(mockCreate).not.toHaveBeenCalled()
      })

      it('persists a deliberately EMPTY layout', async () => {
        await saveDashboardConfig([])
        expect(mockCreateOrReplace).toHaveBeenCalledWith(
          expect.objectContaining({ _id: PERSONAL_ID, widgets: [] }),
        )
      })

      it('rejects unknown widget types on save', async () => {
        await expect(
          saveDashboardConfig([validWidget({ type: 'not-a-widget' })]),
        ).rejects.toThrow(/unknown widget type/)
        expect(mockCreateOrReplace).not.toHaveBeenCalled()
      })

      it('rejects oversized spans and out-of-range positions', async () => {
        await expect(
          saveDashboardConfig([
            validWidget({
              position: { row: 0, col: 0, rowSpan: 25, colSpan: 3 },
            }),
          ]),
        ).rejects.toThrow(/rowSpan/)

        await expect(
          saveDashboardConfig([
            validWidget({
              position: { row: 0, col: 0, rowSpan: 2, colSpan: 13 },
            }),
          ]),
        ).rejects.toThrow(/colSpan/)

        await expect(
          saveDashboardConfig([
            validWidget({
              position: { row: 501, col: 0, rowSpan: 2, colSpan: 3 },
            }),
          ]),
        ).rejects.toThrow(/row/)

        await expect(
          saveDashboardConfig([
            validWidget({
              position: { row: 0, col: 12, rowSpan: 2, colSpan: 3 },
            }),
          ]),
        ).rejects.toThrow(/col/)

        await expect(
          saveDashboardConfig([
            validWidget({
              position: { row: 1.5, col: 0, rowSpan: 2, colSpan: 3 },
            }),
          ]),
        ).rejects.toThrow(/row/)

        expect(mockCreateOrReplace).not.toHaveBeenCalled()
      })

      it('rejects spans outside the widget type’s registry constraints', async () => {
        // quick-actions: minCols 3, maxCols 6, minRows 2, maxRows 4 — all of
        // these pass the GENERIC bounds but violate the per-widget ones.
        await expect(
          saveDashboardConfig([
            validWidget({
              position: { row: 0, col: 0, rowSpan: 2, colSpan: 2 },
            }),
          ]),
        ).rejects.toThrow(/"quick-actions" colSpan must be between 3 and 6/)

        await expect(
          saveDashboardConfig([
            validWidget({
              position: { row: 0, col: 0, rowSpan: 5, colSpan: 3 },
            }),
          ]),
        ).rejects.toThrow(/"quick-actions" rowSpan must be between 2 and 4/)

        await expect(
          saveDashboardConfig([
            validWidget({
              position: { row: 0, col: 0, rowSpan: 2, colSpan: 7 },
            }),
          ]),
        ).rejects.toThrow(/"quick-actions" colSpan must be between 3 and 6/)

        expect(mockCreateOrReplace).not.toHaveBeenCalled()
      })

      it('accepts spans exactly at the widget type’s registry minima', async () => {
        await saveDashboardConfig([
          validWidget({ position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 } }),
        ])
        expect(mockCreateOrReplace).toHaveBeenCalledTimes(1)
      })

      it('rejects more than 40 widgets', async () => {
        const widgets = Array.from({ length: 41 }, (_, i) =>
          validWidget({ id: `w${i}` }),
        )
        await expect(saveDashboardConfig(widgets)).rejects.toThrow(
          /at most 40 widgets/,
        )
        expect(mockCreateOrReplace).not.toHaveBeenCalled()
      })

      it('rejects a widget config over 8 KB serialized', async () => {
        await expect(
          saveDashboardConfig([
            validWidget({ config: { blob: 'x'.repeat(9000) } }),
          ]),
        ).rejects.toThrow(/8192 bytes/)
        expect(mockCreateOrReplace).not.toHaveBeenCalled()
      })

      it('rejects an over-long title', async () => {
        await expect(
          saveDashboardConfig([validWidget({ title: 'x'.repeat(201) })]),
        ).rejects.toThrow(/title/)
        expect(mockCreateOrReplace).not.toHaveBeenCalled()
      })

      it('rejects when the caller is not an organizer', async () => {
        mockGetAuthSession.mockResolvedValue({
          user: { name: 'User', email: 'user@test.com' },
          expires: '2099-01-01T00:00:00Z',
          // Organizes no org at all, so the request's org is not in the set.
          speaker: {
            _id: 'speaker-1',
            isOrganizer: false,
            organizerOrgIds: [],
          },
        })

        await expect(saveDashboardConfig([validWidget()])).rejects.toThrow(
          /Unauthorized/,
        )
        expect(mockCreateOrReplace).not.toHaveBeenCalled()
      })
    })
  })
})
