/**
 * Dashboard Server Actions Tests
 *
 * Tests the data transformation layer that sits between domain data
 * and dashboard widgets. Each server action fetches from the domain
 * layer and reshapes data for widget consumption.
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

// Proposals
const mockGetProposals = vi.fn<AnyFn>()
vi.mock('@/lib/proposal/server', () => ({
  getProposals: (...args: unknown[]) => mockGetProposals(...args),
}))

// Speakers
const mockGetSpeakers = vi.fn<AnyFn>()
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: (...args: unknown[]) => mockGetSpeakers(...args),
}))

const mockGetFeaturedSpeakers = vi.fn<AnyFn>()
vi.mock('@/lib/featured/sanity', () => ({
  getFeaturedSpeakers: (...args: unknown[]) => mockGetFeaturedSpeakers(...args),
}))

// Sponsors
const mockListSponsors = vi.fn<AnyFn>()
vi.mock('@/lib/sponsor-crm/sanity', () => ({
  listSponsorsForConference: (...args: unknown[]) => mockListSponsors(...args),
}))

vi.mock('@/lib/sponsor-crm/pipeline', () => ({
  aggregateSponsorPipeline: vi.fn(() => ({
    byStatus: { prospect: 3, contacted: 2, negotiating: 1, 'closed-won': 1 },
    byStatusValue: {
      prospect: 0,
      contacted: 50000,
      negotiating: 100000,
      'closed-won': 200000,
    },
    totalContractValue: 350000,
    closedWonCount: 1,
    closedLostCount: 0,
  })),
}))

const mockListActivities = vi.fn<AnyFn>()
vi.mock('@/lib/sponsor-crm/activities', () => ({
  listActivitiesForConference: (...args: unknown[]) =>
    mockListActivities(...args),
}))

// Tickets
const mockFetchEventTickets = vi.fn<AnyFn>()
vi.mock('@/lib/tickets/api', () => ({
  fetchEventTickets: (...args: unknown[]) => mockFetchEventTickets(...args),
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

// Travel support
const mockGetAllTravelSupport = vi.fn<AnyFn>()
vi.mock('@/lib/travel-support/sanity', () => ({
  getAllTravelSupport: (...args: unknown[]) => mockGetAllTravelSupport(...args),
}))

// Workshops
const mockGetWorkshopStatistics = vi.fn<AnyFn>()
vi.mock('@/lib/workshop/sanity', () => ({
  getWorkshopStatistics: (...args: unknown[]) =>
    mockGetWorkshopStatistics(...args),
}))

// Sanity client (dashboard config persistence + trimmed dashboard reads)
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

// Conference resolution — the persistence actions never accept a client
// conferenceId; they resolve it from the request domain like the tRPC routers.
const mockResolveConferenceId = vi.fn<AnyFn>()
vi.mock('@/server/trpc', () => ({
  resolveConferenceId: (...args: unknown[]) => mockResolveConferenceId(...args),
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
import type { SerializedWidget } from '@/app/(admin)/admin/actions'

// vi.mock calls are hoisted automatically by Vitest
import {
  fetchDeadlines,
  fetchCFPHealth,
  fetchProposalPipeline,
  fetchReviewProgress,
  fetchSponsorPipelineData,
  fetchSpeakerEngagement,
  fetchTravelSupport,
  fetchWorkshopCapacity,
  fetchScheduleStatus,
  fetchRecentActivity,
  fetchQuickActions,
  fetchTicketSales,
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

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    _id: `proposal-${Math.random().toString(36).slice(2)}`,
    _rev: 'rev1',
    _type: 'talk',
    _createdAt: '2025-02-15T10:00:00Z',
    _updatedAt: '2025-02-15T10:00:00Z',
    title: 'Test Talk',
    description: [],
    language: 'en',
    format: 'presentation',
    level: 'intermediate',
    audiences: [],
    outline: 'Outline',
    tos: true,
    status: Status.submitted,
    speakers: [{ name: 'Speaker One' }],
    conference: { _ref: 'conf-1' },
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
    mockClientReadFetch.mockResolvedValue([])
    mockClientWriteFetch.mockResolvedValue(null)
    mockCreateOrReplace.mockResolvedValue({ _id: 'personal-config' })
    mockResolveConferenceId.mockResolvedValue('conf-1')
    mockGetAuthSession.mockResolvedValue({
      user: { name: 'Admin', email: 'admin@test.com' },
      expires: '2099-01-01T00:00:00Z',
      speaker: { _id: 'speaker-1', isOrganizer: true },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('fetchDeadlines', () => {
    it('returns deadlines sorted by days remaining ascending', async () => {
      const deadlines = await fetchDeadlines(baseConference)
      const daysValues = deadlines.map((d) => d.daysRemaining)
      expect(daysValues).toEqual([...daysValues].sort((a, b) => a - b))
    })

    it('assigns urgency levels based on days remaining', async () => {
      const confSoon: Conference = {
        ...baseConference,
        cfpEndDate: '2025-02-20', // 5 days → high
        cfpNotifyDate: '2025-03-10', // 23 days → medium
        programDate: '2025-04-20', // 64 days → low
        startDate: '2025-06-01', // 106 days → low
      }
      const deadlines = await fetchDeadlines(confSoon)
      const urgencyMap = Object.fromEntries(
        deadlines.map((d) => [d.name, d.urgency]),
      )

      expect(urgencyMap['CFP Closes']).toBe('high')
      expect(urgencyMap['Notify Speakers']).toBe('medium')
      expect(urgencyMap['Conference Day']).toBe('low')
    })

    it('excludes past deadlines (negative days remaining)', async () => {
      const deadlines = await fetchDeadlines(baseConference)
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
      const deadlines = await fetchDeadlines(pastConf)
      expect(deadlines).toHaveLength(0)
    })
  })

  describe('fetchCFPHealth', () => {
    it('computes submission count excluding drafts', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({ status: Status.submitted }),
          makeProposal({ status: Status.accepted }),
          makeProposal({ status: Status.draft }),
        ],
        proposalsError: null,
      })

      const health = await fetchCFPHealth(baseConference)
      expect(health.totalSubmissions).toBe(2) // excludes draft
    })

    it('computes average submissions per day since CFP opened', async () => {
      // CFP started 2025-01-01, now is 2025-02-15 = 45 days
      const proposals = Array.from({ length: 45 }, (_, i) =>
        makeProposal({
          status: Status.submitted,
          _createdAt: `2025-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        }),
      )
      mockGetProposals.mockResolvedValue({
        proposals,
        proposalsError: null,
      })

      const health = await fetchCFPHealth(baseConference)
      expect(health.averagePerDay).toBe(1)
      expect(health.totalSubmissions).toBe(45)
    })

    it('groups submissions by format', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({ status: Status.submitted, format: 'presentation' }),
          makeProposal({ status: Status.submitted, format: 'presentation' }),
          makeProposal({ status: Status.submitted, format: 'lightning' }),
        ],
        proposalsError: null,
      })

      const health = await fetchCFPHealth(baseConference)
      expect(health.formatDistribution).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ format: 'Presentation', count: 2 }),
          expect.objectContaining({ format: 'Lightning', count: 1 }),
        ]),
      )
    })

    it('handles zero submissions', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })

      const health = await fetchCFPHealth(baseConference)
      expect(health.totalSubmissions).toBe(0)
      expect(health.averagePerDay).toBe(0)
      expect(health.formatDistribution).toHaveLength(0)
    })
  })

  describe('fetchProposalPipeline', () => {
    it('computes correct status counts and acceptance rate', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({ status: Status.submitted }),
          makeProposal({ status: Status.submitted }),
          makeProposal({ status: Status.accepted }),
          makeProposal({ status: Status.confirmed }),
          makeProposal({ status: Status.rejected }),
          makeProposal({ status: Status.draft }), // excluded
        ],
        proposalsError: null,
      })

      const pipeline = await fetchProposalPipeline('conf-1')

      expect(pipeline.submitted).toBe(5) // non-draft total
      expect(pipeline.accepted).toBe(1)
      expect(pipeline.confirmed).toBe(1)
      expect(pipeline.rejected).toBe(1)
      expect(pipeline.pendingDecisions).toBe(2)
      // acceptanceRate = (accepted + confirmed) / submitted * 100 = 2/5 * 100 = 40
      expect(pipeline.acceptanceRate).toBe(40)
    })

    it('counts distinct speakers across confirmed talks only, deduped', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({
            status: Status.confirmed,
            speakers: [{ _id: 'sp-1', name: 'Alice' }],
          }),
          makeProposal({
            status: Status.confirmed,
            // Alice co-speaks again + Bob — Alice must not double count
            speakers: [
              { _id: 'sp-1', name: 'Alice' },
              { _id: 'sp-2', name: 'Bob' },
            ],
          }),
          makeProposal({
            // accepted (not confirmed) — excluded from the speaker count
            status: Status.accepted,
            speakers: [{ _id: 'sp-3', name: 'Carol' }],
          }),
        ],
        proposalsError: null,
      })

      const pipeline = await fetchProposalPipeline('conf-1')
      expect(pipeline.distinctSpeakers).toBe(2) // Alice + Bob
    })

    it('returns zero acceptance rate when no proposals', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })

      const pipeline = await fetchProposalPipeline('conf-1')
      expect(pipeline.submitted).toBe(0)
      expect(pipeline.acceptanceRate).toBe(0)
    })

    it('handles all-draft proposals', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({ status: Status.draft }),
          makeProposal({ status: Status.draft }),
        ],
        proposalsError: null,
      })

      const pipeline = await fetchProposalPipeline('conf-1')
      expect(pipeline.submitted).toBe(0)
      expect(pipeline.acceptanceRate).toBe(0)
    })
  })

  describe('fetchReviewProgress', () => {
    // fetchReviewProgress uses a trimmed GROQ projection (status + review
    // scores only, drafts excluded in the query) via the read client.
    const reviewRow = (overrides: Record<string, unknown> = {}) => ({
      _id: `proposal-${Math.random().toString(36).slice(2)}`,
      title: 'Test Talk',
      status: Status.submitted,
      reviews: [],
      ...overrides,
    })

    it('computes percentage of reviewed proposals', async () => {
      mockClientReadFetch.mockResolvedValue([
        reviewRow({
          reviews: [{ score: { content: 4, relevance: 4, speaker: 4 } }],
        }),
        reviewRow({ reviews: [] }),
        reviewRow({ reviews: undefined }),
      ])

      const progress = await fetchReviewProgress('conf-1')
      // 3 non-draft, 1 has reviews
      expect(progress.totalProposals).toBe(3)
      expect(progress.reviewedCount).toBe(1)
      expect(progress.percentage).toBeCloseTo(33.33, 0)
    })

    it('requests only a trimmed projection without reviewer joins', async () => {
      mockClientReadFetch.mockResolvedValue([])
      await fetchReviewProgress('conf-1')

      expect(mockClientReadFetch).toHaveBeenCalledTimes(1)
      const [query] = mockClientReadFetch.mock.calls[0]
      expect(query).toContain('{ score }')
      expect(query).not.toContain('reviewer')
      expect(query).toContain('status != "draft"')
    })

    it('finds the next unreviewed submitted proposal', async () => {
      mockClientReadFetch.mockResolvedValue([
        reviewRow({
          _id: 'reviewed-1',
          reviews: [{ score: { content: 3, relevance: 3, speaker: 3 } }],
        }),
        reviewRow({
          _id: 'unreviewed-1',
          title: 'Needs Review',
          reviews: [],
        }),
      ])

      const progress = await fetchReviewProgress('conf-1')
      expect(progress.nextUnreviewed).toEqual({
        id: 'unreviewed-1',
        title: 'Needs Review',
      })
    })

    it('returns no nextUnreviewed when all are reviewed', async () => {
      mockClientReadFetch.mockResolvedValue([
        reviewRow({
          reviews: [{ score: { content: 5, relevance: 5, speaker: 5 } }],
        }),
      ])

      const progress = await fetchReviewProgress('conf-1')
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

      mockGetFeaturedSpeakers.mockResolvedValue({
        speakers: [{ _id: 'f1' }],
      })

      const data = await fetchSpeakerEngagement('conf-1')
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
    })

    it('handles zero speakers', async () => {
      mockGetSpeakers.mockResolvedValue({ speakers: [], err: null })
      mockGetFeaturedSpeakers.mockResolvedValue({ speakers: [] })

      const data = await fetchSpeakerEngagement('conf-1')
      expect(data.totalSpeakers).toBe(0)
      expect(data.averageProposalsPerSpeaker).toBe(0)
    })
  })

  describe('fetchTravelSupport', () => {
    it('aggregates travel support budgets and counts', async () => {
      const confWithBudget = { ...baseConference, travelSupportBudget: 50000 }

      mockGetAllTravelSupport.mockResolvedValue({
        travelSupports: [
          {
            _id: 'ts1',
            _createdAt: '2025-02-01T10:00:00Z',
            status: 'submitted',
            totalAmount: 5000,
            expenses: [{ amount: 3000 }, { amount: 2000 }],
            speaker: { name: 'Alice' },
          },
          {
            _id: 'ts2',
            _createdAt: '2025-02-02T10:00:00Z',
            status: 'approved',
            totalAmount: 8000,
            approvedAmount: 7500,
            expenses: [{ amount: 8000 }],
            speaker: { name: 'Bob' },
          },
          {
            _id: 'ts3',
            _createdAt: '2025-02-03T10:00:00Z',
            status: 'paid',
            totalAmount: 3000,
            approvedAmount: 3000,
            expenses: [{ amount: 3000 }],
            speaker: { name: 'Carol' },
          },
        ],
        error: null,
      })

      const data = await fetchTravelSupport(confWithBudget)
      expect(data.pendingApprovals).toBe(1) // submitted only
      expect(data.approvedCount).toBe(2) // approved + paid
      expect(data.totalRequested).toBe(16000) // 5000+8000+3000
      expect(data.totalApproved).toBe(10500) // 7500+3000 (approved+paid)
      expect(data.budgetAllocated).toBe(50000)
      expect(data.averageRequest).toBeCloseTo(5333.33, 0)
      expect(data.requests).toHaveLength(1) // top 5 pending
      expect(data.requests[0].speaker).toBe('Alice')
    })

    it('returns zero budget when conference has no travel_support_budget', async () => {
      mockGetAllTravelSupport.mockResolvedValue({
        travelSupports: [],
        error: null,
      })

      const data = await fetchTravelSupport(baseConference)
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

      const result = await fetchWorkshopCapacity('conf-1')
      expect(result).toEqual(mockStats)
      expect(mockGetWorkshopStatistics).toHaveBeenCalledWith('conf-1')
    })
  })

  describe('fetchSponsorPipelineData', () => {
    it('maps pipeline stages and formats activities', async () => {
      mockListSponsors.mockResolvedValue({
        sponsors: [{ _id: 's1', status: 'prospect' }],
        error: null,
      })
      mockListActivities.mockResolvedValue({
        activities: [
          {
            _id: 'a1',
            description: 'Sent proposal',
            createdAt: '2025-02-14T10:00:00Z',
            _createdAt: '2025-02-14T10:00:00Z',
            sponsorForConference: { sponsor: { name: 'Acme Corp' } },
            createdBy: { name: 'Admin' },
          },
        ],
        error: null,
      })

      const data = await fetchSponsorPipelineData('conf-1', 500000)

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

      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({ _id: 'talk-1', status: Status.confirmed }),
          makeProposal({ _id: 'talk-2', status: Status.confirmed }),
          makeProposal({ _id: 'talk-3', status: Status.confirmed }), // unassigned
          makeProposal({ _id: 'talk-4', status: Status.accepted }), // unassigned
        ],
        proposalsError: null,
      })

      const data = await fetchScheduleStatus(confWithSchedule)
      expect(data.totalSlots).toBe(4)
      expect(data.filledSlots).toBe(2)
      expect(data.placeholderSlots).toBe(1)
      expect(data.percentage).toBe(50)
      expect(data.unassignedConfirmedTalks).toBe(2) // talk-3 + talk-4
      expect(data.byDay).toHaveLength(1)
    })

    it('handles conference with no schedules', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })

      const data = await fetchScheduleStatus(baseConference)
      expect(data.totalSlots).toBe(0)
      expect(data.filledSlots).toBe(0)
      expect(data.percentage).toBe(0)
      expect(data.byDay).toHaveLength(0)
    })
  })

  describe('fetchRecentActivity', () => {
    // Proposals come from an ordered + limited GROQ query (read client),
    // not from the full getProposals corpus.
    it('merges sponsor activities and proposals sorted by date', async () => {
      mockListActivities.mockResolvedValue({
        activities: [
          {
            _id: 'a1',
            description: 'Contacted sponsor',
            createdAt: '2025-02-14T10:00:00Z',
            _createdAt: '2025-02-14T10:00:00Z',
            sponsorForConference: { sponsor: { name: 'Acme' } },
            createdBy: { name: 'Admin' },
          },
        ],
        error: null,
      })

      mockClientReadFetch.mockResolvedValue([
        {
          _id: 'p1',
          title: 'Latest Talk',
          _createdAt: '2025-02-15T09:00:00Z',
          speakers: [{ name: 'Speaker A' }],
        },
      ])

      const items = await fetchRecentActivity('conf-1')
      expect(items.length).toBeGreaterThanOrEqual(2)
      // Most recent first
      expect(items[0].type).toBe('proposal') // Feb 15
      expect(items[1].type).toBe('sponsor') // Feb 14
      expect(items[0].user).toBe('Speaker A')
    })

    it('pushes ordering and limits into the proposal query', async () => {
      mockListActivities.mockResolvedValue({ activities: [], error: null })
      mockClientReadFetch.mockResolvedValue([])

      await fetchRecentActivity('conf-1')

      const [query] = mockClientReadFetch.mock.calls[0]
      expect(query).toContain('order(_createdAt desc)')
      expect(query).toContain('[0...5]')
      // Bounded activity fetch on the other source
      expect(mockListActivities).toHaveBeenCalledWith('conf-1', 15)
    })

    it('returns at most 15 items', async () => {
      mockListActivities.mockResolvedValue({
        activities: Array.from({ length: 15 }, (_, i) => ({
          _id: `a${i}`,
          description: `Activity ${i}`,
          createdAt: `2025-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
          _createdAt: `2025-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
          sponsorForConference: { sponsor: { name: 'Sponsor' } },
          createdBy: { name: 'Admin' },
        })),
        error: null,
      })

      mockClientReadFetch.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          _id: `p${i}`,
          title: `Talk ${i}`,
          _createdAt: `2025-02-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
          speakers: [{ name: 'Speaker' }],
        })),
      )

      const items = await fetchRecentActivity('conf-1')
      expect(items.length).toBeLessThanOrEqual(15)
    })
  })

  describe('fetchQuickActions', () => {
    beforeEach(() => {
      mockListSponsors.mockResolvedValue({
        sponsors: [
          { status: 'prospect' },
          { status: 'contacted' },
          { status: 'closed-won' },
        ],
        error: null,
      })
      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({ status: Status.submitted }),
          makeProposal({ status: Status.accepted }),
        ],
        proposalsError: null,
      })
    })

    it('returns phase-specific actions for planning phase', async () => {
      const actions = await fetchQuickActions(baseConference, 'planning')
      expect(actions.length).toBe(6)
      const labels = actions.map((a) => a.label)
      expect(labels).toContain('Review Proposals')
      expect(labels).toContain('Manage Speakers')
    })

    it('returns phase-specific actions for execution phase', async () => {
      const actions = await fetchQuickActions(baseConference, 'execution')
      const labels = actions.map((a) => a.label)
      expect(labels).toContain('Finalize Schedule')
      expect(labels).toContain('Ticket Sales')
    })

    it('includes badge counts from live data', async () => {
      const actions = await fetchQuickActions(baseConference, 'planning')
      const proposalAction = actions.find((a) => a.label === 'Review Proposals')
      expect(proposalAction?.badge).toBe(1) // 1 submitted
    })

    it('falls back to planning actions for unknown phase', async () => {
      const actions = await fetchQuickActions(baseConference, 'unknown-phase')
      expect(actions.length).toBe(6) // planning has 6 actions
    })
  })

  describe('fetchTicketSales', () => {
    it('returns unconfigured when conference lacks checkin IDs', async () => {
      const result = await fetchTicketSales(baseConference)
      expect(result).toEqual({ status: 'unconfigured' })
    })

    it('returns ok with ticket data when conference has checkin IDs', async () => {
      const confWithTickets: Conference = {
        ...baseConference,
        checkinCustomerId: 123,
        checkinEventId: 456,
        ticketCapacity: 500,
      }

      const result = await fetchTicketSales(confWithTickets)
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') throw new Error('expected ok result')
      expect(result.data.capacity).toBe(500)
      expect(result.data.milestones).toHaveLength(3)
      expect(result.data.milestones[0].name).toBe('Early Bird')
    })

    it('returns error (not unconfigured) when the ticket API fails', async () => {
      const confWithTickets: Conference = {
        ...baseConference,
        checkinCustomerId: 123,
        checkinEventId: 456,
      }
      mockFetchEventTickets.mockRejectedValueOnce(new Error('API down'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await fetchTicketSales(confWithTickets)
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
          speaker: { _id: 'speaker-1', isOrganizer: false },
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
          speaker: { _id: 'speaker-1', isOrganizer: false },
        })

        await expect(saveDashboardConfig([validWidget()])).rejects.toThrow(
          /Unauthorized/,
        )
        expect(mockCreateOrReplace).not.toHaveBeenCalled()
      })
    })
  })
})
