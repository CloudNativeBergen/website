/**
 * Deterministic fixtures for the widget state x size matrix stories.
 *
 * Conference phase is DERIVED from dates via `getCurrentPhase()`, and the
 * phase helpers in `src/lib/conference/state.ts` compare against the real
 * clock. Fixture dates are therefore computed RELATIVE to `new Date()` at
 * module-load time so each fixture always lands in the intended phase, on any
 * day the stories are built. Displayed values that must stay pixel-stable
 * (counts, day totals, trend data) are fixed numbers in the data fixtures.
 */

import type { Conference } from '@/lib/conference/types'
import type { ConferencePhase } from '@/lib/conference/phase'
import type {
  ActivityItem,
  CFPHealthData,
  DeadlineData,
  MyAreasData,
  ProposalPipelineData,
  QuickAction,
  ReviewProgressData,
  ScheduleStatusData,
  SpeakerEngagementData,
  SponsorPipelineWidgetData,
  TicketSalesResult,
  TravelSupportData,
} from '@/lib/dashboard/data-types'
import type { WorkshopStatistics } from '@/lib/workshop/types'

/* ---------- Conference-in-phase builders ---------- */

const DAY_MS = 86_400_000

/** Date-only ISO string N days from now (cfp fields require date-only). */
const isoDate = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10)

interface PhaseDates {
  cfpStartDate: string
  cfpEndDate: string
  cfpNotifyDate: string
  programDate: string
  startDate: string
  endDate: string
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
}

/**
 * Phase boundaries (see src/lib/conference/phase.ts + state.ts):
 * - initialization: before cfpStartDate
 * - planning:       CFP open (cfpStart..cfpEnd) or closed-but-unpublished
 * - execution:      programDate passed, conference not over
 * - post-conference: day after endDate passed
 */
const PHASE_DATES: Record<ConferencePhase, () => PhaseDates> = {
  initialization: () => ({
    cfpStartDate: isoDate(30),
    cfpEndDate: isoDate(60),
    cfpNotifyDate: isoDate(75),
    programDate: isoDate(100),
    startDate: isoDate(130),
    endDate: isoDate(131),
    workshopRegistrationStart: isoDate(90),
    workshopRegistrationEnd: isoDate(120),
  }),
  planning: () => ({
    cfpStartDate: isoDate(-10),
    cfpEndDate: isoDate(20),
    cfpNotifyDate: isoDate(35),
    programDate: isoDate(50),
    startDate: isoDate(90),
    endDate: isoDate(91),
    workshopRegistrationStart: isoDate(55),
    workshopRegistrationEnd: isoDate(85),
  }),
  execution: () => ({
    cfpStartDate: isoDate(-90),
    cfpEndDate: isoDate(-50),
    cfpNotifyDate: isoDate(-35),
    programDate: isoDate(-10),
    startDate: isoDate(14),
    endDate: isoDate(15),
    workshopRegistrationStart: isoDate(-10),
    workshopRegistrationEnd: isoDate(10),
  }),
  'post-conference': () => ({
    cfpStartDate: isoDate(-200),
    cfpEndDate: isoDate(-160),
    cfpNotifyDate: isoDate(-140),
    programDate: isoDate(-100),
    startDate: isoDate(-31),
    endDate: isoDate(-30),
    workshopRegistrationStart: isoDate(-120),
    workshopRegistrationEnd: isoDate(-40),
  }),
}

/**
 * A valid Conference whose dates put `getCurrentPhase()` in `phase`.
 * The `id` doubles as the mock-action dispatch key (see mock-admin-actions.ts)
 * — give every state cell in a story its own id.
 */
export function conferenceInPhase(
  phase: ConferencePhase,
  id: string,
): Conference {
  return {
    _id: id,
    title: 'Cloud Native Days Bergen 2026',
    organizer: 'Cloud Native Bergen',
    city: 'Bergen',
    country: 'Norway',
    cfpEmail: 'cfp@example.org',
    sponsorEmail: 'sponsor@example.org',
    contactEmail: 'contact@example.org',
    registrationEnabled: true,
    ticketCapacity: 400,
    sponsorRevenueGoal: 1_000_000,
    travelSupportBudget: 150_000,
    organizers: [],
    domains: ['cloudnativebergen.dev'],
    formats: [],
    topics: [],
    ...PHASE_DATES[phase](),
  }
}

/* ---------- Widget data fixtures ---------- */

/** Fixed dates for trend axes (display-only; no phase logic reads them). */
const trendDate = (i: number): string =>
  `2026-06-${String(i + 1).padStart(2, '0')}`

export const quickActionsDense: QuickAction[] = [
  {
    label: 'Review pending proposals for the programme committee',
    shortLabel: 'Review proposals',
    icon: 'ClipboardDocumentCheckIcon',
    link: '/admin/proposals',
    badge: 128,
    variant: 'primary',
  },
  {
    label: 'Confirm speakers awaiting response',
    shortLabel: 'Confirm speakers',
    icon: 'UserGroupIcon',
    link: '/admin/speakers',
    badge: 12,
    variant: 'warning',
  },
  {
    label: 'Sponsor pipeline follow-ups',
    shortLabel: 'Sponsors',
    icon: 'CurrencyDollarIcon',
    link: '/admin/sponsors/crm',
    badge: 7,
    variant: 'success',
  },
  {
    label: 'Travel support requests',
    shortLabel: 'Travel',
    icon: 'GlobeAltIcon',
    link: '/admin/speakers/travel-support',
    badge: 3,
    variant: 'secondary',
  },
  {
    label: 'Build the conference schedule',
    shortLabel: 'Schedule',
    icon: 'CalendarIcon',
    link: '/admin/schedule',
    variant: 'secondary',
  },
  {
    label: 'Conference settings and configuration',
    shortLabel: 'Settings',
    icon: 'Cog6ToothIcon',
    link: '/admin/settings',
    variant: 'secondary',
  },
]

export const quickActionsSparse: QuickAction[] = quickActionsDense.slice(0, 2)

export const reviewProgressDense: ReviewProgressData = {
  reviewedCount: 132,
  totalProposals: 180,
  percentage: 73.3,
  averageScore: 7.6,
  nextUnreviewed: {
    id: 'proposal-1',
    title:
      'Kubernetes multi-cluster fleet management with GitOps at planet scale — lessons from 400 clusters',
  },
}

export const reviewProgressSparse: ReviewProgressData = {
  reviewedCount: 2,
  totalProposals: 41,
  percentage: 4.9,
  averageScore: 6.0,
}

export const proposalPipelineDense: ProposalPipelineData = {
  submitted: 180,
  accepted: 58,
  rejected: 70,
  confirmed: 46,
  total: 180,
  acceptanceRate: 32.2,
  pendingDecisions: 52,
  distinctSpeakers: 41,
}

export const proposalPipelineSparse: ProposalPipelineData = {
  submitted: 3,
  accepted: 0,
  rejected: 0,
  confirmed: 0,
  total: 3,
  acceptanceRate: 0,
  pendingDecisions: 3,
  distinctSpeakers: 3,
}

export const deadlinesDense: DeadlineData[] = [
  {
    name: 'CFP closes — final call for lightning talks and workshops',
    date: '2026-08-11',
    daysRemaining: 2,
    urgency: 'high',
    phase: 'CFP & Review',
    action: 'Review',
    actionLink: '/admin/proposals',
  },
  {
    name: 'Speaker notification emails',
    date: '2026-08-15',
    daysRemaining: 6,
    urgency: 'high',
    phase: 'CFP & Review',
    action: 'Notify',
    actionLink: '/admin/speakers',
  },
  {
    name: 'Early-bird ticket price ends',
    date: '2026-08-21',
    daysRemaining: 12,
    urgency: 'medium',
    phase: 'Tickets',
  },
  {
    name: 'Program publication',
    date: '2026-09-03',
    daysRemaining: 25,
    urgency: 'medium',
    phase: 'Schedule',
    action: 'Build',
    actionLink: '/admin/schedule',
  },
  {
    name: 'Sponsor contract signing deadline for profiling in print material',
    date: '2026-09-18',
    daysRemaining: 40,
    urgency: 'low',
    phase: 'Sponsors',
  },
  {
    name: 'Workshop registration opens',
    date: '2026-10-13',
    daysRemaining: 65,
    urgency: 'low',
    phase: 'Workshops',
  },
  {
    name: 'Travel support payment run',
    date: '2026-11-07',
    daysRemaining: 90,
    urgency: 'low',
    phase: 'Travel',
  },
  {
    name: 'Conference day',
    date: '2026-12-07',
    daysRemaining: 120,
    urgency: 'low',
    phase: 'Event',
  },
]

export const cfpHealthDense: CFPHealthData = {
  totalSubmissions: 124,
  submissionGoal: 150,
  // 14-day trend — the known-risk axis for narrow cells.
  submissionsPerDay: [3, 5, 2, 0, 7, 9, 4, 6, 12, 8, 0, 11, 18, 14].map(
    (count, i) => ({ date: trendDate(i), count }),
  ),
  formatDistribution: [
    { format: 'Presentation (40 min)', count: 52 },
    { format: 'Lightning Talk (10 min)', count: 31 },
    { format: 'Workshop (2 hours)', count: 17 },
    { format: 'Panel Discussion', count: 11 },
    { format: 'Keynote', count: 7 },
    { format: 'Birds of a Feather', count: 6 },
  ],
  daysRemaining: 9,
  averagePerDay: 6.4,
}

export const cfpHealthSparse: CFPHealthData = {
  totalSubmissions: 3,
  submissionGoal: 150,
  submissionsPerDay: [1, 0, 2].map((count, i) => ({
    date: trendDate(i),
    count,
  })),
  formatDistribution: [{ format: 'Presentation (40 min)', count: 3 }],
  daysRemaining: 27,
  averagePerDay: 1.0,
}

export const cfpHealthZero: CFPHealthData = {
  totalSubmissions: 0,
  submissionGoal: 150,
  submissionsPerDay: [],
  formatDistribution: [],
  daysRemaining: 30,
  averagePerDay: 0,
}

export const scheduleStatusDense: ScheduleStatusData = {
  totalSlots: 54,
  filledSlots: 31,
  percentage: 57.4,
  byDay: [
    { day: 'Wed Oct 28', filled: 14, total: 18 },
    { day: 'Thu Oct 29', filled: 11, total: 18 },
    { day: 'Fri Oct 30', filled: 6, total: 18 },
  ],
  unassignedConfirmedTalks: 7,
  placeholderSlots: 4,
}

export const scheduleStatusSparse: ScheduleStatusData = {
  totalSlots: 18,
  filledSlots: 1,
  percentage: 5.6,
  byDay: [{ day: 'Wed Oct 28', filled: 1, total: 18 }],
  unassignedConfirmedTalks: 0,
  placeholderSlots: 0,
}

export const ticketSalesSelling: TicketSalesResult = {
  status: 'ok',
  data: {
    currentSales: 264,
    capacity: 400,
    percentage: 66,
    revenue: 792_000,
    salesByDate: [
      12, 18, 25, 31, 44, 58, 71, 90, 118, 147, 172, 201, 233, 264,
    ].map((sales, i) => ({
      date: trendDate(i),
      sales,
      target: 20 + i * 19,
    })),
    milestones: [
      { name: 'Early bird sold out', target: 100, reached: true },
      { name: 'Break-even', target: 200, reached: true },
      { name: 'Regular target', target: 320, reached: false },
      { name: 'Sold out', target: 400, reached: false },
    ],
    daysUntilEvent: 23,
    salesVelocity: 5.8,
  },
}

export const ticketSalesZero: TicketSalesResult = {
  status: 'ok',
  data: {
    currentSales: 0,
    capacity: 400,
    percentage: 0,
    revenue: 0,
    salesByDate: [],
    milestones: [
      { name: 'Early bird sold out', target: 100, reached: false },
      { name: 'Break-even', target: 200, reached: false },
      { name: 'Sold out', target: 400, reached: false },
    ],
    daysUntilEvent: 88,
    salesVelocity: 0,
  },
}

export const ticketSalesUnconfigured: TicketSalesResult = {
  status: 'unconfigured',
}

export const ticketSalesApiError: TicketSalesResult = { status: 'error' }

export const speakerEngagementDense: SpeakerEngagementData = {
  totalSpeakers: 87,
  featuredCount: 6,
  newSpeakers: 24,
  diverseSpeakers: 31,
  localSpeakers: 40,
  awaitingConfirmation: 9,
  averageProposalsPerSpeaker: 1.6,
}

export const speakerEngagementSparse: SpeakerEngagementData = {
  totalSpeakers: 2,
  featuredCount: 0,
  newSpeakers: 1,
  diverseSpeakers: 0,
  localSpeakers: 2,
  awaitingConfirmation: 0,
  averageProposalsPerSpeaker: 1.0,
}

/**
 * Tiny inline SVG the SponsorLogo/InlineSvg pipeline can render offline.
 * The explicit width/height matter: with only a viewBox the SVG has no
 * intrinsic size, and inside the logo chip's shrink-to-fit flex context it
 * resolved to 0x0 (blank chips). Real sponsor logos carry intrinsic sizes.
 */
const sponsorLogoSvg = (fill: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="16" viewBox="0 0 48 16"><rect width="48" height="16" rx="3" fill="${fill}"/><text x="24" y="11.5" font-size="8" fill="#ffffff" text-anchor="middle" font-family="sans-serif">LOGO</text></svg>`

export const sponsorPipelineDense: SponsorPipelineWidgetData = {
  stages: [
    {
      name: 'Prospect',
      count: 12,
      value: 240_000,
      sponsors: [
        { name: 'Fjordtech Consulting Scandinavia ASA' },
        { name: 'Nordlys', logo: sponsorLogoSvg('#1d4ed8') },
        { name: 'Bryggen Systems' },
        { name: 'Vestland Cloud', logo: sponsorLogoSvg('#0e7490') },
        { name: 'Hanseatic Hosting' },
        { name: 'Skyfri' },
      ],
    },
    {
      name: 'Contacted',
      count: 8,
      value: 310_000,
      sponsors: [
        { name: 'Aurora DevOps', logo: sponsorLogoSvg('#7c3aed') },
        { name: 'Bergen Bits' },
        { name: 'Trollfjord Technologies International AS' },
        { name: 'Kystnett', logo: sponsorLogoSvg('#b45309') },
        { name: 'Regnvær Labs' },
      ],
    },
    {
      name: 'Negotiating',
      count: 5,
      value: 275_000,
      sponsors: [
        { name: 'Grieg Digital', logo: sponsorLogoSvg('#15803d') },
        { name: 'Sjøkanten Software' },
        { name: 'Platform Company With A Remarkably Long Name GmbH' },
      ],
    },
    {
      name: 'Signed',
      count: 9,
      value: 460_000,
      sponsors: [
        { name: 'Fløyen Cloud', logo: sponsorLogoSvg('#be123c') },
        { name: 'Ulriken Compute', logo: sponsorLogoSvg('#0f766e') },
        { name: 'Damsgård Data' },
        { name: 'Sandviken Solutions' },
        { name: 'Laksevåg Logic' },
        { name: 'Åsane Analytics' },
      ],
    },
  ],
  totalValue: 745_000,
  wonDeals: 9,
  lostDeals: 4,
  revenueGoal: 1_000_000,
  recentActivity: [
    {
      id: 'act-1',
      sponsor: 'Grieg Digital',
      activity: 'Moved to negotiating',
      timestamp: '2 hours ago',
    },
    {
      id: 'act-2',
      sponsor: 'Fløyen Cloud',
      activity: 'Contract signed',
      timestamp: 'Yesterday',
    },
  ],
}

export const sponsorPipelineEmptyGoalSet: SponsorPipelineWidgetData = {
  stages: [
    { name: 'Prospect', count: 0, value: 0, sponsors: [] },
    { name: 'Contacted', count: 0, value: 0, sponsors: [] },
    { name: 'Negotiating', count: 0, value: 0, sponsors: [] },
    { name: 'Signed', count: 0, value: 0, sponsors: [] },
  ],
  totalValue: 0,
  wonDeals: 0,
  lostDeals: 0,
  revenueGoal: 1_000_000,
  recentActivity: [],
}

export const travelSupportPending: TravelSupportData = {
  pendingApprovals: 6,
  approvedCount: 9,
  totalRequested: 187_000,
  totalApproved: 96_000,
  budgetAllocated: 150_000,
  averageRequest: 8_900,
  requests: [
    {
      id: 'ts-1',
      speaker: 'Ingrid Johannessen-Bakkelund',
      amount: 12_400,
      status: 'pending',
      submittedAt: '2 days ago',
    },
    {
      id: 'ts-2',
      speaker: 'Aleksander Nygaardsvold',
      amount: 8_750,
      status: 'pending',
      submittedAt: '3 days ago',
    },
    {
      id: 'ts-3',
      speaker: 'María Fernanda de la Cruz Villanueva',
      amount: 15_900,
      status: 'pending',
      submittedAt: '5 days ago',
    },
    {
      id: 'ts-4',
      speaker: 'Bartholomew Featherstonehaugh III',
      amount: 6_200,
      status: 'pending',
      submittedAt: '1 week ago',
    },
    {
      id: 'ts-5',
      speaker: 'Liv Ullmann-Strand',
      amount: 9_800,
      status: 'pending',
      submittedAt: '1 week ago',
    },
    {
      id: 'ts-6',
      speaker: 'Chidi Okonkwo-Adeyemi',
      amount: 11_300,
      status: 'pending',
      submittedAt: '2 weeks ago',
    },
  ],
}

export const travelSupportQuiet: TravelSupportData = {
  pendingApprovals: 0,
  approvedCount: 3,
  totalRequested: 31_000,
  totalApproved: 24_000,
  budgetAllocated: 150_000,
  averageRequest: 8_000,
  requests: [],
}

export const workshopCapacityDense: WorkshopStatistics = {
  workshops: [
    {
      workshopId: 'ws-1',
      workshopTitle:
        'Hands-on Kubernetes security hardening: from Pod Security Standards to runtime detection',
      capacity: 30,
      totalSignups: 42,
      confirmedSignups: 30,
      pendingSignups: 2,
      waitlistSignups: 8,
      cancelledSignups: 2,
      utilization: 100,
    },
    {
      workshopId: 'ws-2',
      workshopTitle: 'GitOps with Flux and OpenTofu',
      capacity: 25,
      totalSignups: 26,
      confirmedSignups: 24,
      pendingSignups: 1,
      waitlistSignups: 1,
      cancelledSignups: 0,
      utilization: 96,
    },
    {
      workshopId: 'ws-3',
      workshopTitle: 'Observability with OpenTelemetry, Prometheus and Grafana',
      capacity: 28,
      totalSignups: 25,
      confirmedSignups: 23,
      pendingSignups: 2,
      waitlistSignups: 0,
      cancelledSignups: 0,
      utilization: 82,
    },
    {
      workshopId: 'ws-4',
      workshopTitle: 'Platform engineering on Backstage',
      capacity: 20,
      totalSignups: 12,
      confirmedSignups: 11,
      pendingSignups: 1,
      waitlistSignups: 0,
      cancelledSignups: 1,
      utilization: 55,
    },
    {
      workshopId: 'ws-5',
      workshopTitle: 'WebAssembly on the server with wasmCloud',
      capacity: 24,
      totalSignups: 8,
      confirmedSignups: 7,
      pendingSignups: 1,
      waitlistSignups: 0,
      cancelledSignups: 0,
      utilization: 30,
    },
    {
      workshopId: 'ws-6',
      workshopTitle: 'Chaos engineering for distributed systems practitioners',
      capacity: 18,
      totalSignups: 23,
      confirmedSignups: 18,
      pendingSignups: 0,
      waitlistSignups: 5,
      cancelledSignups: 0,
      utilization: 100,
    },
  ],
  totals: {
    totalWorkshops: 6,
    totalCapacity: 145,
    totalSignups: 136,
    uniqueParticipants: 121,
    totalConfirmed: 113,
    totalPending: 7,
    totalWaitlist: 14,
    totalCancelled: 3,
    averageUtilization: 77.2,
  },
}

const activityTypes = ['proposal', 'review', 'sponsor', 'speaker'] as const

export const recentActivityDense: ActivityItem[] = Array.from(
  { length: 24 },
  (_, i) => ({
    id: `activity-${i + 1}`,
    type: activityTypes[i % activityTypes.length],
    description: [
      'New proposal submitted: "Scaling stateful workloads across availability zones without tears"',
      'Review completed for "eBPF-powered networking deep dive" (score 8/10)',
      'Sponsor "Fløyen Cloud" signed the gold-tier contract with booth add-on',
      'Speaker Ingrid Johannessen-Bakkelund confirmed her keynote slot',
    ][i % 4],
    user: ['Kari Nordmann', 'Ola Nordmann', 'Ada Lovelace', 'Grace Hopper'][
      i % 4
    ],
    timestamp: `${i + 1}h ago`,
    link: i % 3 === 0 ? '/admin/proposals' : undefined,
  }),
)

export const recentActivitySparse: ActivityItem[] = recentActivityDense.slice(
  0,
  2,
)

export const myAreasTwoTeams: MyAreasData = {
  areas: [
    {
      key: 'cfp',
      title: 'Programme Committee',
      metrics: [
        {
          label: 'Messages needing reply',
          count: 4,
          href: '/admin/messages?view=needs-reply',
        },
        {
          label: 'Unassigned conversations',
          count: 128,
          href: '/admin/messages?view=unassigned',
        },
      ],
    },
    {
      key: 'sponsors',
      title: 'Sales & Partnerships',
      metrics: [
        {
          label: 'Unassigned sponsors',
          count: 0,
          href: '/admin/sponsors/crm?assignedTo=unassigned',
        },
        {
          label: 'Contracts awaiting signature',
          count: 3,
          href: '/admin/sponsors/crm?state=contract',
        },
      ],
    },
  ],
}
