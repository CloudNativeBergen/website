'use server'

import { Conference } from '@/lib/conference/types'
import { getPhaseContext } from '@/lib/conference/phase'
import { listSponsorsForConference } from '@/lib/sponsor-crm/sanity'
import { aggregateSponsorPipeline } from '@/lib/sponsor-crm/pipeline'
import { listActivitiesForConference } from '@/lib/sponsor-crm/activities'
import { getProposals } from '@/lib/proposal/server'
import { Status } from '@/lib/proposal/types'
import { getSpeakers } from '@/lib/speaker/sanity'
import { getFeaturedSpeakers } from '@/lib/featured/sanity'
import { Flags } from '@/lib/speaker/types'
import { fetchEventTickets } from '@/lib/tickets/api'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type { ProcessTicketSalesInput } from '@/lib/tickets/types'
import { DEFAULT_TARGET_CONFIG, DEFAULT_CAPACITY } from '@/lib/tickets/config'
import { getAuthSession } from '@/lib/auth'
import { formatRelativeTime, formatLabel } from '@/lib/time'
import type {
  SponsorPipelineData as WidgetSponsorPipelineData,
  DeadlineData,
  ActivityItem,
  CFPHealthData,
  SpeakerEngagementData,
  TicketSalesData,
  QuickAction,
} from '@/hooks/dashboard/useDashboardData'

// --- Auth ---

async function requireOrganizer(): Promise<void> {
  const session = await getAuthSession()
  if (!session?.speaker?.is_organizer) {
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
): Promise<WidgetSponsorPipelineData> {
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

  const stages = PIPELINE_STAGES.map((status) => ({
    name: STAGE_LABELS[status] || status,
    count: pipeline.byStatus[status] || 0,
    value: pipeline.byStatusValue[status] || 0,
  }))

  const activities = activityResult.activities || []
  const recentActivity = activities.slice(0, 5).map((a) => ({
    id: a._id,
    sponsor: a.sponsor_for_conference?.sponsor?.name || 'Unknown',
    activity: a.description,
    timestamp: formatRelativeTime(a.created_at || a._createdAt),
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
      date: conference.cfp_start_date,
      daysRemaining: ctx.daysUntilCfpStart,
      phase: 'Preparation',
      action: 'Configure CFP',
      actionLink: '/admin/settings',
    })
  }

  if (ctx.daysUntilCfpClose !== null && ctx.daysUntilCfpClose > 0) {
    candidates.push({
      name: 'CFP Closes',
      date: conference.cfp_end_date,
      daysRemaining: ctx.daysUntilCfpClose,
      phase: ctx.isCfpOpen ? 'CFP Open' : 'Preparation',
      action: ctx.isCfpOpen ? 'Promote CFP' : undefined,
      actionLink: ctx.isCfpOpen ? '/admin/settings' : undefined,
    })
  }

  if (ctx.daysUntilNotification !== null && ctx.daysUntilNotification > 0) {
    candidates.push({
      name: 'Notify Speakers',
      date: conference.cfp_notify_date,
      daysRemaining: ctx.daysUntilNotification,
      phase: 'Review',
      action: 'Review Proposals',
      actionLink: '/admin/proposals',
    })
  }

  if (
    ctx.daysUntilProgramRelease !== null &&
    ctx.daysUntilProgramRelease > 0
  ) {
    candidates.push({
      name: 'Program Published',
      date: conference.program_date,
      daysRemaining: ctx.daysUntilProgramRelease,
      phase: 'Program',
      action: 'Build Schedule',
      actionLink: '/admin/schedule',
    })
  }

  if (ctx.daysUntilConference !== null && ctx.daysUntilConference > 0) {
    candidates.push({
      name: 'Conference Day',
      date: conference.start_date,
      daysRemaining: ctx.daysUntilConference,
      phase: 'Event',
    })
  }

  return candidates
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .map((c) => ({
      ...c,
      urgency: c.daysRemaining <= 7 ? 'high' : c.daysRemaining <= 30 ? 'medium' : 'low',
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
  const cfpStart = conference.cfp_start_date
    ? new Date(conference.cfp_start_date)
    : null
  const now = new Date()
  const daysSinceOpen = cfpStart
    ? Math.max(
      1,
      Math.ceil(
        (now.getTime() - cfpStart.getTime()) / (1000 * 60 * 60 * 24),
      ),
    )
    : 1
  const averagePerDay =
    submitted.length > 0
      ? Math.round((submitted.length / daysSinceOpen) * 10) / 10
      : 0

  return {
    totalSubmissions: submitted.length,
    submissionGoal: conference.cfp_submission_goal || 0,
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
    if (
      speaker.proposals?.some((p) => p.status === Status.accepted)
    ) {
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

  if (!conference.checkin_customer_id || !conference.checkin_event_id) {
    return null
  }

  try {
    const tickets = await fetchEventTickets(
      conference.checkin_customer_id,
      conference.checkin_event_id,
    )

    if (!tickets || tickets.length === 0) {
      return null
    }

    const targetConfig = conference.ticket_targets || DEFAULT_TARGET_CONFIG
    const capacity = conference.ticket_capacity || DEFAULT_CAPACITY

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
        conference.start_date ||
        conference.program_date ||
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
    listActivitiesForConference(conferenceId, 10),
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
    const isoDate = a.created_at || a._createdAt
    items.push({
      id: a._id,
      type: 'sponsor',
      description: `${a.sponsor_for_conference?.sponsor?.name || 'Sponsor'}: ${a.description}`,
      user: a.created_by?.name || 'System',
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
    .slice(0, 10)
    .map((item): ActivityItem => ({
      id: item.id,
      type: item.type,
      description: item.description,
      user: item.user,
      timestamp: item.timestamp,
      link: item.link,
    }))
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
