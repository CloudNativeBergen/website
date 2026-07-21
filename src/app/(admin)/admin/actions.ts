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
import { getConferenceTeams } from '@/lib/teams'
import { getConversationViewCounts } from '@/lib/messaging/sanity'
import { getVolunteersByConference } from '@/lib/volunteer/sanity'
import { VolunteerStatus } from '@/lib/volunteer/types'
import { getAuthSession } from '@/lib/auth'
import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import type { ProposalExisting } from '@/lib/proposal/types'
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
  TicketSalesResult,
  ProposalPipelineData,
  ReviewProgressData,
  TravelSupportData,
  ScheduleStatusData,
  QuickAction,
  MyAreasData,
  MyAreaCard,
} from '@/lib/dashboard/data-types'
import type { WorkshopStatistics } from '@/lib/workshop/types'
import { WIDGET_REGISTRY } from '@/lib/dashboard/widget-registry'
import { resolveConferenceId } from '@/server/trpc'

// --- Auth ---

async function requireOrganizer(): Promise<void> {
  const session = await getAuthSession()
  if (!session?.speaker?.isOrganizer) {
    throw new Error('Unauthorized: organizer access required')
  }
}

/**
 * Like {@link requireOrganizer} but also returns the caller's identity, for
 * actions that scope data to the CURRENT organizer (e.g. per-organizer
 * dashboard configs). The speaker id comes from the server session — never
 * from client input.
 */
async function requireOrganizerSession(): Promise<{ speakerId: string }> {
  const session = await getAuthSession()
  if (!session?.speaker?.isOrganizer || !session.speaker._id) {
    throw new Error('Unauthorized: organizer access required')
  }
  return { speakerId: session.speaker._id }
}

// --- My Areas (TEAMS-3, L4) ---

/**
 * The viewer's "My areas": one card per team the CURRENT organizer belongs to,
 * each with a couple of needs-attention counts that deep-link to the filtered
 * surface. A SOFT LENS — read-only convenience scoped to the viewer's teams, no
 * access implications (docs/ORGANIZER_TEAMS.md).
 *
 * COST: gated on membership so only the teams the viewer is actually on trigger
 * a read, and every count reuses an EXISTING source (no new aggregate query):
 *  - `cfp`        → `getConversationViewCounts` (one bounded GROQ; needs-reply +
 *                   unassigned inbox threads),
 *  - `sponsors`   → `listSponsorsForConference({ unassignedOnly })` length,
 *  - `volunteers` → `getVolunteersByConference` filtered to PENDING.
 * A viewer on none of these well-known teams still gets a titled card (no
 * metrics). Returns `{ areas: [] }` when the viewer is on no team at all.
 */
export async function fetchMyAreasData(
  conferenceId: string,
): Promise<MyAreasData> {
  await requireOrganizer()
  const session = await getAuthSession()
  const speakerId = session?.speaker?._id
  if (!speakerId) return { areas: [] }

  const teams = await getConferenceTeams(conferenceId)
  const myTeams = teams.filter((t) => t.members.includes(speakerId))
  if (myTeams.length === 0) return { areas: [] }

  const myKeys = new Set(myTeams.map((t) => t.key))

  // Fetch each area's source ONCE, and only when the viewer is on that team.
  const viewCounts = myKeys.has('cfp')
    ? await getConversationViewCounts({
        speakerId,
        isOrganizer: true,
        conferenceId,
      })
    : null

  let unassignedSponsors = 0
  if (myKeys.has('sponsors')) {
    const { sponsors } = await listSponsorsForConference(conferenceId, {
      unassignedOnly: true,
    })
    unassignedSponsors = sponsors?.length ?? 0
  }

  let pendingVolunteers = 0
  if (myKeys.has('volunteers')) {
    const { volunteers } = await getVolunteersByConference(conferenceId)
    pendingVolunteers = volunteers.filter(
      (v) => v.status === VolunteerStatus.PENDING,
    ).length
  }

  const areas: MyAreaCard[] = myTeams.map((team) => {
    switch (team.key) {
      case 'cfp':
        return {
          key: team.key,
          title: team.title,
          metrics: [
            {
              label: 'Needs reply',
              count: viewCounts?.needsReply ?? 0,
              href: '/admin/messages?view=needs-reply',
            },
            {
              label: 'Unassigned',
              count: viewCounts?.unassigned ?? 0,
              href: '/admin/messages?view=unassigned',
            },
          ],
        }
      case 'sponsors':
        return {
          key: team.key,
          title: team.title,
          metrics: [
            {
              label: 'Unassigned sponsors',
              count: unassignedSponsors,
              href: '/admin/sponsors/crm?assignedTo=unassigned',
            },
          ],
        }
      case 'volunteers':
        return {
          key: team.key,
          title: team.title,
          metrics: [
            {
              label: 'Pending volunteers',
              count: pendingVolunteers,
              href: '/admin/volunteers',
            },
          ],
        }
      default:
        return { key: team.key, title: team.title, metrics: [] }
    }
  })

  return { areas }
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

  // NOTE: we intentionally do NOT derive a "returning speakers" number.
  // `total - firstTimeFlagged` would mislabel every untagged speaker as
  // returning; only the explicit first-time flag is a trustworthy signal.
  return {
    totalSpeakers: speakers.length,
    featuredCount: featured?.length || 0,
    newSpeakers: firstTimeCount,
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
): Promise<TicketSalesResult> {
  await requireOrganizer()

  if (!conference.checkinCustomerId || !conference.checkinEventId) {
    return { status: 'unconfigured' }
  }

  try {
    const tickets = await fetchEventTickets(
      conference.checkinCustomerId,
      conference.checkinEventId,
    )

    const capacity = conference.ticketCapacity || DEFAULT_CAPACITY

    if (!tickets || tickets.length === 0) {
      return {
        status: 'ok',
        data: {
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
        },
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
      status: 'ok',
      data: {
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
      },
    }
  } catch (error) {
    console.error('Failed to fetch ticket sales:', error)
    return { status: 'error' }
  }
}

// --- Recent Activity ---

const RECENT_ACTIVITY_LIMIT = 15
const RECENT_PROPOSALS_LIMIT = 5

interface RecentProposalRow {
  _id: string
  title: string
  _createdAt: string
  speakers?: { name?: string }[]
}

export async function fetchRecentActivity(
  conferenceId: string,
): Promise<ActivityItem[]> {
  await requireOrganizer()

  // Both sources are ordered + limited in GROQ — we never pull the full
  // proposal corpus just to slice the newest few afterwards.
  const [activityResult, recentProposals] = await Promise.all([
    listActivitiesForConference(conferenceId, RECENT_ACTIVITY_LIMIT),
    clientRead.fetch<RecentProposalRow[]>(
      groq`*[_type == "talk" && conference._ref == $conferenceId && status != "${Status.draft}"]
        | order(_createdAt desc)[0...${RECENT_PROPOSALS_LIMIT}]{
        _id, title, _createdAt,
        speakers[]-> { name }
      }`,
      { conferenceId },
      { cache: 'no-store' },
    ),
  ])

  if (activityResult.error) {
    throw new Error(
      `Failed to fetch activities: ${activityResult.error.message}`,
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

  for (const p of recentProposals || []) {
    items.push({
      id: `proposal-${p._id}`,
      type: 'proposal',
      description: `New proposal: \u201C${p.title}\u201D`,
      user: p.speakers?.[0]?.name || 'Unknown Speaker',
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
    .slice(0, RECENT_ACTIVITY_LIMIT)
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
        link: '/admin/speakers/travel-support',
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
        link: '/admin/marketing/gallery',
        variant: 'primary',
      },
      {
        label: 'Travel Expenses',
        shortLabel: 'Expenses',
        icon: 'GlobeAltIcon',
        link: '/admin/speakers/travel-support',
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

  // Distinct speakers across confirmed talks (co-speakers deduped).
  const speakerIds = new Set<string>()
  for (const p of nonDraft) {
    if (p.status !== Status.confirmed) continue
    for (const speaker of p.speakers || []) {
      const s = speaker as { _id?: string; _ref?: string }
      const id = s._id ?? s._ref
      if (id) speakerIds.add(id)
    }
  }

  return {
    submitted,
    accepted,
    rejected,
    confirmed,
    total: submitted,
    acceptanceRate:
      submitted > 0 ? ((accepted + confirmed) / submitted) * 100 : 0,
    pendingDecisions,
    distinctSpeakers: speakerIds.size,
  }
}

// --- Review Progress ---

interface ReviewProgressRow {
  _id: string
  title: string
  status: Status
  reviews?: {
    score?: { content: number; relevance: number; speaker: number }
  }[]
}

export async function fetchReviewProgress(
  conferenceId: string,
): Promise<ReviewProgressData> {
  await requireOrganizer()

  // Trimmed projection: the math only needs status + review scores — no
  // speaker/reviewer joins, topics, or co-speaker invitations.
  const nonDraft = await clientRead.fetch<ReviewProgressRow[]>(
    groq`*[_type == "talk" && conference._ref == $conferenceId && status != "${Status.draft}"]
      | order(_updatedAt desc){
      _id, title, status,
      "reviews": *[_type == "review" && proposal._ref == ^._id]{ score }
    }`,
    { conferenceId },
    { cache: 'no-store' },
  )

  const reviewed = nonDraft.filter((p) => p.reviews && p.reviews.length > 0)

  const totalScores = reviewed.reduce(
    (sum, p) => sum + calculateAverageRating(p as unknown as ProposalExisting),
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
    approvedCount: approved.length,
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
//
// Layouts are PER-ORGANIZER: each organizer has their own dashboardConfig doc,
// identified deterministically as `dashboardConfig-<conferenceId>-<speakerId>`
// and carrying a `speaker` reference. The legacy conference-wide doc (no
// speaker reference) is kept READ-ONLY as the first-visit default: it is
// consulted by load when no personal doc exists, and never written again.
//
// Both actions take NO conferenceId from the client — the conference is
// resolved server-side from the request domain (resolveConferenceId, same
// helper the tRPC routers use) and the speaker id comes from the session.

interface DashboardConfigWidget {
  _key: string
  widgetId: string
  widgetType: string
  title: string
  row: number
  col: number
  rowSpan: number
  colSpan: number
  config?: string
}

interface DashboardConfigDocument {
  _id: string
  _type: 'dashboardConfig'
  conference: { _ref: string; _type: 'reference' }
  speaker?: { _ref: string; _type: 'reference' }
  preset?: string
  widgets?: DashboardConfigWidget[]
}

export interface SerializedWidget {
  id: string
  type: string
  title: string
  position: { row: number; col: number; rowSpan: number; colSpan: number }
  config?: Record<string, unknown>
}

/**
 * Deterministic id for an organizer's personal dashboard config. Both inputs
 * are Sanity document ids (letters/digits/dots/dashes/underscores), but any
 * other character is sanitized defensively so the result is always a valid
 * Sanity `_id`. Determinism makes saves race-free: concurrent saves by the
 * same user `createOrReplace` the SAME doc instead of racing a
 * fetch-then-create into duplicates.
 */
function personalDashboardConfigId(
  conferenceId: string,
  speakerId: string,
): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '-')
  // The conference id's LENGTH is encoded into the id so the two source ids
  // are unambiguously delimited: because ids may themselves contain "-", a
  // bare separator would let distinct (conference, speaker) pairs collide
  // (e.g. "a-b"/"c" vs "a"/"b-c"). With the length prefix the mapping is
  // injective for any inputs the sanitizer leaves distinct.
  const conf = clean(conferenceId)
  return `dashboardConfig-${conf.length}-${conf}-${clean(speakerId)}`
}

// --- Server-side validation limits for saved layouts ---
const MAX_WIDGETS = 40
const MAX_TITLE_LENGTH = 200
const MAX_ROW = 500
const MAX_COL = 11
const MAX_ROW_SPAN = 24
const MAX_COL_SPAN = 12
const MAX_CONFIG_JSON_BYTES = 8 * 1024

/**
 * Validates a layout before it is written. The canonical widget-type list is
 * the registry itself (Object.keys(WIDGET_REGISTRY)) so it can never drift
 * from the real widget set — the registry module is metadata + zod only (no
 * React components), so importing it server-side is safe.
 *
 * Note the save/load asymmetry: SAVE rejects unknown widget types, but LOAD
 * keeps tolerating unknown STORED types (the renderer shows a "Widget not
 * available" placeholder) so old docs never break the dashboard.
 */
function validateDashboardWidgets(widgets: SerializedWidget[]): void {
  if (!Array.isArray(widgets)) {
    throw new Error('Invalid dashboard config: widgets must be an array')
  }
  if (widgets.length > MAX_WIDGETS) {
    throw new Error(
      `Invalid dashboard config: at most ${MAX_WIDGETS} widgets allowed (got ${widgets.length})`,
    )
  }

  const validTypes = new Set(Object.keys(WIDGET_REGISTRY))

  for (const w of widgets) {
    if (typeof w.id !== 'string' || !w.id || w.id.length > MAX_TITLE_LENGTH) {
      throw new Error(
        `Invalid dashboard config: widget id must be a non-empty string of at most ${MAX_TITLE_LENGTH} characters`,
      )
    }
    if (!validTypes.has(w.type)) {
      throw new Error(
        `Invalid dashboard config: unknown widget type "${String(w.type)}"`,
      )
    }
    if (typeof w.title !== 'string' || w.title.length > MAX_TITLE_LENGTH) {
      throw new Error(
        `Invalid dashboard config: widget title must be a string of at most ${MAX_TITLE_LENGTH} characters`,
      )
    }

    const { row, col, rowSpan, colSpan } = w.position ?? {}
    const intInRange = (v: unknown, min: number, max: number) =>
      typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    if (!intInRange(row, 0, MAX_ROW)) {
      throw new Error(
        `Invalid dashboard config: widget row must be an integer between 0 and ${MAX_ROW}`,
      )
    }
    if (!intInRange(col, 0, MAX_COL)) {
      throw new Error(
        `Invalid dashboard config: widget col must be an integer between 0 and ${MAX_COL}`,
      )
    }
    if (!intInRange(rowSpan, 1, MAX_ROW_SPAN)) {
      throw new Error(
        `Invalid dashboard config: widget rowSpan must be an integer between 1 and ${MAX_ROW_SPAN}`,
      )
    }
    if (!intInRange(colSpan, 1, MAX_COL_SPAN)) {
      throw new Error(
        `Invalid dashboard config: widget colSpan must be an integer between 1 and ${MAX_COL_SPAN}`,
      )
    }

    // Per-widget minima/maxima from the registry, on top of the generic
    // bounds above: a span outside the widget's own constraints can only come
    // from a bypassed client (the UI clamps resizes and normalizes loads), so
    // it is rejected like every other invalid payload rather than silently
    // rewritten. `w.type` is known-valid here (checked above).
    const { minCols, maxCols, minRows, maxRows } =
      WIDGET_REGISTRY[w.type].constraints
    if (!intInRange(rowSpan, minRows, maxRows)) {
      throw new Error(
        `Invalid dashboard config: "${w.type}" rowSpan must be between ${minRows} and ${maxRows}`,
      )
    }
    if (!intInRange(colSpan, minCols, maxCols)) {
      throw new Error(
        `Invalid dashboard config: "${w.type}" colSpan must be between ${minCols} and ${maxCols}`,
      )
    }

    if (w.config !== undefined) {
      if (
        typeof w.config !== 'object' ||
        w.config === null ||
        Array.isArray(w.config)
      ) {
        throw new Error(
          'Invalid dashboard config: widget config must be a plain object',
        )
      }
      const serialized = JSON.stringify(w.config)
      // Byte length, not string length: JS .length counts UTF-16 code units,
      // which undercounts multibyte characters against a BYTE cap.
      if (Buffer.byteLength(serialized, 'utf8') > MAX_CONFIG_JSON_BYTES) {
        throw new Error(
          `Invalid dashboard config: widget config exceeds ${MAX_CONFIG_JSON_BYTES} bytes when serialized`,
        )
      }
    }
  }
}

function serializeStoredWidgets(
  widgets: DashboardConfigWidget[],
): SerializedWidget[] {
  return widgets.map((w) => ({
    id: w.widgetId,
    type: w.widgetType,
    title: w.title || w.widgetType,
    position: {
      row: w.row || 0,
      col: w.col || 0,
      rowSpan: w.rowSpan || 2,
      colSpan: w.colSpan || 3,
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

/**
 * Loads the calling organizer's dashboard layout for the current conference.
 *
 * Fallback chain:
 *  1. personal doc (deterministic `_id`) — returned even when its widgets
 *     array is EMPTY: an existing personal doc with `widgets: []` means the
 *     user deliberately cleared their dashboard, so `[]` is returned and the
 *     client renders an empty grid (not defaults);
 *  2. legacy shared doc (`conference._ref` match, no speaker) as a read-only
 *     first-visit default — an empty legacy doc falls through to null;
 *  3. `null` — the client falls back to the default preset.
 */
export async function loadDashboardConfig(): Promise<
  SerializedWidget[] | null
> {
  const { speakerId } = await requireOrganizerSession()
  const conferenceId = await resolveConferenceId()

  const personal = await clientWrite.fetch<DashboardConfigDocument | null>(
    `*[_type == "dashboardConfig" && _id == $id][0]`,
    { id: personalDashboardConfigId(conferenceId, speakerId) },
  )
  if (personal) {
    return serializeStoredWidgets(personal.widgets ?? [])
  }

  const legacy = await clientWrite.fetch<DashboardConfigDocument | null>(
    `*[_type == "dashboardConfig" && conference._ref == $conferenceId && !defined(speaker)][0]`,
    { conferenceId },
  )
  if (!legacy?.widgets?.length) return null
  return serializeStoredWidgets(legacy.widgets)
}

/**
 * Saves the calling organizer's dashboard layout for the current conference.
 * Always writes the PERSONAL doc via `createOrReplace` with a deterministic
 * `_id` (race-free for concurrent same-user saves; the doc IS the whole
 * layout). The legacy shared doc is never written.
 */
export async function saveDashboardConfig(
  widgets: SerializedWidget[],
): Promise<void> {
  const { speakerId } = await requireOrganizerSession()
  const conferenceId = await resolveConferenceId()

  validateDashboardWidgets(widgets)

  const widgetDocs: DashboardConfigWidget[] = widgets.map((w, i) => ({
    _key: `widget-${i}`,
    widgetId: w.id,
    widgetType: w.type,
    title: w.title,
    row: w.position.row,
    col: w.position.col,
    rowSpan: w.position.rowSpan,
    colSpan: w.position.colSpan,
    config: w.config ? JSON.stringify(w.config) : undefined,
  }))

  await clientWrite.createOrReplace({
    _id: personalDashboardConfigId(conferenceId, speakerId),
    _type: 'dashboardConfig' as const,
    conference: { _ref: conferenceId, _type: 'reference' as const },
    speaker: { _ref: speakerId, _type: 'reference' as const },
    widgets: widgetDocs,
  })
}
