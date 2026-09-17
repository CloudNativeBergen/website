import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { mockDateBeforeEach } from '@/lib/storybook'
import { expandTemplate } from '@/lib/marketing/seed'
import { BUILTIN_TEMPLATE } from '@/lib/marketing/template'
import { resolveAllMilestones } from '@/lib/marketing/milestones'
import type { PlanView, TaskView } from '@/lib/marketing/types'
import { NotificationProvider } from '../NotificationProvider'
import { MarketingPlanHome } from './MarketingPlanHome'
import { MarketingPlanTimeline } from './MarketingPlanTimeline'

/**
 * A seeded plan as `marketing.plan.get` returns it: the REAL Template
 * expanded against a fixture edition with no optional Milestone set (so
 * the early-bird, registration and sponsor dates are provisional), then a
 * few Tasks moved along their lifecycle so every chip tone is on screen.
 */
const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  venueName: 'Grieghallen',
  ticketCapacity: 400,
  baseUrl: 'https://cloudnativebergen.dev',
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
}

function fixture(
  includeOptional: string[],
  today: string,
  source: typeof conference = conference,
): PlanView {
  let n = 0
  const seed = expandTemplate({
    template: BUILTIN_TEMPLATE,
    conference: source,
    includeOptional,
    ownerId: 'sp-1',
    now: '2026-09-01T00:00:00.000Z',
    newId: (type) => `${type}-${++n}`,
  })
  const tasks: TaskView[] = seed.tasks.map((t) => {
    const publishing = t.kind === 'publishing'
    const variant = seed.variants.find((v) => v._id === t.variantId)
    return {
      _id: t._id,
      campaignId: t.campaignId,
      key: t.key,
      title: t.title,
      kind: t.kind,
      channel: t.channel,
      date: publishing ? (variant?.scheduledAt ?? null) : (t.dueAt ?? null),
      provisional: t.provisional,
      milestone: t.milestone ?? null,
      status: publishing ? 'draft' : 'open',
      complete: false,
      prerequisiteIds: t.prerequisiteIds,
      variantId: t.variantId ?? null,
      assigneeId: t.assigneeId,
      approvedAt: null,
    }
  })
  const set = (key: string, patch: Partial<TaskView>) => {
    const task = tasks.find((t) => t.key === key)
    if (task) Object.assign(task, patch)
  }
  // Save the date went out; its render is done.
  set('saveTheDateRender', { status: 'done', complete: true })
  set('saveTheDate:linkedin', { status: 'published', complete: true })
  set('saveTheDate:bluesky', { status: 'published', complete: true })
  set('blueskySetup', { status: 'done', complete: true })
  // CFP open is scheduled on Bluesky, waiting on its render on LinkedIn.
  set('cfpOpen:bluesky', { status: 'scheduled' })
  set('cfpEncourage:bluesky', { status: 'failed' })
  set('cfpReminder4w:bluesky', { status: 'awaiting-manual' })
  set('speakerKit', { status: 'skipped' })

  const milestones = resolveAllMilestones(source)
  return {
    viewerId: 'sp-1',
    plan: {
      _id: seed.plan._id,
      ownerId: 'sp-1',
      ownerName: 'Ada Organizer',
      templateVersion: seed.plan.templateVersion,
      copiedFromTitle: null,
      createdAt: seed.plan.createdAt,
    },
    campaigns: seed.campaigns.map((c) => ({
      _id: c._id,
      key: c.key,
      title: c.title,
      startDate: c.startDate,
      endDate: c.endDate,
      provisional: c.provisional,
      startMilestone: c.startMilestone,
      endMilestone: c.endMilestone,
      primaryOutcome: c.primaryOutcome,
      target: c.target,
      optional: c.optional,
    })),
    tasks,
    milestones,
    today,
    ceilingWarnings: [],
    organizers: [
      { _id: 'sp-1', name: 'Ada Organizer' },
      { _id: 'sp-2', name: 'Grace Organizer' },
    ],
  }
}

/** Every optional Milestone set: nothing on the plan is provisional. */
const fullyDated = {
  ...conference,
  earlyBirdEndDate: '2027-04-10',
  registrationCloseDate: '2027-06-04',
  speakersAnnouncedDate: '2027-04-12',
  sponsorDeadlineDate: '2027-04-30',
  recordingsLiveDate: '2027-06-28',
  ticketTargets: { enabled: true, salesStartDate: '2027-02-15' },
}

const ok = () => HttpResponse.json({ result: { data: { success: true } } })

const handlers = (view: PlanView | null) => [
  http.get('/api/trpc/marketing.plan.get', () =>
    HttpResponse.json({ result: { data: view } }),
  ),
  // The quick popover (#1012): the assignee roster and its three writes.
  http.get('/api/trpc/sponsor.crm.listOrganizers', () =>
    HttpResponse.json({
      result: {
        data: [
          { _id: 'sp-1', name: 'Ada Organizer', email: 'ada@example.com' },
          { _id: 'sp-2', name: 'Bob Builder', email: 'bob@example.com' },
        ],
      },
    }),
  ),
  http.post('/api/trpc/marketing.task.setAssignee', ok),
  http.post('/api/trpc/marketing.task.setDate', ok),
  http.post('/api/trpc/marketing.task.approve', ok),
  http.post('/api/trpc/marketing.plan.setOwner', ok),
  // Copying a previous edition (#1017).
  http.get('/api/trpc/marketing.plan.copySources', () =>
    HttpResponse.json({
      result: {
        data: [
          {
            planId: 'marketingPlan.conf-2026',
            conferenceId: 'conf-2026',
            conferenceTitle: 'Cloud Native Bergen 2026',
            startDate: '2026-06-11',
            campaigns: 9,
            tasks: 71,
          },
          {
            planId: 'marketingPlan.conf-2025',
            conferenceId: 'conf-2025',
            conferenceTitle: 'Cloud Native Bergen 2025',
            startDate: '2025-06-12',
            campaigns: 8,
            tasks: 58,
          },
        ],
      },
    }),
  ),
  http.post('/api/trpc/marketing.plan.copy', () =>
    HttpResponse.json({
      result: {
        data: { planId: 'marketingPlan.conf-1', campaigns: 9, tasks: 71 },
      },
    }),
  ),
  http.post('/api/trpc/marketing.plan.seed', () =>
    HttpResponse.json({
      result: {
        data: { planId: 'marketingPlan.conf-1', campaigns: 9, tasks: 44 },
      },
    }),
  ),
]

const seeded = fixture(['sponsorAcquisition'], '2027-02-01')

const meta = {
  title: 'Systems/Marketing/Admin/MarketingPlanHome',
  component: MarketingPlanHome,
  args: { conferenceTitle: 'Cloud Native Bergen 2027' },
  // Deterministic dates (AGENTS.md): relative labels and overdue tones
  // must not drift with the wall clock between captures.
  beforeEach: mockDateBeforeEach(new Date('2026-09-15T10:00:00Z')),
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/admin/marketing', query: {} },
    },
    msw: { handlers: handlers(seeded) },
    docs: {
      description: {
        component:
          'The home of the marketing admin page (#1011): the edition’s Marketing Plan on its Milestone timeline — Campaign swimlanes, Kind-shaped Task chips, a today line, amber flags on provisional dates, a clock on chips waiting for a Prerequisite — or the seed call-to-action before a plan exists.',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-white p-6 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingPlanHome>

export default meta
type Story = StoryObj<typeof meta>

/** Nine campaigns (Keynotes skipped), provisional early-bird dates, one waiting chip. */
export const SeededPlan: Story = {}

export const SeededPlanDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** All ten, every Milestone set: no amber anywhere. */
export const AllMilestonesSet: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        fixture(['sponsorAcquisition', 'keynotes'], '2027-05-01', fullyDated),
      ),
    },
  },
}

/** Before seeding: the call to action, and the dialog it opens. */
export const NoPlanYet: Story = {
  parameters: { msw: { handlers: handlers(null) } },
}

/** Copying last edition's plan: the dialog lists the organization's other editions. */
export const CopyPreviousEdition: Story = {
  parameters: { msw: { handlers: handlers(null) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const [button] = await canvas.findAllByRole('button', {
      name: /Copy previous edition/,
    })
    await userEvent.click(button)
    const dialog = await within(document.body).findByRole('dialog')
    await expect(
      await within(dialog).findByRole('radio', {
        name: /Cloud Native Bergen 2026/,
      }),
    ).toBeChecked()
    await expect(
      within(dialog).getByRole('button', { name: 'Copy plan' }),
    ).toBeEnabled()
  },
}

/** A plan copied from last edition, going over two channel ceilings (#1016). */
export const CopiedPlanOverCeilings: Story = {
  parameters: {
    msw: {
      handlers: handlers({
        ...seeded,
        plan: {
          ...seeded.plan,
          templateVersion: 'copy:marketingPlan.conf-2026',
          copiedFromTitle: 'Cloud Native Bergen 2026',
        },
        ceilingWarnings: [
          'LinkedIn has 2 posts on 8. april 2027; the ceiling outside event week is 1 a day.',
          'LinkedIn has 4 countdown posts; the ceiling is 3.',
        ],
      }),
    },
  },
}

/** A chip clicked: the quick popover with assignee, date and approve (#1012). */
export const ChipPopoverOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chips = await canvas.findAllByRole('button', {
      name: /^CFP open \(Post · LinkedIn\)/,
    })
    await userEvent.click(chips[0])
    const popover = await within(document.body).findByTestId(
      'task-quick-popover',
    )
    await expect(
      within(popover).getByRole('button', { name: /Approve/ }),
    ).toBeEnabled()
    await expect(
      within(popover).getByRole('link', { name: /Open editor/ }),
    ).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/admin\/marketing\/tasks\//),
    )
  },
}

/** The timeline alone, for the board itself. */
export const TimelineOnly: StoryObj<typeof MarketingPlanTimeline> = {
  render: () => <MarketingPlanTimeline view={seeded} />,
}

/** The complete 94-Task edition, with the same columns as the Campaign ledger. */
export const ListView: Story = {
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { query: { view: 'list' } } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const table = await canvas.findByRole('table', {
      name: 'Marketing plan tasks',
    })
    await expect(within(table).getAllByRole('row')).toHaveLength(95)
    await expect(within(table).getAllByRole('columnheader')).toHaveLength(7)
  },
}

/** A URL-selected subset, inspectable without opening any filter controls. */
export const FilteredSubset: Story = {
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      navigation: {
        query: { view: 'list', channel: 'bluesky', status: 'draft' },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const table = await within(canvasElement).findByRole('table', {
      name: 'Marketing plan tasks',
    })
    const expected = seeded.tasks.filter(
      (task) => task.channel === 'bluesky' && task.status === 'draft',
    )
    await expect(within(table).getAllByRole('row')).toHaveLength(
      expected.length + 1,
    )
  },
}

/** Checklist Tasks never carry the publishing lifecycle's published status. */
export const EmptyFilterResult: Story = {
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      navigation: {
        query: { view: 'list', kind: 'checklist', status: 'published' },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('No tasks match these filters'),
    ).toBeVisible()
  },
}

/** Today precedes every Campaign, so the default derives nine collapsed lanes. */
export const CollapsedCampaigns: Story = {
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: handlers({ ...seeded, today: '2026-01-01' }) },
  },
}

// A real expansion-shaped burst: 30 daily Bluesky Tasks in the final-push lane.
// Keep the rest of the seeded edition so this exercises density in context.
const finalPush = seeded.campaigns.find(
  (campaign) => campaign.key === 'finalPush',
)!
const countdown = seeded.tasks.find(
  (task) => task.campaignId === finalPush._id && task.channel === 'bluesky',
)!
const denseBurst: PlanView = {
  ...seeded,
  today: '2027-05-20',
  tasks: [
    ...seeded.tasks,
    ...Array.from({ length: 30 }, (_, day): TaskView => ({
      ...countdown,
      _id: `expanded-countdown-${day}`,
      key: `expanded-countdown-${day}`,
      title: `Countdown: ${30 - day} days to go`,
      date: new Date(Date.UTC(2027, 4, 11 + day, 10)).toISOString(),
      variantId: `expanded-countdown-variant-${day}`,
      status: 'draft',
      complete: false,
      prerequisiteIds: [],
    })),
  ],
}

export const DenseBurst: Story = {
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: handlers(denseBurst) },
  },
}

export const DenseBurstMobile: Story = {
  ...DenseBurst,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('button', { name: 'Filters' }),
    ).toBeVisible()
  },
  parameters: {
    ...DenseBurst.parameters,
    viewport: { defaultViewport: 'phone' },
  },
}

export const ListViewMobile: Story = {
  ...ListView,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const table = await canvas.findByRole('table', {
      name: 'Marketing plan tasks',
    })
    await expect(within(table).getAllByRole('row')).toHaveLength(95)
    await expect(canvas.getByRole('button', { name: 'Filters' })).toBeVisible()
  },
  parameters: {
    ...ListView.parameters,
    viewport: { defaultViewport: 'phone' },
  },
}

/** Switching representations preserves the exact filtered row set. */
export const FiltersSurviveViewSwitch: Story = {
  ...FilteredSubset,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const table = await canvas.findByRole('table', {
      name: 'Marketing plan tasks',
    })
    const taskLinks = () =>
      within(canvas.getByRole('table', { name: 'Marketing plan tasks' }))
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.includes('/tasks/'))
        .map((link) => link.getAttribute('href'))
    const before = taskLinks()
    const expected = seeded.tasks.filter(
      (task) => task.channel === 'bluesky' && task.status === 'draft',
    ).length
    await expect(within(table).getAllByRole('row')).toHaveLength(expected + 1)
    await userEvent.click(canvas.getByRole('button', { name: 'Timeline' }))
    await expect(
      canvas.getByRole('button', { name: 'Timeline' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('status')).toHaveTextContent(
      `${expected} of 94 tasks`,
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Task list' }))
    await canvas.findByRole('table', { name: 'Marketing plan tasks' })
    await expect(taskLinks()).toEqual(before)
  },
}
