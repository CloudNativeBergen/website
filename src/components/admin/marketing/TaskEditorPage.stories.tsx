import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { mockDateBeforeEach } from '@/lib/storybook'
import type {
  TaskEditorData,
  TaskEditorTask,
  TaskView,
} from '@/lib/marketing/types'
import { pagePickerOptions } from '@/lib/marketing/pages'
import type { SocialVariantEditorData } from '@/lib/social/types'
import { NotificationProvider } from '../NotificationProvider'
import { TaskEditorPage } from './TaskEditorPage'

/**
 * The Task editor as `marketing.task.get` returns it, one fixture per Kind
 * and lifecycle stage the page branches on.
 */

const BASE_URL = 'https://cloudnativebergen.dev'

function view(overrides: Partial<TaskView> = {}): TaskView {
  return {
    _id: 'task-1',
    campaignId: 'camp-cfp',
    key: 'cfpOpen:bluesky',
    title: 'CFP is open',
    kind: 'publishing',
    channel: 'bluesky',
    date: '2027-01-10T17:00:00.000Z',
    provisional: false,
    milestone: 'CFP_OPEN',
    status: 'draft',
    complete: false,
    prerequisiteIds: ['task-render'],
    variantId: 'variant-1',
    assigneeId: 'sp-1',
    approvedAt: null,
    ...overrides,
  }
}

function editorTask(overrides: Partial<TaskEditorTask> = {}): TaskEditorTask {
  return {
    ...view(),
    _rev: 'rev-1',
    approvedByName: null,
    assigneeName: 'Ada Organizer',
    targetPage: '/cfp',
    shortCode: null,
    instructions: null,
    verbatimCopy: false,
    externalUrl: null,
    skipReason: null,
    subject: null,
    assetUrl: null,
    messageId: null,
    origin: 'template',
    ...overrides,
  }
}

const siblings: TaskView[] = [
  view({
    _id: 'task-render',
    key: 'cfpOpenRender',
    title: 'Render the CFP card',
    kind: 'studioRender',
    channel: null,
    status: 'open',
    prerequisiteIds: [],
    variantId: null,
    date: '2027-01-08T08:00:00.000Z',
  }),
  view({
    _id: 'task-li',
    key: 'cfpOpen:linkedin',
    title: 'CFP is open (LinkedIn)',
    channel: 'linkedin',
    prerequisiteIds: ['task-render'],
    variantId: 'variant-li',
    date: '2027-01-10T07:00:00.000Z',
  }),
  view({
    _id: 'task-check',
    key: 'cfpForm',
    title: 'Check the CFP form',
    kind: 'checklist',
    channel: null,
    status: 'done',
    complete: true,
    prerequisiteIds: [],
    variantId: null,
    date: '2027-01-09T08:00:00.000Z',
  }),
]

function variant(
  overrides: Partial<SocialVariantEditorData['variant']> = {},
): SocialVariantEditorData {
  return {
    variant: {
      _id: 'variant-1',
      _rev: 'rev-v1',
      postId: 'post-1',
      conferenceId: 'conf-1',
      orgId: 'org-1',
      platform: 'bluesky',
      body: 'The Cloud Native Bergen 2027 call for papers is open. Tell us what you have been building — talks, workshops and lightning talks welcome.',
      status: 'draft',
      scheduledAt: '2027-01-10T17:00:00.000Z',
      usesCustomTime: false,
      claimedAt: null,
      shortCode: null,
      link: `${BASE_URL}/cfp?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Abluesky`,
      attachments: [],
      publishResult: null,
      attempts: [],
      attemptCount: 0,
      ...overrides,
    },
    post: { attachments: [], defaultScheduledAt: '2027-01-10T17:00:00.000Z' },
    conferenceDomains: ['cloudnativebergen.no'],
  }
}

function fixture(
  task: Partial<TaskEditorTask> = {},
  v: SocialVariantEditorData | null = variant(),
): TaskEditorData {
  const t = editorTask(task)
  return {
    task: t,
    campaign: { _id: 'camp-cfp', key: 'cfp', title: 'CFP' },
    planOwnerId: 'sp-1',
    siblings,
    variant: t.kind === 'publishing' ? v : null,
    baseUrl: BASE_URL,
    taggedLink:
      t.kind === 'publishing' && t.targetPage && t.channel
        ? `${BASE_URL}${t.targetPage}?utm_source=${t.channel}&utm_medium=social&utm_campaign=cfp&utm_content=${encodeURIComponent(t.key)}`
        : (t.kind === 'speakerOutreach' || t.kind === 'sponsorOutreach') &&
            t.targetPage
          ? `${BASE_URL}${t.targetPage}?utm_source=outreach&utm_medium=social&utm_campaign=cfp&utm_content=${encodeURIComponent(t.key)}`
          : null,
    outreachBody:
      t.kind === 'speakerOutreach' || t.kind === 'sponsorOutreach'
        ? `Hi ${t.subject?.name},\n\nWe would love your help sharing Cloud Native Bergen 2027. Please share this link with your community:\n\n${BASE_URL}${t.targetPage}?utm_source=outreach&utm_medium=social&utm_campaign=cfp&utm_content=${encodeURIComponent(t.key)}\n\nThank you!`
        : null,
    pages: pagePickerOptions(t.subject),
    organizers: [
      { _id: 'sp-1', name: 'Ada Organizer' },
      { _id: 'sp-2', name: 'Bob Builder' },
    ],
  }
}

const ok = () => HttpResponse.json({ result: { data: { success: true } } })

const handlers = (data: TaskEditorData) => [
  http.get('/api/trpc/marketing.task.get', () =>
    HttpResponse.json({ result: { data } }),
  ),
  http.post('/api/trpc/marketing.task.approve', ok),
  http.post('/api/trpc/marketing.task.sendOutreach', () =>
    HttpResponse.json({ result: { data: { messageId: 'message-sent' } } }),
  ),
  http.post('/api/trpc/marketing.task.update', ok),
  http.post('/api/trpc/marketing.task.complete', ok),
  http.post('/api/trpc/marketing.task.skip', ok),
  http.post('/api/trpc/marketing.task.setAssignee', ok),
  http.post('/api/trpc/marketing.task.setDate', ok),
  http.post('/api/trpc/marketing.task.setPrerequisites', ok),
  http.post('/api/trpc/marketing.task.delete', ok),
  http.post('/api/trpc/social.updateVariant', ok),
  http.post('/api/trpc/social.markPosted', ok),
  http.post('/api/trpc/social.unscheduleVariant', ok),
  http.get('/api/trpc/gallery.admin.list', () =>
    HttpResponse.json({ result: { data: [] } }),
  ),
]

const meta = {
  title: 'Systems/Marketing/Admin/TaskEditorPage',
  component: TaskEditorPage,
  args: { taskId: 'task-1' },
  // Deterministic dates (AGENTS.md): relative labels and overdue tones
  // must not drift with the wall clock between captures.
  beforeEach: mockDateBeforeEach(new Date('2026-09-15T10:00:00Z')),
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: handlers(fixture()) },
    nextjs: { appDirectory: true },
    docs: {
      description: {
        component:
          'The full-page Task editor (#1012): assignee, date and Prerequisites for every Kind; the page picker, the derived tagged link, the hosted single-variant editor and the approve button for a post; a tick and a skip-with-reason for a checklist or event-page update.',
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
} satisfies Meta<typeof TaskEditorPage>

export default meta
type Story = StoryObj<typeof meta>

/** A Bluesky draft: page picker, derived link, editor, approve. */
export const PublishingDraft: Story = {}

export const PublishingDraftDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** Changing the page re-derives the link on screen before any save. */
export const PageChangeUpdatesLink: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const select = await canvas.findByLabelText('Target page')
    await userEvent.selectOptions(select, 'tickets')
    await expect(canvas.getByTestId('tagged-link')).toHaveTextContent(
      `${BASE_URL}/tickets?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Abluesky`,
    )
    await userEvent.selectOptions(select, '__custom__')
    await userEvent.type(canvas.getByLabelText('Custom path'), 'x')
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'The path must start with "/"',
    )
  },
}

/** Seeded from a Template that kept an edition's literal copy (#1123). */
export const VerbatimCopy: Story = {
  parameters: {
    msw: { handlers: handlers(fixture({ verbatimCopy: true }, variant())) },
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('note'),
    ).toHaveTextContent('saved word for word from a previous edition')
  },
}
export const VerbatimCopyMobileDark: Story = {
  ...VerbatimCopy,
  parameters: {
    ...VerbatimCopy.parameters,
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
}

/** Approved: the variant is scheduled, the approval is on the Task. */
export const PublishingScheduled: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        fixture(
          {
            status: 'scheduled',
            approvedAt: '2026-09-14T09:12:00.000Z',
            approvedByName: 'Bob Builder',
          },
          variant({ status: 'scheduled' }),
        ),
      ),
    },
  },
}

/** LinkedIn at due time: the copy-ready view with the required URL. */
export const ManualAwaitingPost: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        fixture(
          {
            key: 'cfpOpen:linkedin',
            channel: 'linkedin',
            status: 'awaiting-manual',
            approvedAt: '2026-09-14T09:12:00.000Z',
            approvedByName: 'Bob Builder',
            date: '2027-01-10T07:00:00.000Z',
          },
          variant({
            platform: 'linkedin',
            status: 'awaiting-manual',
            scheduledAt: '2027-01-10T07:00:00.000Z',
            link: `${BASE_URL}/cfp?utm_source=linkedin&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Alinkedin`,
          }),
        ),
      ),
    },
  },
}

/** A checklist Task, open: instructions, mark done, skip. */
export const ChecklistOpen: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        fixture(
          {
            _id: 'task-check',
            key: 'cfpForm',
            title: 'Check the CFP form',
            kind: 'checklist',
            channel: null,
            status: 'open',
            variantId: null,
            prerequisiteIds: [],
            instructions:
              'Open the CFP form as a visitor, submit a test talk, and confirm the confirmation email arrives.',
            date: '2027-01-09T08:00:00.000Z',
          },
          null,
        ),
      ),
    },
  },
}

/** The skip dialog, opened. */
export const ChecklistSkipDialog: Story = {
  parameters: ChecklistOpen.parameters,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Skip…' }))
    const dialog = within(document.body)
    await userEvent.type(
      await dialog.findByLabelText('Reason'),
      'The form was checked last edition and is unchanged.',
    )
    await expect(
      dialog.getByRole('button', { name: 'Skip task' }),
    ).toBeEnabled()
  },
}

/** An event-page update, done with its pasted URL. */
export const EventPageUpdateDone: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        fixture(
          {
            _id: 'task-event',
            key: 'meetupListing',
            title: 'List the conference on Meetup',
            kind: 'eventPageUpdate',
            channel: null,
            status: 'done',
            complete: true,
            variantId: null,
            prerequisiteIds: [],
            externalUrl: 'https://www.meetup.com/cloud-native-bergen/events/1',
            instructions: 'Create the event page and paste its address here.',
            date: '2026-12-01T08:00:00.000Z',
          },
          null,
        ),
      ),
    },
  },
}

/** A studio render, not yet attached; a provisional date. */
export const StudioRenderProvisional: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        fixture(
          {
            _id: 'task-render',
            key: 'cfpOpenRender',
            title: 'Render the CFP card',
            kind: 'studioRender',
            channel: null,
            status: 'open',
            variantId: null,
            prerequisiteIds: [],
            provisional: true,
            milestone: 'EARLY_BIRD_END',
            date: '2027-01-08T08:00:00.000Z',
          },
          null,
        ),
      ),
    },
  },
}

/**
 * Instructions typed on a Studio render — the create form offers the field for
 * all six Kinds and the router stores it for all six, but only the checklist
 * and outreach sections used to render it, so this text was persisted and then
 * invisible.
 */
export const StudioRenderWithInstructions: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        fixture(
          {
            _id: 'task-render',
            key: 'cfpOpenRender',
            title: 'Render the CFP card',
            kind: 'studioRender',
            channel: null,
            status: 'open',
            variantId: null,
            prerequisiteIds: [],
            instructions: 'Use the approved artwork, not last year’s.',
          },
          null,
        ),
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = await canvas.findByRole('region', { name: 'Instructions' })
    await expect(panel).toHaveTextContent(
      'Use the approved artwork, not last year’s.',
    )
  },
}

const pendingHandoffHandlers = handlers(
  fixture(
    {
      _id: 'task-render',
      key: 'cfpOpenRender',
      title: 'Render the CFP card',
      kind: 'studioRender',
      channel: null,
      status: 'open',
      complete: true,
      variantId: null,
      prerequisiteIds: [],
      handoffPending: true,
      assetId: 'image-saved',
      assetUrl: '/og/base.png',
      date: '2027-01-08T08:00:00.000Z',
    },
    null,
  ),
)

/** Server-side pending state survives leaving the studio and reloading. */
export const PendingHandoff: Story = {
  args: { taskId: 'task-render' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'The render is done and saved. The image has not reached all publishing Tasks listed below yet.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Retry handoff' }),
    ).toBeVisible()
  },
  parameters: {
    msw: {
      handlers: pendingHandoffHandlers,
    },
  },
}

export const PlaceholderHandoffFailure: Story = {
  ...PendingHandoff,
  parameters: {
    msw: {
      handlers: [
        ...pendingHandoffHandlers,
        http.post('/api/trpc/marketing.task.attachAsset', () =>
          HttpResponse.json({
            result: {
              data: {
                success: true,
                handoffFailures: ['post-1'],
                handoffIssues: [
                  'Fill in {tier} in the alt text before scheduling.',
                ],
              },
            },
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Retry handoff' }),
    )
    await expect(
      await canvas.findByText(/Fill in \{tier\} in the alt text/),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Retry handoff' }),
    ).toBeEnabled()
  },
}
const outreach = (overrides: Partial<TaskEditorTask> = {}) =>
  fixture(
    {
      key: 'speaker-outreach',
      title: 'Invite Ada to share the conference',
      kind: 'speakerOutreach',
      channel: null,
      variantId: null,
      prerequisiteIds: [],
      milestone: null,
      status: 'open',
      targetPage: '/tickets',
      subject: {
        _id: 'speaker-ada',
        type: 'speaker',
        name: 'Ada Speaker',
        slug: 'ada',
      },
      ...overrides,
    },
    null,
  )

export const SpeakerOutreach: Story = {
  parameters: { msw: { handlers: handlers(outreach()) } },
}

export const SponsorOutreach: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        outreach({
          key: 'sponsor-outreach',
          title: 'Invite Acme to share the conference',
          kind: 'sponsorOutreach',
          subject: {
            _id: 'sponsor-acme',
            type: 'sponsor',
            name: 'Acme Cloud',
            slug: null,
          },
        }),
      ),
    },
  },
}

export const OutreachSent: Story = {
  parameters: {
    msw: {
      handlers: handlers(outreach({ messageId: 'message-1', complete: true })),
    },
  },
}

export const OutreachSendOnce: Story = {
  parameters: SpeakerOutreach.parameters,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = await canvas.findByLabelText('Message', undefined, {
      timeout: 5000,
    })
    await expect((body as HTMLTextAreaElement).value).toContain(
      'utm_source=outreach',
    )
    await userEvent.type(body, ' Looking forward to seeing you.')
    await expect(canvas.getByLabelText('Target page')).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Send message' }))
    await expect(
      await canvas.findByText(
        'Message sent to Ada Speaker. This task is complete.',
        undefined,
        { timeout: 5000 },
      ),
    ).toBeVisible()
  },
}

/** A failed send followed by a failed recovery refetch must keep local copy. */
export const OutreachRecoveryFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(
          '/api/trpc/marketing.task.get',
          () => HttpResponse.json({ result: { data: outreach() } }),
          { once: true },
        ),
        http.get('/api/trpc/marketing.task.get', () => HttpResponse.error()),
        http.post('/api/trpc/marketing.task.sendOutreach', () =>
          HttpResponse.error(),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = await canvas.findByLabelText('Message')
    await userEvent.clear(body)
    await userEvent.type(body, 'My carefully edited outreach draft')
    await userEvent.click(canvas.getByRole('button', { name: 'Send message' }))
    await expect(
      await canvas.findByText(/could not confirm the Task/, undefined, {
        timeout: 15000,
      }),
    ).toBeVisible()
    await expect(canvas.getByLabelText('Message')).toHaveValue(
      'My carefully edited outreach draft',
    )
    await expect(
      canvas.getByRole('button', { name: 'Send message' }),
    ).toBeEnabled()
  },
}

export const OutreachDestinationEdit: Story = {
  parameters: SpeakerOutreach.parameters,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(
      await canvas.findByLabelText('Target page'),
      'cfp',
    )
    await expect(
      canvas.getByRole('button', { name: 'Save destination' }),
    ).toBeEnabled()
    await expect(
      canvas.getByRole('button', { name: 'Reset destination' }),
    ).toBeEnabled()
    await expect(
      canvas.getByRole('button', { name: 'Send message' }),
    ).toBeDisabled()
  },
}
