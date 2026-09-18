import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ReportView } from '@/lib/marketing/report/types'
import { mockDateBeforeEach } from '@/lib/storybook'
import {
  ReportSections,
  OutcomeSummary,
  ChannelFunnel,
  ReportTimeline,
  TopTasks,
  PreviousEdition,
  PlanHealth,
} from './ReportSections'

const campaign = {
  _id: 'cfp',
  key: 'cfp',
  title: 'Call for papers',
  startDate: '2027-01-01',
  endDate: '2027-02-28',
  provisional: false,
  startMilestone: 'CFP_OPEN' as const,
  endMilestone: 'CFP_CLOSE' as const,
  primaryOutcome: 'cfpSubmissions' as const,
  target: 100,
  optional: false,
}
const measured = { observationDate: '2027-02-28', stale: false }
const unmeasured = { observationDate: null, stale: false }
const view: ReportView = {
  conference: { id: 'edition', title: 'Cloud Native Days Norway 2027' },
  plan: {
    _id: 'plan',
    ownerId: null,
    ownerName: null,
    templateVersion: '1',
    copiedFromTitle: null,
    createdAt: '2027-01-01T00:00:00Z',
  },
  range: {
    from: '2027-01-01',
    to: '2027-03-08',
    defaultFrom: '2027-01-01',
    defaultTo: '2027-03-08',
    grain: 'weekly',
  },
  semantics:
    'Latest measured cumulative observation in the selected range for each Campaign, not activity during the range. Unavailable readings retain the last measured value.',
  rankingMetric:
    'Ranked by latest measured cumulative combined clicks per Task in this range, then sessions. These are not period increments.',
  summary: [
    {
      ...campaign,
      value: 68,
      attributedValue: 39,
      observationDate: '2027-02-28',
      stale: false,
    },
  ],
  channels: [
    {
      channel: 'bluesky',
      sessions: 1204,
      clicks: 96,
      sessionsMeasurement: measured,
      clicksMeasurement: measured,
    },
    {
      channel: 'linkedin',
      sessions: 861,
      clicks: 72,
      sessionsMeasurement: measured,
      clicksMeasurement: measured,
    },
  ],
  unavailableStage:
    'Primary conversions and separate checkout clicks by Channel are unavailable: Snapshots store only combined per-Task clicks and no per-Task primary Outcome.',
  timeline: [
    {
      campaignId: 'cfp',
      title: 'Call for papers',
      outcome: 'cfpSubmissions',
      points: [
        { date: '2027-01-01', value: 0, stale: false },
        { date: '2027-01-08', value: 8, stale: false },
        { date: '2027-01-15', value: 24, stale: false },
        { date: '2027-01-22', value: 24, stale: true },
        { date: '2027-02-01', value: 43, stale: false },
        { date: '2027-02-15', value: 70, stale: false },
        { date: '2027-02-28', value: 68, stale: false },
      ],
    },
  ],
  campaigns: [campaign],
  milestones: {
    CFP_OPEN: { date: '2027-01-01', provisional: false },
    CFP_CLOSE: { date: '2027-02-28', provisional: false },
    CFP_NOTIFY: { date: '2027-03-01', provisional: true },
  },
  topTasks: [
    {
      taskId: 'launch',
      title: 'The call for papers is open',
      campaignId: 'cfp',
      campaignTitle: 'Call for papers',
      channel: 'bluesky',
      sessions: 1204,
      clicks: 96,
      blueskyInteractions: 214,
      sessionsMeasurement: measured,
      clicksMeasurement: measured,
      blueskyInteractionsMeasurement: measured,
    },
    {
      taskId: 'reminder',
      title: 'One week left to submit',
      campaignId: 'cfp',
      campaignTitle: 'Call for papers',
      channel: 'linkedin',
      sessions: 861,
      clicks: 72,
      blueskyInteractions: null,
      sessionsMeasurement: measured,
      clicksMeasurement: measured,
      blueskyInteractionsMeasurement: unmeasured,
    },
  ],
  previousEdition: {
    title: 'Cloud Native Days Norway 2026',
    campaigns: [
      {
        key: 'cfp',
        title: 'Call for papers',
        current: 68,
        previous: 54,
        comparable: true,
        reason: null,
      },
      {
        key: 'tickets',
        title: 'Ticket launch',
        current: 96,
        previous: null,
        comparable: false,
        reason: 'Outcome type or observation window changed.',
      },
    ],
  },
  health: {
    running: true,
    total: 24,
    complete: 18,
    overdue: 3,
    waiting: 2,
    failed: 1,
    unassigned: 4,
  },
  snapshots: [],
  tasks: [],
}
const meta = {
  title: 'Systems/Marketing/Report',
  component: ReportSections,
  parameters: { layout: 'fullscreen' },
  beforeEach: mockDateBeforeEach(new Date('2027-02-28T12:00:00Z')),
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50 p-3 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <Story />
      </div>
    ),
  ],
  args: { view },
} satisfies Meta<typeof ReportSections>
export default meta
type Story = StoryObj<typeof meta>
export const Summary: Story = { render: (args) => <OutcomeSummary {...args} /> }
export const Channels: Story = { render: (args) => <ChannelFunnel {...args} /> }
export const Timeline: Story = {
  render: (args) => <ReportTimeline {...args} />,
}
export const Tasks: Story = { render: (args) => <TopTasks {...args} /> }
export const Comparison: Story = {
  render: (args) => <PreviousEdition {...args} />,
}
export const Health: Story = { render: (args) => <PlanHealth {...args} /> }
export const CompleteReport: Story = {}
export const EmptyPlan: Story = {
  args: {
    view: {
      ...view,
      plan: null,
      summary: [],
      campaigns: [],
      channels: [],
      timeline: [],
      milestones: {},
      topTasks: [],
      previousEdition: null,
      health: {
        running: false,
        total: 0,
        complete: 0,
        overdue: 0,
        waiting: 0,
        failed: 0,
        unassigned: 0,
      },
    },
  },
}
export const UnavailableSources: Story = {
  args: {
    view: {
      ...view,
      summary: view.summary.map((c) => ({
        ...c,
        value: null,
        attributedValue: null,
        observationDate: null,
      })),
      channels: [
        {
          channel: 'bluesky',
          sessions: null,
          clicks: null,
          sessionsMeasurement: unmeasured,
          clicksMeasurement: unmeasured,
        },
      ],
      timeline: view.timeline.map((s) => ({
        ...s,
        points: s.points.map((p) => ({ ...p, value: null })),
      })),
      topTasks: [],
    },
  },
}

export const NoSnapshots: Story = {
  args: {
    view: {
      ...view,
      summary: view.summary.map((c) => ({
        ...c,
        value: null,
        attributedValue: null,
        observationDate: null,
      })),
      channels: [],
      topTasks: [],
      timeline: view.timeline.map((s) => ({ ...s, points: [] })),
    },
  },
}

export const PreservedHistory: Story = {
  args: {
    view: {
      ...view,
      breakdown: [
        ...view.summary,
        {
          ...view.summary[0],
          _id: 'retired',
          key: 'retired',
          title: 'Sponsor outreach',
          retired: true,
        },
      ],
      timeline: [
        ...view.timeline,
        {
          campaignId: 'cfp',
          title: 'Call for papers',
          outcome: 'ticketsSoldInWindow',
          metricChanged: true,
          points: [
            { date: '2027-03-01', value: null, stale: false },
            { date: '2027-03-02', value: 12, stale: false },
          ],
        },
      ],
    },
  },
}
