/**
 * Dashboard widget data — computed from ONE composed read per pageview.
 *
 * `src/app/(admin)/admin/actions.ts` owns the authorization gate and the
 * server-side conference resolution; this module owns everything after it: which
 * GROQ roots a given widget set needs, the single round-trip that fetches them
 * (`./aggregate`), the handful of sources that genuinely cannot be composed into
 * GROQ, and the pure shaping functions that turn rows into widget payloads.
 *
 * THREE RULES THIS MODULE EXISTS TO ENFORCE
 *
 *  1. ONE authorization pass and ONE conference resolution per dashboard load.
 *     Neither happens here — both are done once by the caller and handed in as
 *     {@link DashboardContext}. Nothing in this module can read a session.
 *
 *  2. FETCH THE UNION OF ENABLED WIDGETS, nothing more. {@link sourcesForWidgets}
 *     maps widget keys to sources; a widget that is not on the dashboard
 *     contributes nothing, so its root never reaches the query. "One big query
 *     that reads everything" would be a regression, not a fix.
 *
 *  3. TENANT SCOPE IS A GROQ PARAMETER. `ctx.conferenceId` comes from the
 *     request domain. Nothing here accepts a conference from a caller-supplied
 *     widget list.
 *
 * WHAT DOES NOT COMPOSE (and why it stays a separate call, still gated on its
 * own widget being enabled):
 *
 *  - `ticket-sales`      — an external ticketing provider over HTTP, behind an
 *                          entitlement check. Not a Sanity read at all.
 *  - `workshop-capacity` — paginates workshop signups; the page count is not
 *                          knowable up front.
 *  - `speaker-engagement`— `getSpeakers` is `'use cache'`d for hours and applies
 *                          org-level scoping we must not reimplement inline.
 *  - `my-areas`          — message view counts are ALREADY one composed query
 *                          (`getConversationViewCounts`), and they are read only
 *                          when the viewer is on the team that shows them.
 */

import type { Conference } from '@/lib/conference/types'
import { getPhaseContext, getCurrentPhase } from '@/lib/conference/phase'
import { Status } from '@/lib/proposal/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import { calculateAverageRating } from '@/lib/proposal/business'
import { getSpeakers } from '@/lib/speaker/sanity'
import { Flags } from '@/lib/speaker/types'
import { resolveTicketingAdminAccess } from '@/lib/tickets/admin-access'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type { ProcessTicketSalesInput } from '@/lib/tickets/types'
import { DEFAULT_TARGET_CONFIG, DEFAULT_CAPACITY } from '@/lib/tickets/config'
import { TravelSupportStatus } from '@/lib/travel-support/types'
import { getWorkshopStatistics } from '@/lib/workshop/sanity'
import type { WorkshopStatistics } from '@/lib/workshop/types'
import { getConversationViewCounts } from '@/lib/messaging/sanity'
import type { OrganizerTeam } from '@/lib/teams/types'
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
} from './data-types'
import {
  fetchDashboardGroq,
  RECENT_ACTIVITY_LIMIT,
  type DashboardGroqSource,
  type DashboardGroqResult,
  type DashboardProposalRow,
  type DashboardReviewRow,
  type DashboardSponsorRow,
  type DashboardActivityRow,
  type DashboardRecentProposalRow,
  type DashboardTravelSupportRow,
} from './aggregate'

/* --------------------------------------------------------------------------
 * Keys and payloads
 * ------------------------------------------------------------------------ */

/**
 * Every widget that has server data. Kept in lockstep with `WIDGET_REGISTRY`
 * by `__tests__/lib/dashboard/composed-query.test.ts` — a widget added to the
 * registry without a data key (or vice versa) fails there rather than silently
 * rendering an empty card.
 */
export const DASHBOARD_WIDGET_KEYS = [
  'quick-actions',
  'review-progress',
  'proposal-pipeline',
  'upcoming-deadlines',
  'cfp-health',
  'schedule-builder',
  'ticket-sales',
  'speaker-engagement',
  'sponsor-pipeline',
  'workshop-capacity',
  'travel-support',
  'recent-activity',
  'my-areas',
] as const

export type DashboardWidgetKey = (typeof DASHBOARD_WIDGET_KEYS)[number]

const WIDGET_KEY_SET: ReadonlySet<string> = new Set(DASHBOARD_WIDGET_KEYS)

/** True for a string that names a widget with server data. */
export function isDashboardWidgetKey(
  value: unknown,
): value is DashboardWidgetKey {
  return typeof value === 'string' && WIDGET_KEY_SET.has(value)
}

/** The payload each widget key resolves to. */
export interface DashboardWidgetDataMap {
  'quick-actions': QuickAction[]
  'review-progress': ReviewProgressData
  'proposal-pipeline': ProposalPipelineData
  'upcoming-deadlines': DeadlineData[]
  'cfp-health': CFPHealthData
  'schedule-builder': ScheduleStatusData
  'ticket-sales': TicketSalesResult
  'speaker-engagement': SpeakerEngagementData
  'sponsor-pipeline': SponsorPipelineWidgetData
  'workshop-capacity': WorkshopStatistics
  'travel-support': TravelSupportData
  'recent-activity': ActivityItem[]
  'my-areas': MyAreasData
}

/**
 * Per-widget settled result. A batch must NOT be all-or-nothing: a failing
 * ticketing provider used to break only its own tile, and it still must.
 */
export type DashboardSliceResult<T> =
  { ok: true; value: T } | { ok: false; error: string }

export type DashboardBatch = {
  [K in DashboardWidgetKey]?: DashboardSliceResult<DashboardWidgetDataMap[K]>
}

/**
 * Everything the shapers are allowed to know. Assembled ONCE by the caller
 * after a single authorization pass and a single conference resolution.
 */
export interface DashboardContext {
  conference: Conference
  conferenceId: string
  /** Server-derived speaker id, or `null` when the session carries none. */
  speakerId: string | null
}

/* --------------------------------------------------------------------------
 * Source planning
 * ------------------------------------------------------------------------ */

/**
 * Which GROQ roots each widget needs. The union over the ENABLED widgets is the
 * whole query — nothing else is read.
 */
const WIDGET_GROQ_SOURCES: Record<
  DashboardWidgetKey,
  readonly DashboardGroqSource[]
> = {
  'quick-actions': ['proposals', 'sponsors'],
  'review-progress': ['proposals', 'reviews'],
  'proposal-pipeline': ['proposals'],
  'upcoming-deadlines': [],
  'cfp-health': ['proposals'],
  'schedule-builder': ['proposals'],
  'ticket-sales': [],
  'speaker-engagement': ['featuredSpeakerCount'],
  'sponsor-pipeline': ['sponsors', 'activities'],
  'workshop-capacity': [],
  'travel-support': ['travelSupports'],
  'recent-activity': ['activities', 'recentProposals'],
  // My areas adds count roots per TEAM the viewer is on — see sourcesForWidgets.
  'my-areas': [],
}

/**
 * Does this widget set need the SCHEDULE-expanded conference document? Only the
 * schedule builder does, and resolving the expanded document is a different
 * (more expensive) read, so it is not the default.
 */
export function needsScheduleExpansion(
  keys: Iterable<DashboardWidgetKey>,
): boolean {
  for (const key of keys) if (key === 'schedule-builder') return true
  return false
}

/**
 * Team keys whose "My areas" metric costs an extra count root. Membership is
 * read off the already-resolved conference document, so gating costs no query.
 */
function viewerTeams(ctx: DashboardContext): OrganizerTeam[] {
  const speakerId = ctx.speakerId
  if (!speakerId) return []
  const teams: OrganizerTeam[] = ctx.conference.teams ?? []
  return teams.filter((t) => t.members?.includes(speakerId))
}

/** The exact GROQ root set a widget selection needs, team gating included. */
export function sourcesForWidgets(
  keys: Iterable<DashboardWidgetKey>,
  myTeamKeys: ReadonlySet<string>,
): Set<DashboardGroqSource> {
  const sources = new Set<DashboardGroqSource>()
  for (const key of keys) {
    for (const source of WIDGET_GROQ_SOURCES[key]) sources.add(source)
    if (key === 'my-areas') {
      if (myTeamKeys.has('sponsors')) sources.add('unassignedSponsorCount')
      if (myTeamKeys.has('volunteers')) sources.add('pendingVolunteerCount')
    }
  }
  return sources
}

/* --------------------------------------------------------------------------
 * Shapers — pure, and the correctness bar
 * ------------------------------------------------------------------------ */

const rows = <T>(value: T[] | null | undefined): T[] => value ?? []

export function shapeDeadlines(conference: Conference): DeadlineData[] {
  const ctx = getPhaseContext(conference)
  const candidates: Omit<DeadlineData, 'urgency'>[] = []

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

export function shapeCFPHealth(
  conference: Conference,
  proposals: DashboardProposalRow[],
): CFPHealthData {
  const ctx = getPhaseContext(conference)
  const daysRemaining = ctx.daysUntilCfpClose ?? 0

  const byDate: Record<string, number> = {}
  for (const p of proposals) {
    const date = p._createdAt?.split('T')[0]
    if (date) byDate[date] = (byDate[date] || 0) + 1
  }
  const submissionsPerDay = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, count]) => ({ date, count }))

  const byFormat: Record<string, number> = {}
  for (const p of proposals) byFormat[p.format] = (byFormat[p.format] || 0) + 1
  const formatDistribution = Object.entries(byFormat).map(
    ([format, count]) => ({ format: formatLabel(format), count }),
  )

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
    proposals.length > 0
      ? Math.round((proposals.length / daysSinceOpen) * 10) / 10
      : 0

  return {
    totalSubmissions: proposals.length,
    submissionGoal: conference.cfpSubmissionGoal || 0,
    daysRemaining: Math.max(0, daysRemaining),
    averagePerDay,
    submissionsPerDay,
    formatDistribution,
  }
}

export function shapeProposalPipeline(
  proposals: DashboardProposalRow[],
): ProposalPipelineData {
  const submitted = proposals.length
  const accepted = proposals.filter((p) => p.status === Status.accepted).length
  const rejected = proposals.filter((p) => p.status === Status.rejected).length
  const confirmed = proposals.filter(
    (p) => p.status === Status.confirmed,
  ).length
  const pendingDecisions = proposals.filter(
    (p) => p.status === Status.submitted,
  ).length

  // Distinct speakers across confirmed talks (co-speakers deduped).
  const speakerIds = new Set<string>()
  for (const p of proposals) {
    if (p.status !== Status.confirmed) continue
    for (const id of p.speakerIds ?? []) if (id) speakerIds.add(id)
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

export function shapeReviewProgress(
  proposals: DashboardProposalRow[],
  reviews: DashboardReviewRow[],
): ReviewProgressData {
  const byProposal = new Map<string, DashboardReviewRow[]>()
  for (const review of reviews) {
    if (!review.proposalId) continue
    const list = byProposal.get(review.proposalId)
    if (list) list.push(review)
    else byProposal.set(review.proposalId, [review])
  }

  const withReviews = proposals.map((p) => ({
    proposal: p,
    reviews: byProposal.get(p._id) ?? [],
  }))
  const reviewed = withReviews.filter((p) => p.reviews.length > 0)

  const totalScores = reviewed.reduce(
    (sum, p) =>
      sum +
      calculateAverageRating({
        reviews: p.reviews,
      } as unknown as ProposalExisting),
    0,
  )
  const averageScore =
    reviewed.length > 0 ? (totalScores / reviewed.length) * 2 : 0

  // `proposals` arrives ordered `_updatedAt desc` — the same order the
  // standalone review query used, so "next unreviewed" picks the same talk.
  const unreviewed = withReviews.find(
    (p) => p.proposal.status === Status.submitted && p.reviews.length === 0,
  )

  return {
    reviewedCount: reviewed.length,
    totalProposals: proposals.length,
    percentage:
      proposals.length > 0 ? (reviewed.length / proposals.length) * 100 : 0,
    averageScore: Math.round(averageScore * 10) / 10,
    nextUnreviewed: unreviewed
      ? { id: unreviewed.proposal._id, title: unreviewed.proposal.title }
      : undefined,
  }
}

const PIPELINE_STAGES = ['prospect', 'contacted', 'negotiating', 'closed-won']
const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  negotiating: 'Negotiating',
  'closed-won': 'Closed Won',
}

export function shapeSponsorPipeline(
  conference: Conference,
  sponsors: DashboardSponsorRow[],
  activities: DashboardActivityRow[],
): SponsorPipelineWidgetData {
  const byStatus: Record<string, number> = {}
  const byStatusValue: Record<string, number> = {}
  let totalContractValue = 0
  let closedWonCount = 0
  let closedLostCount = 0

  for (const s of sponsors) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1
    byStatusValue[s.status] =
      (byStatusValue[s.status] || 0) + (s.contractValue || 0)
    if (s.status === 'closed-won') {
      closedWonCount++
      if (s.contractValue) totalContractValue += s.contractValue
    } else if (s.status === 'closed-lost') {
      closedLostCount++
    }
  }

  const stages = PIPELINE_STAGES.map((status) => ({
    name: STAGE_LABELS[status] || status,
    count: byStatus[status] || 0,
    value: byStatusValue[status] || 0,
    sponsors: sponsors
      .filter((s) => s.status === status)
      .map((s) => ({
        name: s.sponsor?.name || 'Unknown',
        logo: s.sponsor?.logo || undefined,
        logoBright: s.sponsor?.logoBright || undefined,
      })),
  }))

  return {
    stages,
    totalValue: totalContractValue,
    wonDeals: closedWonCount,
    lostDeals: closedLostCount,
    revenueGoal: conference.sponsorRevenueGoal || 0,
    recentActivity: activities.slice(0, 5).map((a) => ({
      id: a._id,
      sponsor: a.sponsorName || 'Unknown',
      activity: a.description,
      timestamp: formatRelativeTime(a.createdAt || a._createdAt),
    })),
  }
}

export function shapeRecentActivity(
  activities: DashboardActivityRow[],
  recentProposals: DashboardRecentProposalRow[],
): ActivityItem[] {
  const items: (ActivityItem & { _sortDate: string })[] = []

  for (const a of activities) {
    const isoDate = a.createdAt || a._createdAt
    items.push({
      id: a._id,
      type: 'sponsor',
      description: `${a.sponsorName || 'Sponsor'}: ${a.description}`,
      user: a.createdByName || 'System',
      timestamp: formatRelativeTime(isoDate),
      link: '/admin/sponsors/crm',
      _sortDate: isoDate,
    })
  }

  for (const p of recentProposals) {
    items.push({
      id: `proposal-${p._id}`,
      type: 'proposal',
      description: `New proposal: “${p.title}”`,
      user: p.speakerNames?.[0] || 'Unknown Speaker',
      timestamp: formatRelativeTime(p._createdAt),
      link: `/admin/proposals/${p._id}`,
      _sortDate: p._createdAt,
    })
  }

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

export function shapeTravelSupport(
  conference: Conference,
  travelSupports: DashboardTravelSupportRow[],
): TravelSupportData {
  const expenseTotal = (ts: DashboardTravelSupportRow) =>
    (ts.expenseAmounts ?? []).reduce<number>(
      (sum, amount) => sum + (amount || 0),
      0,
    )

  const pending = travelSupports.filter(
    (ts) => ts.status === TravelSupportStatus.SUBMITTED,
  )
  const approved = travelSupports.filter(
    (ts) =>
      ts.status === TravelSupportStatus.APPROVED ||
      ts.status === TravelSupportStatus.PAID,
  )

  const totalRequested = travelSupports.reduce(
    (sum, ts) => sum + (ts.totalAmount || expenseTotal(ts)),
    0,
  )
  const totalApproved = approved.reduce(
    (sum, ts) => sum + (ts.approvedAmount || 0),
    0,
  )

  return {
    pendingApprovals: pending.length,
    approvedCount: approved.length,
    totalRequested,
    totalApproved,
    budgetAllocated: conference.travelSupportBudget || 0,
    averageRequest:
      travelSupports.length > 0 ? totalRequested / travelSupports.length : 0,
    requests: pending.slice(0, 5).map((ts) => ({
      id: ts._id,
      speaker: ts.speakerName || 'Unknown',
      amount: ts.totalAmount || expenseTotal(ts) || 0,
      status: ts.status,
      submittedAt: ts.submittedAt
        ? formatRelativeTime(ts.submittedAt)
        : formatRelativeTime(ts._createdAt),
    })),
  }
}

export function shapeScheduleStatus(
  conference: Conference,
  proposals: DashboardProposalRow[],
): ScheduleStatusData {
  const schedules = conference.schedules || []

  let totalSlots = 0
  let filledSlots = 0
  let placeholderSlots = 0
  const byDay: { day: string; filled: number; total: number }[] = []
  const scheduledTalkIds = new Set<string>()

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
          if (slot.talk._id) scheduledTalkIds.add(slot.talk._id)
        } else if (slot.placeholder) {
          placeholderSlots++
        }
      }
    }
    byDay.push({
      day: formatConferenceDateShort(schedule.date),
      filled: dayFilled,
      total: dayTotal,
    })
  }

  const unassignedConfirmedTalks = proposals.filter(
    (p) =>
      (p.status === Status.confirmed || p.status === Status.accepted) &&
      !scheduledTalkIds.has(p._id),
  ).length

  return {
    totalSlots,
    filledSlots,
    percentage: totalSlots > 0 ? (filledSlots / totalSlots) * 100 : 0,
    byDay,
    unassignedConfirmedTalks,
    placeholderSlots,
  }
}

export function shapeQuickActions(
  conference: Conference,
  proposals: DashboardProposalRow[],
  sponsors: DashboardSponsorRow[],
): QuickAction[] {
  const phase = getCurrentPhase(conference)

  const badges = {
    sponsors: sponsors.filter(
      (s) => s.status === 'prospect' || s.status === 'contacted',
    ).length,
    proposals: proposals.filter((p) => p.status === Status.submitted).length,
    speakers: proposals.filter((p) => p.status === Status.accepted).length,
  }

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

/* --------------------------------------------------------------------------
 * Sources that cannot be composed into the one query
 * ------------------------------------------------------------------------ */

async function loadSpeakerEngagement(
  ctx: DashboardContext,
  featuredCount: number,
): Promise<SpeakerEngagementData> {
  const { speakers: speakerList, err } = await getSpeakers(ctx.conferenceId, [
    Status.submitted,
    Status.accepted,
    Status.confirmed,
  ])
  if (err) throw new Error(`Failed to fetch speakers: ${err.message}`)

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
    featuredCount,
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

async function loadTicketSales(
  conference: Conference,
): Promise<TicketSalesResult> {
  // The SAME resolution the ticket pages use, state for state — the tile must
  // not tell a different story than the page it links to. An operator's explicit
  // deny is a kill switch, so the tile stops streaming live sales; and an org
  // that is not entitled at all is NOT "unconfigured", because "connect a
  // provider in settings" is a dead end for a tenant whose plan does not include
  // ticketing. Only a genuinely entitled-but-unbound conference gets that nudge.
  const access = await resolveTicketingAdminAccess(conference)
  if (access.state === 'disabled') return { status: 'disabled' }
  if (access.state === 'unavailable') return { status: 'unavailable' }
  if (access.state !== 'ready') return { status: 'unconfigured' }

  try {
    const tickets = await access.provider.fetchEventTickets(access.eventRef)
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

    const input: ProcessTicketSalesInput = {
      tickets: tickets.map((t) => ({
        order_id: t.order_id,
        order_date: t.order_date,
        category: t.category,
        sum: t.sum,
      })),
      config: conference.ticketTargets || DEFAULT_TARGET_CONFIG,
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

    const salesDayCount =
      result.progression.filter((p) => p.actualTickets > 0).length || 1
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

/**
 * The viewer's "My areas": one card per team the CURRENT organizer belongs to,
 * each with a couple of needs-attention counts that deep-link to the filtered
 * surface. A SOFT LENS — read-only convenience scoped to the viewer's teams, no
 * access implications (docs/ORGANIZER_TEAMS.md).
 *
 * COST: still gated on membership. Team membership comes off the conference
 * document the dashboard already resolved (no query), the sponsor/volunteer
 * counts ride in the composed query as `count()` roots that are only emitted for
 * teams the viewer is on, and only the message view counts remain a call of
 * their own — itself a single composed query.
 */
async function loadMyAreas(
  ctx: DashboardContext,
  myTeams: readonly OrganizerTeam[],
  groqResult: DashboardGroqResult,
): Promise<MyAreasData> {
  const speakerId = ctx.speakerId
  if (!speakerId || myTeams.length === 0) return { areas: [] }

  const viewCounts = myTeams.some((t) => t.key === 'cfp')
    ? await getConversationViewCounts({
        speakerId,
        isOrganizer: true,
        conferenceId: ctx.conferenceId,
      })
    : null

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
              count: groqResult.unassignedSponsorCount ?? 0,
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
              count: groqResult.pendingVolunteerCount ?? 0,
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

/* --------------------------------------------------------------------------
 * The batch
 * ------------------------------------------------------------------------ */

async function settle<T>(
  produce: () => Promise<T> | T,
): Promise<DashboardSliceResult<T>> {
  try {
    return { ok: true, value: await produce() }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load widget data'
    console.error('Dashboard widget data failed:', error)
    return { ok: false, error: message }
  }
}

/**
 * Load data for exactly the requested widgets.
 *
 * ONE composed GROQ round-trip covers every Sanity-backed widget; the four
 * sources that cannot be composed run in parallel alongside it, and only when
 * their own widget is enabled. The caller has already authorized the request and
 * resolved the conference — this function never does either.
 */
export async function loadDashboardWidgetData(
  ctx: DashboardContext,
  keys: readonly DashboardWidgetKey[],
): Promise<DashboardBatch> {
  const wanted = new Set<DashboardWidgetKey>(keys)
  // Team membership comes off the conference document the caller already
  // resolved, so gating "My areas" on it costs no read of its own.
  const myTeams = wanted.has('my-areas') ? viewerTeams(ctx) : []
  const myTeamKeys = new Set(myTeams.map((t) => t.key))

  // A failed composed read is recorded, NOT thrown: it must fail exactly the
  // widgets that were reading through it, and leave the ones that were not —
  // deadlines (conference document only), ticket sales (an external provider)
  // and workshop capacity (its own paginated read) — rendering. Speaker
  // engagement is NOT in that set: it takes `featuredSpeakerCount` from the
  // composed query, and a featured count silently reported as 0 would be worse
  // than an error state.
  let groqResult: DashboardGroqResult = {}
  let groqError: Error | null = null
  try {
    groqResult = await fetchDashboardGroq(
      ctx.conferenceId,
      sourcesForWidgets(wanted, myTeamKeys),
    )
  } catch (error) {
    groqError = error instanceof Error ? error : new Error(String(error))
  }

  const proposals = rows(groqResult.proposals)
  const reviews = rows(groqResult.reviews)
  const sponsors = rows(groqResult.sponsors)
  const activities = rows(groqResult.activities)
  const recentProposals = rows(groqResult.recentProposals)
  const travelSupports = rows(groqResult.travelSupports)

  const batch: DashboardBatch = {}
  const pending: Promise<void>[] = []

  const add = <K extends DashboardWidgetKey>(
    key: K,
    produce: () =>
      Promise<DashboardWidgetDataMap[K]> | DashboardWidgetDataMap[K],
  ) => {
    if (!wanted.has(key)) return
    // A widget that contributed a root to the composed query cannot be shaped
    // from a read that failed — reporting zeros would be worse than an error
    // state, because the organizer could not tell the difference.
    const readsComposedQuery = sourcesForWidgets([key], myTeamKeys).size > 0
    const guarded = () => {
      if (groqError && readsComposedQuery) throw groqError
      return produce()
    }
    pending.push(
      settle(guarded).then((result) => {
        // TS cannot see that `batch[K]` and `DashboardSliceResult<Map[K]>`
        // are the same type for a bound K (it distributes the mapped type over
        // the whole union). The pairing is enforced by `add`'s own signature.
        batch[key] = result as DashboardBatch[K]
      }),
    )
  }

  add('upcoming-deadlines', () => shapeDeadlines(ctx.conference))
  add('cfp-health', () => shapeCFPHealth(ctx.conference, proposals))
  add('proposal-pipeline', () => shapeProposalPipeline(proposals))
  add('review-progress', () => shapeReviewProgress(proposals, reviews))
  add('quick-actions', () =>
    shapeQuickActions(ctx.conference, proposals, sponsors),
  )
  add('schedule-builder', () => shapeScheduleStatus(ctx.conference, proposals))
  add('sponsor-pipeline', () =>
    shapeSponsorPipeline(ctx.conference, sponsors, activities),
  )
  add('recent-activity', () => shapeRecentActivity(activities, recentProposals))
  add('travel-support', () =>
    shapeTravelSupport(ctx.conference, travelSupports),
  )
  add('speaker-engagement', () =>
    loadSpeakerEngagement(ctx, groqResult.featuredSpeakerCount ?? 0),
  )
  add('ticket-sales', () => loadTicketSales(ctx.conference))
  add('workshop-capacity', () => getWorkshopStatistics(ctx.conferenceId))
  add('my-areas', () => loadMyAreas(ctx, myTeams, groqResult))

  await Promise.all(pending)
  return batch
}
