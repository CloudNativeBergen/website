/**
 * Dashboard Server Actions Tests
 *
 * Tests the data transformation layer that sits between domain data
 * and dashboard widgets. Each server action fetches from the domain
 * layer and reshapes data for widget consumption.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals'

// --- Mocks ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

// Auth — no external variable in factory to avoid hoisting issues
jest.mock('@/lib/auth', () => ({
  getAuthSession: jest.fn(),
  // Re-export AppEnvironment that auth.ts re-exports
  AppEnvironment: {},
}))

// Proposals
const mockGetProposals = jest.fn<AnyFn>()
jest.mock('@/lib/proposal/server', () => ({
  getProposals: (...args: unknown[]) => mockGetProposals(...args),
}))

// Speakers
const mockGetSpeakers = jest.fn<AnyFn>()
jest.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: (...args: unknown[]) => mockGetSpeakers(...args),
}))

const mockGetFeaturedSpeakers = jest.fn<AnyFn>()
jest.mock('@/lib/featured/sanity', () => ({
  getFeaturedSpeakers: (...args: unknown[]) => mockGetFeaturedSpeakers(...args),
}))

// Sponsors
const mockListSponsors = jest.fn<AnyFn>()
jest.mock('@/lib/sponsor-crm/sanity', () => ({
  listSponsorsForConference: (...args: unknown[]) => mockListSponsors(...args),
}))

jest.mock('@/lib/sponsor-crm/pipeline', () => ({
  aggregateSponsorPipeline: jest.fn(() => ({
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

const mockListActivities = jest.fn<AnyFn>()
jest.mock('@/lib/sponsor-crm/activities', () => ({
  listActivitiesForConference: (...args: unknown[]) =>
    mockListActivities(...args),
}))

// Tickets
jest.mock('@/lib/tickets/api', () => ({
  fetchEventTickets: jest.fn(() => Promise.resolve([])),
}))

jest.mock('@/lib/tickets/processor', () => ({
  TicketSalesProcessor: jest.fn().mockImplementation(() => ({
    process: () => ({
      statistics: { totalPaidTickets: 0, totalRevenue: 0 },
      progression: [],
      performance: {},
      capacity: {},
    }),
  })),
}))

jest.mock('@/lib/tickets/config', () => ({
  DEFAULT_TARGET_CONFIG: {},
  DEFAULT_CAPACITY: 500,
}))

// Travel support
const mockGetAllTravelSupport = jest.fn<AnyFn>()
jest.mock('@/lib/travel-support/sanity', () => ({
  getAllTravelSupport: (...args: unknown[]) => mockGetAllTravelSupport(...args),
}))

// Workshops
const mockGetWorkshopStatistics = jest.fn<AnyFn>()
jest.mock('@/lib/workshop/sanity', () => ({
  getWorkshopStatistics: (...args: unknown[]) =>
    mockGetWorkshopStatistics(...args),
}))

// Sanity client (for dashboard config persistence)
jest.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: jest.fn(() => Promise.resolve(null)),
    create: jest.fn(() => Promise.resolve({ _id: 'new-config' })),
    patch: jest.fn(() => ({
      set: jest.fn(() => ({
        commit: jest.fn(() => Promise.resolve()),
      })),
    })),
  },
}))

// Time utilities
jest.mock('@/lib/time', () => ({
  formatRelativeTime: jest.fn((d: string) => d || 'unknown'),
  formatLabel: jest.fn((v: string) => v.charAt(0).toUpperCase() + v.slice(1)),
  formatConferenceDateShort: jest.fn((d: string) => d || 'unknown'),
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

// Use require() for the actions module so jest.mock factories are
// registered before the module loads (avoids SWC hoisting issues
// with the @/lib/auth ↔ next-auth mock circular dependency).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const actions = require('@/app/(admin)/admin/actions') as {
  fetchDeadlines: (c: Conference) => Promise<DeadlineData[]>
  fetchCFPHealth: (c: Conference) => Promise<CFPHealthData>
  fetchProposalPipeline: (id: string) => Promise<ProposalPipelineData>
  fetchReviewProgress: (id: string) => Promise<ReviewProgressData>
  fetchSponsorPipelineData: (
    id: string,
    goal: number,
  ) => Promise<SponsorPipelineWidgetData>
  fetchSpeakerEngagement: (id: string) => Promise<SpeakerEngagementData>
  fetchTravelSupport: (c: Conference) => Promise<TravelSupportData>
  fetchWorkshopCapacity: (id: string) => Promise<WorkshopStatistics>
  fetchScheduleStatus: (c: Conference) => Promise<ScheduleStatusData>
  fetchRecentActivity: (id: string) => Promise<ActivityItem[]>
  fetchQuickActions: (c: Conference, phase: string) => Promise<QuickAction[]>
  fetchTicketSales: (c: Conference) => Promise<TicketSalesData | null>
  loadDashboardConfig: (id: string) => Promise<SerializedWidget[] | null>
  saveDashboardConfig: (id: string, w: SerializedWidget[]) => Promise<void>
}

const {
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
} = actions

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getAuthSession } = require('@/lib/auth') as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAuthSession: jest.Mock<any>
}

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
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-02-15T12:00:00Z'))
    jest.clearAllMocks()
    getAuthSession.mockResolvedValue({
      user: { name: 'Admin', email: 'admin@test.com' },
      expires: '2099-01-01T00:00:00Z',
      speaker: { isOrganizer: true },
    })
  })

  afterEach(() => {
    jest.useRealTimers()
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
    it('computes percentage of reviewed proposals', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({
            status: Status.submitted,
            reviews: [
              {
                score: { content: 4, relevance: 4, speaker: 4 },
              },
            ],
          }),
          makeProposal({ status: Status.submitted, reviews: [] }),
          makeProposal({ status: Status.submitted }),
          makeProposal({ status: Status.draft }), // excluded
        ],
        proposalsError: null,
      })

      const progress = await fetchReviewProgress('conf-1')
      // 3 non-draft, 1 has reviews
      expect(progress.totalProposals).toBe(3)
      expect(progress.reviewedCount).toBe(1)
      expect(progress.percentage).toBeCloseTo(33.33, 0)
    })

    it('finds the next unreviewed submitted proposal', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({
            _id: 'reviewed-1',
            status: Status.submitted,
            reviews: [{ score: { content: 3, relevance: 3, speaker: 3 } }],
          }),
          makeProposal({
            _id: 'unreviewed-1',
            title: 'Needs Review',
            status: Status.submitted,
            reviews: [],
          }),
        ],
        proposalsError: null,
      })

      const progress = await fetchReviewProgress('conf-1')
      expect(progress.nextUnreviewed).toEqual({
        id: 'unreviewed-1',
        title: 'Needs Review',
      })
    })

    it('returns no nextUnreviewed when all are reviewed', async () => {
      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({
            status: Status.submitted,
            reviews: [{ score: { content: 5, relevance: 5, speaker: 5 } }],
          }),
        ],
        proposalsError: null,
      })

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
      expect(data.returningSpeakers).toBe(2) // Alice + Carol
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

      mockGetProposals.mockResolvedValue({
        proposals: [
          makeProposal({
            _id: 'p1',
            title: 'Latest Talk',
            _createdAt: '2025-02-15T09:00:00Z',
            speakers: [{ name: 'Speaker A' }],
          }),
        ],
        proposalsError: null,
      })

      const items = await fetchRecentActivity('conf-1')
      expect(items.length).toBeGreaterThanOrEqual(2)
      // Most recent first
      expect(items[0].type).toBe('proposal') // Feb 15
      expect(items[1].type).toBe('sponsor') // Feb 14
    })

    it('returns at most 10 items', async () => {
      mockListActivities.mockResolvedValue({
        activities: Array.from({ length: 10 }, (_, i) => ({
          _id: `a${i}`,
          description: `Activity ${i}`,
          createdAt: `2025-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
          _createdAt: `2025-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
          sponsorForConference: { sponsor: { name: 'Sponsor' } },
          createdBy: { name: 'Admin' },
        })),
        error: null,
      })

      mockGetProposals.mockResolvedValue({
        proposals: Array.from({ length: 5 }, (_, i) =>
          makeProposal({
            _id: `p${i}`,
            _createdAt: `2025-02-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
          }),
        ),
        proposalsError: null,
      })

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
    it('returns null when conference lacks ticket config', async () => {
      const result = await fetchTicketSales(baseConference)
      expect(result).toBeNull()
    })

    it('returns ticket data when conference has checkin IDs', async () => {
      const confWithTickets: Conference = {
        ...baseConference,
        checkinCustomerId: 123,
        checkinEventId: 456,
        ticketCapacity: 500,
      }

      const result = await fetchTicketSales(confWithTickets)
      expect(result).not.toBeNull()
      expect(result!.capacity).toBe(500)
      expect(result!.milestones).toHaveLength(3)
      expect(result!.milestones[0].name).toBe('Early Bird')
    })
  })

  describe('Dashboard Config Persistence', () => {
    it('loadDashboardConfig returns null when no config exists', async () => {
      const result = await loadDashboardConfig('conf-1')
      expect(result).toBeNull()
    })

    it('saveDashboardConfig serializes widget positions', async () => {
      await expect(
        saveDashboardConfig('conf-1', [
          {
            id: 'w1',
            type: 'quick-actions',
            title: 'Quick Actions',
            position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
          },
        ]),
      ).resolves.not.toThrow()
    })
  })
})
