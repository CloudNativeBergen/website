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
      milestone: t.milestone,
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

  return {
    plan: {
      _id: seed.plan._id,
      ownerId: 'sp-1',
      ownerName: 'Ada Organizer',
      templateVersion: seed.plan.templateVersion,
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
    milestones: resolveAllMilestones(source),
    today,
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
