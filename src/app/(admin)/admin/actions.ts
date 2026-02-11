'use server'

import { Conference } from '@/lib/conference/types'
import { getPhaseContext } from '@/lib/conference/phase'
import { listSponsorsForConference } from '@/lib/sponsor-crm/sanity'
import { aggregateSponsorPipeline } from '@/lib/sponsor-crm/pipeline'
import { listActivitiesForConference } from '@/lib/sponsor-crm/activities'
import { getProposals } from '@/lib/proposal/server'
import { Status } from '@/lib/proposal/types'
import { calculateAverageRating } from '@/lib/proposal/business'
import { getSpeakers } from '@/lib/speaker/sanity'
import { getFeaturedSpeakers } from '@/lib/featured/sanity'
import { Flags } from '@/lib/speaker/types'
import { fetchEventTickets } from '@/lib/tickets/api'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type { ProcessTicketSalesInput } from '@/lib/tickets/types'
import { DEFAULT_TARGET_CONFIG, DEFAULT_CAPACITY } from '@/lib/tickets/config'
import { getAllTravelSupport } from '@/lib/travel-support/sanity'
import { TravelSupportStatus } from '@/lib/travel-support/types'
import { getWorkshopStatistics } from '@/lib/workshop/sanity'
import { getAuthSession } from '@/lib/auth'
import { clientWrite } from '@/lib/sanity/client'
import {
  formatRelativeTime,
  formatLabel,
  formatConferenceDateShort,
} from '@/lib/time'
import type {
  SponsorPipelineWidgetData,
  DeadlineData,
  ActivityItem,
  CFPHealthData,
  SpeakerEngagementData,
  TicketSalesData,
  ProposalPipelineData,
  ReviewProgressData,
  TravelSupportData,
  ScheduleStatusData,
  QuickAction,
} from '@/lib/dashboard/data-types'
import type { WorkshopStatistics } from '@/lib/workshop/types'

// --- Auth ---

async function requireOrganizer(): Promise<void> {
  const session = await getAuthSession()
  if (!session?.speaker?.isOrganizer) {
    throw new Error('Unauthorized: organizer access required')
  }
}

// --- Sponsor Pipeline ---

const PIPELINE_STAGES = ['prospect', 'contacted', 'negotiating', 'closed-won']
const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  negotiating: 'Negotiating',
  'closed-won': 'Closed Won',
}

export async function fetchSponsorPipelineData(
  conferenceId: string,
  revenueGoal: number,
): Promise<SponsorPipelineWidgetData> {
  await requireOrganizer()

  const [sponsorResult, activityResult] = await Promise.all([
    listSponsorsForConference(conferenceId),
    listActivitiesForConference(conferenceId, 5),
  ])

  if (sponsorResult.error) {
    throw new Error(`Failed to fetch sponsors: ${sponsorResult.error.message}`)
  }
  if (activityResult.error) {
    throw new Error(
      `Failed to fetch activities: ${activityResult.error.message}`,
    )
  }

  const sponsors = sponsorResult.sponsors || []
  const pipeline = aggregateSponsorPipeline(sponsors)

  const stages = PIPELINE_STAGES.map((status) => {
    const stageSponsors = sponsors
      .filter((s) => s.status === status)
      .map((s) => ({
        name: s.sponsor?.name || 'Unknown',
        logo: s.sponsor?.logo || undefined,
        logoBright: s.sponsor?.logoBright || undefined,
      }))

    return {
      name: STAGE_LABELS[status] || status,
      count: pipeline.byStatus[status] || 0,
      value: pipeline.byStatusValue[status] || 0,
      sponsors: stageSponsors,
    }
  })

  const activities = activityResult.activities || []
  const recentActivity = activities.slice(0, 5).map((a) => ({
    id: a._id,
    sponsor: a.sponsorForConference?.sponsor?.name || 'Unknown',
    activity: a.description,
    timestamp: formatRelativeTime(a.createdAt || a._createdAt),
  }))

  return {
    stages,
    totalValue: pipeline.totalContractValue,
    wonDeals: pipeline.closedWonCount,
    lostDeals: pipeline.closedLostCount,
    revenueGoal: revenueGoal || 0,
    recentActivity,
  }
}

// --- Upcoming Deadlines ---

interface DeadlineCandidate {
  name: string
  date: string
  daysRemaining: number
  phase: string
  action?: string
  actionLink?: string
}

export async function fetchDeadlines(
  conference: Conference,
): Promise<DeadlineData[]> {
  await requireOrganizer()

  const ctx = getPhaseContext(conference)

  const candidates: DeadlineCandidate[] = []

  if (ctx.daysUntilCfpStart !== null && ctx.daysUntilCfpStart > 0) {
    candidates.push({
      name: 'CFP Opens',
      date: conference.cfpStartDate,
      daysRemaining: ctx.daysUntilCfpStart,
      phase: 'Preparation',
      action: 'Configure CFP',
      actionLink: '/admin/settings',
    })
  }

  if (ctx.daysUntilCfpClose !== null && ctx.daysUntilCfpClose > 0) {
    candidates.push({
      name: 'CFP Closes',
      date: conference.cfpEndDate,
      daysRemaining: ctx.daysUntilCfpClose,
      phase: ctx.isCfpOpen ? 'CFP Open' : 'Preparation',
      action: ctx.isCfpOpen ? 'Promote CFP' : undefined,
      actionLink: ctx.isCfpOpen ? '/admin/settings' : undefined,
    })
  }

  if (ctx.daysUntilNotification !== null && ctx.daysUntilNotification > 0) {
    candidates.push({
      name: 'Notify Speakers',
      date: conference.cfpNotifyDate,
      daysRemaining: ctx.daysUntilNotification,
      phase: 'Review',
      action: 'Review Proposals',
      actionLink: '/admin/proposals',
    })
  }

  if (ctx.daysUntilProgramRelease !== null && ctx.daysUntilProgramRelease > 0) {
    candidates.push({
      name: 'Program Published',
      date: conference.programDate,
      daysRemaining: ctx.daysUntilProgramRelease,
      phase: 'Program',
      action: 'Build Schedule',
      actionLink: '/admin/schedule',
    })
  }

  if (ctx.daysUntilConference !== null && ctx.daysUntilConference > 0) {
    candidates.push({
      name: 'Conference Day',
      date: conference.startDate,
      daysRemaining: ctx.daysUntilConference,
      phase: 'Event',
    })
  }

  return candidates
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .map((c) => ({
      ...c,
      urgency:
        c.daysRemaining <= 7
          ? 'high'
          : c.daysRemaining <= 30
            ? 'medium'
            : 'low',
    }))
}

// --- CFP Health ---

export async function fetchCFPHealth(
  conference: Conference,
): Promise<CFPHealthData> {
  await requireOrganizer()

  const { proposals, proposalsError } = await getProposals({
    conferenceId: conference._id,
    returnAll: true,
  })

  if (proposalsError) {
    throw new Error(`Failed to fetch proposals: ${proposalsError.message}`)
  }

  const allProposals = proposals || []
  const submitted = allProposals.filter((p) => p.status !== Status.draft)

  const ctx = getPhaseContext(conference)
  const daysRemaining = ctx.daysUntilCfpClose ?? 0

  // Group by date for trend
  const byDate: Record<string, number> = {}
  for (const p of submitted) {
    const date = p._createdAt?.split('T')[0]
    if (date) {
      byDate[date] = (byDate[date] || 0) + 1
    }
  }

  const submissionsPerDay = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, count]) => ({ date, count }))

  // Group by format
  const byFormat: Record<string, number> = {}
  for (const p of submitted) {
    byFormat[p.format] = (byFormat[p.format] || 0) + 1
  }

  const formatDistribution = Object.entries(byFormat).map(
    ([format, count]) => ({
      format: formatLabel(format),
      count,
    }),
  )

  // Compute average per day
  const cfpStart = conference.cfpStartDate
    ? new Date(conference.cfpStartDate)
    : null
  const now = new Date()
  const daysSinceOpen = cfpStart
    ? Math.max(
        1,
        Math.ceil((now.getTime() - cfpStart.getTime()) / (1000 * 60 * 60 * 24)),
      )
    : 1
  const averagePerDay =
    submitted.length > 0
      ? Math.round((submitted.length / daysSinceOpen) * 10) / 10
      : 0

  return {
    totalSubmissions: submitted.length,
    submissionGoal: conference.cfpSubmissionGoal || 0,
    daysRemaining: Math.max(0, daysRemaining),
    averagePerDay,
    submissionsPerDay,
    formatDistribution,
  }
}

// --- Speaker Engagement ---

export async function fetchSpeakerEngagement(
  conferenceId: string,
): Promise<SpeakerEngagementData> {
  await requireOrganizer()

  const [{ speakers: speakerList, err }, { speakers: featured }] =
    await Promise.all([
      getSpeakers(conferenceId, [
        Status.submitted,
        Status.accepted,
        Status.confirmed,
      ]),
      getFeaturedSpeakers(conferenceId),
    ])

  if (err) {
    throw new Error(`Failed to fetch speakers: ${err.message}`)
  }

  const speakers = speakerList || []

  let diverseCount = 0
  let localCount = 0
  let firstTimeCount = 0
  let awaitingConfirmation = 0
  const totalProposals = speakers.reduce(
    (sum, s) => sum + (s.proposals?.length || 0),
    0,
  )

  for (const speaker of speakers) {
    const speakerFlags = speaker.flags || []
    if (speakerFlags.includes(Flags.diverseSpeaker)) diverseCount++
    if (speakerFlags.includes(Flags.localSpeaker)) localCount++
    if (speakerFlags.includes(Flags.firstTimeSpeaker)) firstTimeCount++
    if (speaker.proposals?.some((p) => p.status === Status.accepted)) {
      awaitingConfirmation++
    }
  }

  // Returning speakers have proposals in other conferences
  const returningCount = speakers.length - firstTimeCount

  return {
    totalSpeakers: speakers.length,
    featuredCount: featured?.length || 0,
    newSpeakers: firstTimeCount,
    returningSpeakers: returningCount,
    diverseSpeakers: diverseCount,
    localSpeakers: localCount,
    awaitingConfirmation,
    averageProposalsPerSpeaker:
      speakers.length > 0
        ? Math.round((totalProposals / speakers.length) * 10) / 10
        : 0,
  }
}

// --- Ticket Sales ---

export async function fetchTicketSales(
  conference: Conference,
): Promise<TicketSalesData | null> {
  await requireOrganizer()

  if (!conference.checkinCustomerId || !conference.checkinEventId) {
    return null
  }

  try {
    const tickets = await fetchEventTickets(
      conference.checkinCustomerId,
      conference.checkinEventId,
    )

    const capacity = conference.ticketCapacity || DEFAULT_CAPACITY

    if (!tickets || tickets.length === 0) {
      return {
        currentSales: 0,
        capacity,
        percentage: 0,
        revenue: 0,
        salesByDate: [],
        milestones: [
          {
            name: 'Early Bird',
            target: Math.round(capacity * 0.2),
            reached: false,
          },
          {
            name: 'Break Even',
            target: Math.round(capacity * 0.5),
            reached: false,
          },
          { name: 'Sell Out', target: capacity, reached: false },
        ],
        daysUntilEvent: getPhaseContext(conference).daysUntilConference ?? 0,
        salesVelocity: 0,
      }
    }

    const targetConfig = conference.ticketTargets || DEFAULT_TARGET_CONFIG

    const input: ProcessTicketSalesInput = {
      tickets: tickets.map((t) => ({
        order_id: t.order_id,
        order_date: t.order_date,
        category: t.category,
        sum: t.sum,
      })),
      config: targetConfig,
      capacity,
      conference,
      conferenceDate:
        conference.startDate ||
        conference.programDate ||
        new Date().toISOString(),
      speakerCount: 0,
    }

    const result = new TicketSalesProcessor(input).process()
    const stats = result.statistics

    const salesByDate = result.progression.slice(-10).map((p) => ({
      date: p.date,
      sales: p.actualTickets,
      target: p.targetTickets,
    }))

    // Compute velocity: tickets per day over the sales period
    const salesDates = result.progression
      .filter((p) => p.actualTickets > 0)
      .map((p) => p.date)
    const salesDayCount = salesDates.length || 1
    const salesVelocity =
      stats.totalPaidTickets > 0
        ? Math.round((stats.totalPaidTickets / salesDayCount) * 10) / 10
        : 0

    return {
      currentSales: stats.totalPaidTickets,
      capacity,
      percentage:
        capacity > 0
          ? Math.round((stats.totalPaidTickets / capacity) * 1000) / 10
          : 0,
      revenue: stats.totalRevenue,
      salesByDate,
      milestones: [
        {
          name: 'Early Bird',
          target: Math.round(capacity * 0.2),
          reached: stats.totalPaidTickets >= Math.round(capacity * 0.2),
        },
        {
          name: 'Break Even',
          target: Math.round(capacity * 0.5),
          reached: stats.totalPaidTickets >= Math.round(capacity * 0.5),
        },
        {
          name: 'Sell Out',
          target: capacity,
          reached: stats.totalPaidTickets >= capacity,
        },
      ],
      daysUntilEvent: getPhaseContext(conference).daysUntilConference ?? 0,
      salesVelocity,
    }
  } catch {
    return null
  }
}

// --- Recent Activity ---

export async function fetchRecentActivity(
  conferenceId: string,
): Promise<ActivityItem[]> {
  await requireOrganizer()

  const [activityResult, proposalResult] = await Promise.all([
    listActivitiesForConference(conferenceId, 15),
    getProposals({ conferenceId, returnAll: true }),
  ])

  if (activityResult.error) {
    throw new Error(
      `Failed to fetch activities: ${activityResult.error.message}`,
    )
  }
  if (proposalResult.proposalsError) {
    throw new Error(
      `Failed to fetch proposals: ${proposalResult.proposalsError.message}`,
    )
  }

  // Collect items with raw ISO dates for sorting
  const items: (ActivityItem & { _sortDate: string })[] = []

  const activities = activityResult.activities || []
  for (const a of activities) {
    const isoDate = a.createdAt || a._createdAt
    items.push({
      id: a._id,
      type: 'sponsor',
      description: `${a.sponsorForConference?.sponsor?.name || 'Sponsor'}: ${a.description}`,
      user: a.createdBy?.name || 'System',
      timestamp: formatRelativeTime(isoDate),
      link: '/admin/sponsors/crm',
      _sortDate: isoDate,
    })
  }

  const proposals = proposalResult.proposals || []
  const recentProposals = [...proposals]
    .sort(
      (a, b) =>
        new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime(),
    )
    .slice(0, 5)

  for (const p of recentProposals) {
    items.push({
      id: `proposal-${p._id}`,
      type: 'proposal',
      description: `New proposal: \u201C${p.title}\u201D`,
      user:
        (p.speakers as Array<{ name?: string }>)?.[0]?.name ||
        'Unknown Speaker',
      timestamp: formatRelativeTime(p._createdAt),
      link: `/admin/proposals/${p._id}`,
      _sortDate: p._createdAt,
    })
  }

  // Sort by raw ISO date (descending = most recent first), then strip sort key
  return items
    .sort(
      (a, b) =>
        new Date(b._sortDate).getTime() - new Date(a._sortDate).getTime(),
    )
    .slice(0, 15)
    .map(
      (item): ActivityItem => ({
        id: item.id,
        type: item.type,
        description: item.description,
        user: item.user,
        timestamp: item.timestamp,
        link: item.link,
      }),
    )
}

// --- Quick Actions ---

async function fetchQuickActionBadges(
  conferenceId: string,
): Promise<Record<string, number>> {
  const [sponsorResult, proposalResult] = await Promise.all([
    listSponsorsForConference(conferenceId),
    getProposals({ conferenceId, returnAll: true }),
  ])

  if (sponsorResult.error) {
    throw new Error(`Failed to fetch sponsors: ${sponsorResult.error.message}`)
  }
  if (proposalResult.proposalsError) {
    throw new Error(
      `Failed to fetch proposals: ${proposalResult.proposalsError.message}`,
    )
  }

  const sponsors = sponsorResult.sponsors || []
  const proposals = proposalResult.proposals || []

  const prospectCount = sponsors.filter(
    (s) => s.status === 'prospect' || s.status === 'contacted',
  ).length
  const pendingReview = proposals.filter(
    (p) => p.status === Status.submitted,
  ).length
  const awaitingConfirmation = proposals.filter(
    (p) => p.status === Status.accepted,
  ).length

  return {
    sponsors: prospectCount,
    proposals: pendingReview,
    speakers: awaitingConfirmation,
  }
}

export async function fetchQuickActions(
  conference: Conference,
  phase: string,
): Promise<QuickAction[]> {
  await requireOrganizer()

  const badges = await fetchQuickActionBadges(conference._id)

  const baseActions: Record<string, QuickAction[]> = {
    initialization: [
      {
        label: 'Sponsor Pipeline',
        shortLabel: 'Sponsors',
        icon: 'CurrencyDollarIcon',
        link: '/admin/sponsors/crm',
        badge: badges.sponsors || undefined,
        variant: 'success',
      },
      {
        label: 'Invite Speakers',
        shortLabel: 'Speakers',
        icon: 'UserGroupIcon',
        link: '/admin/speakers',
        variant: 'primary',
      },
      {
        label: 'Configure CFP',
        shortLabel: 'CFP Setup',
        icon: 'ClipboardDocumentCheckIcon',
        link: '/admin/settings',
        variant: 'secondary',
      },
      {
        label: 'Setup Tickets',
        shortLabel: 'Tickets',
        icon: 'Cog6ToothIcon',
        link: '/admin/tickets',
        variant: 'secondary',
      },
      {
        label: 'Featured Speakers',
        shortLabel: 'Featured',
        icon: 'GlobeAltIcon',
        link: '/admin/speakers',
        variant: 'warning',
      },
      {
        label: 'Settings',
        shortLabel: 'Settings',
        icon: 'Cog6ToothIcon',
        link: '/admin/settings',
        variant: 'secondary',
      },
    ],
    planning: [
      {
        label: 'Review Proposals',
        shortLabel: 'Proposals',
        icon: 'ClipboardDocumentCheckIcon',
        link: '/admin/proposals',
        badge: badges.proposals || undefined,
        variant: 'primary',
      },
      {
        label: 'Manage Speakers',
        shortLabel: 'Speakers',
        icon: 'UserGroupIcon',
        link: '/admin/speakers',
        badge: badges.speakers || undefined,
        variant: 'secondary',
      },
      {
        label: 'Sponsor Pipeline',
        shortLabel: 'Sponsors',
        icon: 'CurrencyDollarIcon',
        link: '/admin/sponsors/crm',
        badge: badges.sponsors || undefined,
        variant: 'success',
      },
      {
        label: 'Travel Support',
        shortLabel: 'Travel',
        icon: 'GlobeAltIcon',
        link: '/admin/travel-support',
        variant: 'warning',
      },
      {
        label: 'Build Schedule',
        shortLabel: 'Schedule',
        icon: 'CalendarIcon',
        link: '/admin/schedule',
        variant: 'secondary',
      },
      {
        label: 'Settings',
        shortLabel: 'Settings',
        icon: 'Cog6ToothIcon',
        link: '/admin/settings',
        variant: 'secondary',
      },
    ],
    execution: [
      {
        label: 'Finalize Schedule',
        shortLabel: 'Schedule',
        icon: 'CalendarIcon',
        link: '/admin/schedule',
        variant: 'primary',
      },
      {
        label: 'Speaker Confirmations',
        shortLabel: 'Speakers',
        icon: 'UserGroupIcon',
        link: '/admin/speakers',
        badge: badges.speakers || undefined,
        variant: 'warning',
      },
      {
        label: 'Ticket Sales',
        shortLabel: 'Tickets',
        icon: 'Cog6ToothIcon',
        link: '/admin/tickets',
        variant: 'success',
      },
      {
        label: 'Workshop Capacity',
        shortLabel: 'Workshops',
        icon: 'GlobeAltIcon',
        link: '/admin/workshops',
        variant: 'secondary',
      },
      {
        label: 'Sponsor Activation',
        shortLabel: 'Sponsors',
        icon: 'CurrencyDollarIcon',
        link: '/admin/sponsors',
        variant: 'secondary',
      },
      {
        label: 'Settings',
        shortLabel: 'Settings',
        icon: 'Cog6ToothIcon',
        link: '/admin/settings',
        variant: 'secondary',
      },
    ],
    'post-conference': [
      {
        label: 'Publish Content',
        shortLabel: 'Gallery',
        icon: 'ClipboardDocumentCheckIcon',
        link: '/admin/gallery',
        variant: 'primary',
      },
      {
        label: 'Travel Expenses',
        shortLabel: 'Expenses',
        icon: 'GlobeAltIcon',
        link: '/admin/travel-support',
        variant: 'warning',
      },
      {
        label: 'Speaker Feedback',
        shortLabel: 'Feedback',
        icon: 'UserGroupIcon',
        link: '/admin/speakers',
        variant: 'secondary',
      },
      {
        label: 'Sponsor Reports',
        shortLabel: 'Sponsors',
        icon: 'CurrencyDollarIcon',
        link: '/admin/sponsors',
        variant: 'secondary',
      },
      {
        label: 'Analytics',
        shortLabel: 'Analytics',
        icon: 'CalendarIcon',
        link: '/admin/proposals',
        variant: 'secondary',
      },
      {
        label: 'Settings',
        shortLabel: 'Settings',
        icon: 'Cog6ToothIcon',
        link: '/admin/settings',
        variant: 'secondary',
      },
    ],
  }

  return baseActions[phase] || baseActions.planning
}

// --- Proposal Pipeline ---

export async function fetchProposalPipeline(
  conferenceId: string,
): Promise<ProposalPipelineData> {
  await requireOrganizer()

  const { proposals, proposalsError } = await getProposals({
    conferenceId,
    returnAll: true,
  })

  if (proposalsError) {
    throw new Error(`Failed to fetch proposals: ${proposalsError.message}`)
  }

  const allProposals = proposals || []
  const nonDraft = allProposals.filter((p) => p.status !== Status.draft)

  const submitted = nonDraft.length
  const accepted = nonDraft.filter((p) => p.status === Status.accepted).length
  const rejected = nonDraft.filter((p) => p.status === Status.rejected).length
  const confirmed = nonDraft.filter((p) => p.status === Status.confirmed).length
  const pendingDecisions = nonDraft.filter(
    (p) => p.status === Status.submitted,
  ).length

  return {
    submitted,
    accepted,
    rejected,
    confirmed,
    total: submitted,
    acceptanceRate:
      submitted > 0 ? ((accepted + confirmed) / submitted) * 100 : 0,
    pendingDecisions,
  }
}

// --- Review Progress ---

export async function fetchReviewProgress(
  conferenceId: string,
): Promise<ReviewProgressData> {
  await requireOrganizer()

  const { proposals, proposalsError } = await getProposals({
    conferenceId,
    returnAll: true,
    includeReviews: true,
  })

  if (proposalsError) {
    throw new Error(`Failed to fetch proposals: ${proposalsError.message}`)
  }

  const allProposals = proposals || []
  const nonDraft = allProposals.filter((p) => p.status !== Status.draft)
  const reviewed = nonDraft.filter((p) => p.reviews && p.reviews.length > 0)

  const totalScores = reviewed.reduce(
    (sum, p) => sum + calculateAverageRating(p),
    0,
  )
  const averageScore =
    reviewed.length > 0 ? (totalScores / reviewed.length) * 2 : 0

  // Find next unreviewed proposal
  const unreviewed = nonDraft.find(
    (p) =>
      p.status === Status.submitted && (!p.reviews || p.reviews.length === 0),
  )

  return {
    reviewedCount: reviewed.length,
    totalProposals: nonDraft.length,
    percentage:
      nonDraft.length > 0 ? (reviewed.length / nonDraft.length) * 100 : 0,
    averageScore: Math.round(averageScore * 10) / 10,
    nextUnreviewed: unreviewed
      ? { id: unreviewed._id, title: unreviewed.title }
      : undefined,
  }
}

// --- Travel Support ---

export async function fetchTravelSupport(
  conference: Conference,
): Promise<TravelSupportData> {
  await requireOrganizer()

  const { travelSupports, error } = await getAllTravelSupport(conference._id)

  if (error) {
    throw new Error(`Failed to fetch travel support: ${error.message}`)
  }

  const pending = travelSupports.filter(
    (ts) => ts.status === TravelSupportStatus.SUBMITTED,
  )
  const approved = travelSupports.filter(
    (ts) =>
      ts.status === TravelSupportStatus.APPROVED ||
      ts.status === TravelSupportStatus.PAID,
  )

  const totalRequested = travelSupports.reduce((sum, ts) => {
    const expenseTotal =
      ts.expenses?.reduce((s, e) => s + (e.amount || 0), 0) || 0
    return sum + (ts.totalAmount || expenseTotal)
  }, 0)

  const totalApproved = approved.reduce(
    (sum, ts) => sum + (ts.approvedAmount || 0),
    0,
  )

  const budgetAllocated = conference.travelSupportBudget || 0

  return {
    pendingApprovals: pending.length,
    totalRequested,
    totalApproved,
    budgetAllocated,
    averageRequest:
      travelSupports.length > 0 ? totalRequested / travelSupports.length : 0,
    requests: pending.slice(0, 5).map((ts) => ({
      id: ts._id,
      speaker: ts.speaker?.name || 'Unknown',
      amount:
        ts.totalAmount ||
        ts.expenses?.reduce((s, e) => s + (e.amount || 0), 0) ||
        0,
      status: ts.status,
      submittedAt: ts.submittedAt
        ? formatRelativeTime(ts.submittedAt)
        : formatRelativeTime(ts._createdAt),
    })),
  }
}

// --- Workshop Capacity ---

export async function fetchWorkshopCapacity(
  conferenceId: string,
): Promise<WorkshopStatistics> {
  await requireOrganizer()
  return getWorkshopStatistics(conferenceId)
}

// --- Schedule Status ---

export async function fetchScheduleStatus(
  conference: Conference,
): Promise<ScheduleStatusData> {
  await requireOrganizer()

  const schedules = conference.schedules || []

  // Count total slots and filled slots across all schedule days
  let totalSlots = 0
  let filledSlots = 0
  let placeholderSlots = 0
  const byDay: { day: string; filled: number; total: number }[] = []

  for (const schedule of schedules) {
    let dayTotal = 0
    let dayFilled = 0

    for (const track of schedule.tracks || []) {
      for (const slot of track.talks || []) {
        dayTotal++
        totalSlots++
        if (slot.talk) {
          dayFilled++
          filledSlots++
        } else if (slot.placeholder) {
          placeholderSlots++
        }
      }
    }

    const dayLabel = formatConferenceDateShort(schedule.date)
    byDay.push({ day: dayLabel, filled: dayFilled, total: dayTotal })
  }

  // Count confirmed talks not yet assigned to the schedule
  const { proposals, proposalsError } = await getProposals({
    conferenceId: conference._id,
    returnAll: true,
  })

  let unassignedConfirmedTalks = 0
  if (!proposalsError && proposals) {
    const confirmedProposals = proposals.filter(
      (p) => p.status === Status.confirmed || p.status === Status.accepted,
    )

    const scheduledTalkIds = new Set<string>()
    for (const schedule of schedules) {
      for (const track of schedule.tracks || []) {
        for (const slot of track.talks || []) {
          if (slot.talk?._id) {
            scheduledTalkIds.add(slot.talk._id)
          }
        }
      }
    }

    unassignedConfirmedTalks = confirmedProposals.filter(
      (p) => !scheduledTalkIds.has(p._id),
    ).length
  }

  return {
    totalSlots,
    filledSlots,
    percentage: totalSlots > 0 ? (filledSlots / totalSlots) * 100 : 0,
    byDay,
    unassignedConfirmedTalks,
    placeholderSlots,
  }
}

// --- Dashboard Config Persistence ---

interface DashboardConfigWidget {
  _key: string
  widget_id: string
  widget_type: string
  title: string
  row: number
  col: number
  row_span: number
  col_span: number
  config?: string
}

interface DashboardConfigDocument {
  _id: string
  _type: 'dashboardConfig'
  conference: { _ref: string; _type: 'reference' }
  preset?: string
  widgets: DashboardConfigWidget[]
}

export interface SerializedWidget {
  id: string
  type: string
  title: string
  position: { row: number; col: number; rowSpan: number; colSpan: number }
  config?: Record<string, unknown>
}

export async function loadDashboardConfig(
  conferenceId: string,
): Promise<SerializedWidget[] | null> {
  await requireOrganizer()

  const doc = await clientWrite.fetch<DashboardConfigDocument | null>(
    `*[_type == "dashboardConfig" && conference._ref == $conferenceId][0]`,
    { conferenceId },
  )

  if (!doc?.widgets?.length) return null

  return doc.widgets.map((w) => ({
    id: w.widget_id,
    type: w.widget_type,
    title: w.title || w.widget_type,
    position: {
      row: w.row || 0,
      col: w.col || 0,
      rowSpan: w.row_span || 2,
      colSpan: w.col_span || 3,
    },
    config: (() => {
      if (!w.config) return undefined
      try {
        return JSON.parse(w.config)
      } catch {
        return undefined
      }
    })(),
  }))
}

export async function saveDashboardConfig(
  conferenceId: string,
  widgets: SerializedWidget[],
): Promise<void> {
  await requireOrganizer()

  const existingId = await clientWrite.fetch<string | null>(
    `*[_type == "dashboardConfig" && conference._ref == $conferenceId][0]._id`,
    { conferenceId },
  )

  const widgetDocs: DashboardConfigWidget[] = widgets.map((w, i) => ({
    _key: `widget-${i}`,
    widget_id: w.id,
    widget_type: w.type,
    title: w.title,
    row: w.position.row,
    col: w.position.col,
    row_span: w.position.rowSpan,
    col_span: w.position.colSpan,
    config: w.config ? JSON.stringify(w.config) : undefined,
  }))

  if (existingId) {
    await clientWrite.patch(existingId).set({ widgets: widgetDocs }).commit()
  } else {
    await clientWrite.create({
      _type: 'dashboardConfig' as const,
      conference: { _ref: conferenceId, _type: 'reference' },
      widgets: widgetDocs,
    })
  }
}
