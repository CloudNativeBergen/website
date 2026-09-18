import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, within } from 'storybook/test'
import { ThemeProvider } from 'next-themes'
import { mockDateBeforeEach } from '@/lib/storybook'
import type {
  CampaignLedgerView,
  LedgerSnapshot,
  TaskView,
} from '@/lib/marketing/types'
import { NotificationProvider } from '../NotificationProvider'
import { CampaignLedgerPage } from './CampaignLedgerPage'

const CAMPAIGN_ID = 'marketingCampaign-1'

function task(overrides: Partial<TaskView> = {}): TaskView {
  return {
    _id: 'task-1',
    campaignId: CAMPAIGN_ID,
    key: 'cfp:launch:bluesky',
    title: 'The call for papers is open',
    kind: 'publishing',
    channel: 'bluesky',
    date: '2027-01-10T18:00:00.000Z',
    provisional: false,
    milestone: 'CFP_OPEN',
    status: 'published',
    complete: true,
    prerequisiteIds: [],
    variantId: 'variant-1',
    assigneeId: 'sp-1',
    approvedAt: '2027-01-09T09:00:00.000Z',
    ...overrides,
  }
}

const TASKS: TaskView[] = [
  task(),
  task({
    _id: 'task-2',
    key: 'cfp:launch:linkedin',
    title: 'The call for papers is open (LinkedIn)',
    channel: 'linkedin',
    date: '2027-01-11T08:00:00.000Z',
    assigneeId: 'sp-2',
  }),
  task({
    _id: 'task-3',
    key: 'cfp:reminder:bluesky',
    title: 'One week left to submit',
    date: '2027-02-22T18:00:00.000Z',
    status: 'scheduled',
    complete: false,
  }),
  task({
    _id: 'task-4',
    key: 'cfp:speakerCard',
    title: 'Render the CFP promo card',
    kind: 'studioRender',
    channel: null,
    date: '2027-01-08T09:00:00.000Z',
    status: 'done',
    variantId: null,
  }),
  task({
    _id: 'task-5',
    key: 'cfp:outreach',
    title: 'Nudge last edition’s speakers',
    kind: 'speakerOutreach',
    channel: null,
    date: '2027-02-01T09:00:00.000Z',
    status: 'open',
    complete: false,
    variantId: null,
    assigneeId: 'sp-2',
  }),
]

function snapshot(overrides: Partial<LedgerSnapshot> = {}): LedgerSnapshot {
  return {
    date: '2027-02-28',
    measuredWindow: null,
    measuredOutcome: null,
    measuredBeforeReseed: false,
    takenAt: '2027-03-01T04:00:12.000Z',
    source: { posthog: 'ok', bluesky: 'ok' },
    primaryValue: 68,
    primaryAttributed: true,
    primaryAttributedValue: null,
    secondary: {
      attributedSessions: 1204,
      checkoutClickThrough: 96,
      blueskyInteractions: 214,
    },
    perTask: [
      { taskId: 'task-1', sessions: 612, clicks: 58, blueskyInteractions: 141 },
      {
        taskId: 'task-2',
        sessions: 402,
        clicks: 31,
        blueskyInteractions: null,
      },
      { taskId: 'task-3', sessions: 190, clicks: 7, blueskyInteractions: 73 },
      { taskId: 'task-4', sessions: 0, clicks: 0, blueskyInteractions: null },
      { taskId: 'task-5', sessions: 0, clicks: 0, blueskyInteractions: null },
    ],
    ...overrides,
  }
}

function ledger(
  overrides: Partial<CampaignLedgerView> = {},
): CampaignLedgerView {
  return {
    campaign: {
      _id: CAMPAIGN_ID,
      key: 'cfp',
      title: 'Call for papers',
      startDate: '2027-01-10',
      endDate: '2027-03-01',
      provisional: false,
      startMilestone: 'CFP_OPEN',
      endMilestone: 'CFP_CLOSE',
      primaryOutcome: 'cfpSubmissions',
      outcomeTargetPage: '/cfp',
      target: 80,
      optional: false,
    },
    snapshot: snapshot({ primaryAttributedValue: 41 }),
    previousEdition: null,
    tasks: TASKS,
    organizers: [
      { _id: 'sp-1', name: 'Ada Organizer' },
      { _id: 'sp-2', name: 'Grace Organizer' },
    ],
    ...overrides,
  }
}

const handlers = (view: CampaignLedgerView) => [
  http.get('/api/trpc/marketing.campaign.get', () =>
    HttpResponse.json({ result: { data: view } }),
  ),
  http.post('/api/trpc/marketing.refreshSnapshots', () =>
    HttpResponse.json({
      result: {
        data: {
          date: '2027-02-28',
          written: 9,
          source: { posthog: 'ok', bluesky: 'ok' },
          notes: [],
        },
      },
    }),
  ),
]

const meta = {
  title: 'Systems/Marketing/Admin/CampaignLedgerPage',
  component: CampaignLedgerPage,
  args: { campaignId: CAMPAIGN_ID },
  argTypes: {
    campaignId: {
      control: 'text',
      description:
        'The Campaign document id. The page proves it belongs to this conference through `marketing.campaign.get`; the stories serve the same fixture for any value.',
      table: { type: { summary: 'string' } },
    },
  },
  // Deterministic dates (AGENTS.md): the reading's labels must not drift
  // with the wall clock between captures.
  beforeEach: mockDateBeforeEach(new Date('2027-03-01T10:00:00Z')),
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: handlers(ledger()) },
    docs: {
      description: {
        component:
          'The per-Campaign ledger (#1018): the funnel — engagement, link clicks, then the primary Outcome against its Target and the previous edition — over the latest stored Snapshot, followed by the Campaign’s Task table with per-Task visits, clicks and Bluesky interactions. A dash is never a zero: it means that source could not be read.',
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
} satisfies Meta<typeof CampaignLedgerPage>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The primary story with full controls: a measured campaign — 68 of 80
 * submissions, 41 of them through its own links.
 */
export const Interactive: Story = {}

/** A measured campaign: 68 of 80 submissions, 41 of them through its links. */
export const Measured: Story = {}

export const MeasuredDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** Tickets sold in window: counted, but explicitly NOT attributed (§6.3). */
export const NotAttributed: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        ledger({
          campaign: {
            ...ledger().campaign,
            key: 'earlyBird',
            title: 'Early bird',
            primaryOutcome: 'ticketsSoldInWindow',
            outcomeTargetPage: null,
            target: 120,
          },
          snapshot: snapshot({
            primaryValue: 74,
            primaryAttributed: false,
            primaryAttributedValue: null,
          }),
        }),
      ),
    },
  },
}

/** Analytics could not be read: dashes, not zeros, and the banner says why. */
/**
 * The Campaign's window moved after this reading was taken — a Milestone was
 * set, or the window was edited. The figure is still true of the span it
 * covered, so the ledger shows it and names the span rather than blanking a
 * number the organizer can see is real.
 */
export const MeasuredInAnOlderWindow: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        ledger({
          snapshot: snapshot({
            measuredWindow: { startDate: '2026-11-01', endDate: '2027-02-01' },
          }),
        }),
      ),
    },
  },
}

export const SourceUnavailable: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        ledger({
          snapshot: snapshot({
            source: { posthog: 'unavailable', bluesky: 'ok' },
            primaryValue: null,
            primaryAttributedValue: null,
            secondary: {
              attributedSessions: null,
              checkoutClickThrough: null,
              blueskyInteractions: 214,
            },
            perTask: [
              {
                taskId: 'task-1',
                sessions: null,
                clicks: null,
                blueskyInteractions: 141,
              },
              {
                taskId: 'task-2',
                sessions: null,
                clicks: null,
                blueskyInteractions: null,
              },
            ],
          }),
        }),
      ),
    },
  },
}

/** Before the first run: no reading at all, with the way to take one. */
export const NoReadingYet: Story = {
  parameters: {
    msw: { handlers: handlers(ledger({ snapshot: null })) },
  },
}

export const CampaignManagement: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('button', { name: 'Edit Campaign' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Delete Campaign' }),
    ).toBeVisible()
  },
}
