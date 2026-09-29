import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { delay, http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { mockDateBeforeEach } from '@/lib/storybook'
import type {
  TaskEditorData,
  TaskEditorTask,
  TaskView,
} from '@/lib/marketing/types'
import { pagePickerOptions } from '@/lib/marketing/pages'
import {
  beatRecipes,
  buildSubjectBeat,
  talkSubject,
} from '@/lib/marketing/expansion'
import { BUILTIN_TEMPLATE } from '@/lib/marketing/template'
import type { SocialVariantEditorData } from '@/lib/social/types'
import type { MarketingAssetRow } from '@/lib/marketing-asset'
import { NotificationProvider } from '../NotificationProvider'
import { TaskEditorPage } from './TaskEditorPage'

/**
 * The Task editor as `marketing.task.get` returns it, one fixture per Kind
 * and lifecycle stage the page branches on.
 */

const BASE_URL = 'https://cloudnativebergen.dev'
/** The post's `/go/<code>` short link (short-links spec §2.3). */
const POST_CODE = 'k7m2qp'
const OUTREACH_CODE = 'p4x8vr'

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
  const v: SocialVariantEditorData['variant'] = {
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
    submission: null,
    shortCode: POST_CODE,
    link: `${BASE_URL}/cfp?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Abluesky`,
    attachments: [],
    publishResult: null,
    attempts: [],
    attemptCount: 0,
    ...overrides,
  }
  return {
    variant: v,
    post: { attachments: [], defaultScheduledAt: '2027-01-10T17:00:00.000Z' },
    conferenceDomains: ['cloudnativebergen.no'],
    // What the server's `publishLinkFields` answers for this variant.
    postedLink: v.shortCode ? `${BASE_URL}/go/${v.shortCode}` : v.link,
  }
}

function fixture(
  task: Partial<TaskEditorTask> = {},
  v: SocialVariantEditorData | null = variant(),
  tagByHand: TaskEditorData['tagByHand'] = [],
  tagging: Pick<TaskEditorData, 'tagPeople' | 'tagMentions'> = {
    tagPeople: [],
    tagMentions: [],
  },
): TaskEditorData {
  const t = editorTask(task)
  return {
    tagByHand,
    ...tagging,
    task: t,
    campaign: { _id: 'camp-cfp', key: 'cfp', title: 'CFP' },
    planOwnerId: 'sp-1',
    siblings,
    variant: t.kind === 'publishing' ? v : null,
    baseUrl: BASE_URL,
    shortLinkOrigin: BASE_URL,
    taggedLink:
      t.kind === 'publishing' && t.targetPage && t.channel
        ? `${BASE_URL}${t.targetPage}?utm_source=${t.channel}&utm_medium=social&utm_campaign=cfp&utm_content=${encodeURIComponent(t.key)}`
        : (t.kind === 'speakerOutreach' || t.kind === 'sponsorOutreach') &&
            t.targetPage
          ? `${BASE_URL}${t.targetPage}?utm_source=outreach&utm_medium=social&utm_campaign=cfp&utm_content=${encodeURIComponent(t.key)}`
          : null,
    outreachBody:
      t.kind === 'speakerOutreach' || t.kind === 'sponsorOutreach'
        ? `Hi ${t.subject?.name},\n\nWe would love your help sharing Cloud Native Bergen 2027. Please share this link with your community:\n\n${t.shortCode ? `${BASE_URL}/go/${t.shortCode}` : `${BASE_URL}${t.targetPage}?utm_source=outreach&utm_medium=social&utm_campaign=cfp&utm_content=${encodeURIComponent(t.key)}`}\n\nThank you!`
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
  http.get('/api/trpc/marketing.task.deletionPreview', () =>
    HttpResponse.json({ result: { data: { liveLinks: 0 } } }),
  ),
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

/**
 * A Bluesky draft: page picker, the short link with the destination it
 * expands to (short-links spec §2.7), editor, approve.
 */
export const PublishingDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByTestId('tagged-link')).toHaveTextContent(
      `${BASE_URL}/go/${POST_CODE}`,
    )
    await expect(canvas.getByText('Short link')).toBeVisible()
    await expect(canvas.getByTestId('link-destination')).toHaveTextContent(
      `${BASE_URL}/cfp?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Abluesky`,
    )
  },
}

export const PublishingDraftDark: Story = {
  ...PublishingDraft,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

export const PublishingDraftMobile: Story = {
  // `globals` sizes it in the Storybook UI; the test-runner's preVisit reads
  // the parameter.
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async (ctx) => {
    await expect(
      ctx.canvasElement.ownerDocument.documentElement.clientWidth,
    ).toBeLessThan(500)
    await PublishingDraft.play!(ctx)
  },
}

/** A post from before short codes: the tagged link alone, until a save mints one. */
export const PublishingDraftNoCodeYet: Story = {
  parameters: {
    msw: {
      handlers: handlers({
        ...fixture({}, variant({ shortCode: null })),
        shortLinkOrigin: null,
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Tagged link')).toBeVisible()
    await expect(canvas.queryByTestId('link-destination')).toBeNull()
    // The Link field below is the long fallback, and says so (review P2).
    await expect(
      canvas.getByText(/derived from the target page/i),
    ).toBeVisible()
    await expect(canvas.queryByText(/short link; it goes to/i)).toBeNull()
  },
}

/** Changing the page re-derives the link on screen before any save. */
export const PageChangeUpdatesLink: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const select = await canvas.findByLabelText('Target page')
    await userEvent.selectOptions(select, 'tickets')
    // The code never changes; the destination it expands to does.
    await expect(canvas.getByTestId('tagged-link')).toHaveTextContent(
      `${BASE_URL}/go/${POST_CODE}`,
    )
    await expect(canvas.getByTestId('link-destination')).toHaveTextContent(
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

/**
 * LinkedIn handed to an asynchronous publisher (#1128): accepted, not live
 * yet. In flight — no editor, no approve controls, no delete.
 */
export const PublishingSubmitted: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        fixture(
          {
            key: 'cfpOpen:linkedin',
            channel: 'linkedin',
            status: 'submitted',
            approvedAt: '2026-09-14T09:12:00.000Z',
            approvedByName: 'Bob Builder',
            date: '2027-01-10T07:00:00.000Z',
          },
          variant({
            platform: 'linkedin',
            status: 'submitted',
            scheduledAt: '2027-01-10T07:00:00.000Z',
            attemptCount: 1,
            submission: {
              vendorPostId: 'buffer-6f2a',
              submittedAt: '2027-01-10T07:00:11.000Z',
              lastCheckedAt: '2027-01-10T07:00:41.000Z',
            },
            attempts: [
              {
                _key: 'a1',
                at: '2027-01-10T07:00:11.000Z',
                outcome: 'submitted',
              },
            ],
          }),
        ),
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText(/Sent to Buffer; confirming it went out/),
    ).toBeVisible()
    await expect(
      canvas.getAllByText('Sent to Buffer, confirming…')[0],
    ).toBeVisible()
  },
}

export const PublishingSubmittedDark: Story = {
  ...PublishingSubmitted,
  parameters: {
    ...PublishingSubmitted.parameters,
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
}

/**
 * LinkedIn that Buffer accepted and then reported an error on (#1130): the
 * Task says why, in Buffer's words, and offers Retry beside the manual
 * fallback — the copy-ready view where it is posted by hand and recorded.
 */
export const PublishingFailedAtBuffer: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        fixture(
          {
            key: 'cfpOpen:linkedin',
            channel: 'linkedin',
            status: 'failed',
            approvedAt: '2026-09-14T09:12:00.000Z',
            approvedByName: 'Bob Builder',
            date: '2027-01-10T07:00:00.000Z',
          },
          variant({
            platform: 'linkedin',
            status: 'failed',
            scheduledAt: '2027-01-10T07:00:00.000Z',
            attemptCount: 1,
            submission: {
              vendorPostId: 'buffer-9c1d',
              submittedAt: '2027-01-10T07:00:11.000Z',
              lastCheckedAt: '2027-01-10T07:01:41.000Z',
            },
            attempts: [
              {
                _key: 'a1',
                at: '2027-01-10T07:00:11.000Z',
                outcome: 'submitted',
              },
              {
                _key: 'a2',
                at: '2027-01-10T07:01:41.000Z',
                outcome: 'rejected',
                error:
                  'Your LinkedIn connection needs to be refreshed. Reconnect the channel in Buffer and try again.',
              },
            ],
          }),
        ),
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const notice = await canvas.findByText(
      /Buffer reported an error on this post/i,
    )
    const box = notice.closest('[role="alert"]') as HTMLElement
    await expect(box).toHaveTextContent(/Reconnect the channel in Buffer/)
    await expect(
      within(box).getByRole('link', { name: /post it by hand/i }),
    ).toHaveAttribute('href', '/admin/marketing/posts?variant=variant-1')
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible()
  },
}

/**
 * Unsaved edits on a failed post: the copy-ready view reloads the SAVED
 * variant, so the way there is withheld until the edits are saved (bot
 * review, #1130) — as Retry already is.
 */
export const PublishingFailedAtBufferEdited: Story = {
  ...PublishingFailedAtBuffer,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = await canvas.findByLabelText(/^body/i)
    await userEvent.type(body, ' Edited.')
    const notice = (
      await canvas.findByText(/Buffer reported an error on this post/i)
    ).closest('[role="alert"]') as HTMLElement
    await waitFor(() => expect(within(notice).queryByRole('link')).toBeNull())
    await expect(notice).toHaveTextContent(/save your changes first/)
  },
}

export const PublishingFailedAtBufferDark: Story = {
  ...PublishingFailedAtBuffer,
  parameters: {
    ...PublishingFailedAtBuffer.parameters,
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
}

export const PublishingFailedAtBufferMobile: Story = {
  ...PublishingFailedAtBuffer,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  parameters: {
    ...PublishingFailedAtBuffer.parameters,
    viewport: { defaultViewport: 'mobile1' },
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

/**
 * Bluesky, posted by hand, after a speaker opted out since approval: the page
 * asks for its OWN tag check as it opens (review T4, round 3) and copies the
 * body that passes it — the plain name, not the tag.
 */
const blueskyManual = variant({
  platform: 'bluesky',
  status: 'awaiting-manual',
  scheduledAt: '2027-01-10T07:00:00.000Z',
  body: '🎙️ @alice.dev is speaking at Cloud Native Bergen 2027.',
})
export const ManualAwaitingPostBlueskyLateOptOut: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/social.getVariantEditor', () =>
          HttpResponse.json({
            result: {
              data: {
                ...blueskyManual,
                manualBody: {
                  body: '🎙️ Alice Liddell is speaking at Cloud Native Bergen 2027.',
                  untagged: ['Alice Liddell'],
                  removed: 0,
                },
              },
            },
          }),
        ),
        ...handlers(
          fixture(
            {
              key: 'speakerCard:bluesky',
              channel: 'bluesky',
              status: 'awaiting-manual',
              approvedAt: '2026-09-14T09:12:00.000Z',
              approvedByName: 'Bob Builder',
              date: '2027-01-10T07:00:00.000Z',
            },
            blueskyManual,
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText(/Alice Liddell is speaking/),
    ).toBeInTheDocument()
    await expect(canvasElement).not.toHaveTextContent('@alice.dev is speaking')
  },
}

/**
 * The same, for a Task about a speaker with a LinkedIn profile (#1155): the
 * server's "Tag by hand" list reaches the copy-ready view.
 */
export const ManualAwaitingPostTagByHand: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        fixture(
          {
            key: 'speakerCard:sp-9:linkedin',
            channel: 'linkedin',
            status: 'awaiting-manual',
            approvedAt: '2026-09-14T09:12:00.000Z',
            approvedByName: 'Bob Builder',
            date: '2027-01-10T07:00:00.000Z',
            subject: {
              _id: 'sp-9',
              type: 'speaker',
              name: 'Ada Lovelace',
              slug: 'ada-lovelace',
            },
          },
          variant({
            platform: 'linkedin',
            status: 'awaiting-manual',
            scheduledAt: '2027-01-10T07:00:00.000Z',
            body: 'Meet Ada Lovelace, speaking at Cloud Native Bergen 2027.',
            link: `${BASE_URL}/speaker/ada-lovelace?utm_source=linkedin&utm_medium=social&utm_campaign=cfp&utm_content=speakerCard%3Asp-9%3Alinkedin`,
          }),
          [
            {
              name: 'Ada Lovelace',
              url: 'https://www.linkedin.com/in/ada-lovelace',
              kind: 'person',
            },
          ],
        ),
      ),
    },
  },
  play: async ({ canvas }) => {
    const heading = await canvas.findByRole(
      'heading',
      { name: /tag by hand/i },
      { timeout: 5000 },
    )
    const section = heading.closest('section')!
    await expect(
      within(section).getByRole('link', { name: /ada lovelace/i }),
    ).toHaveAttribute('href', 'https://www.linkedin.com/in/ada-lovelace')
  },
}

/**
 * A LEGACY LinkedIn draft (skeleton from before #1134) that reached
 * awaiting-manual with the link still in its body: the Task page must show
 * the same own-link warning the Social posts dialog shows, so the organizer
 * is told to remove it before copying (spec §3.1, §5).
 */
export const ManualAwaitingPostLegacyOwnLink: Story = {
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
          {
            ...variant({
              platform: 'linkedin',
              status: 'awaiting-manual',
              scheduledAt: '2027-01-10T07:00:00.000Z',
              body: `The Cloud Native Bergen 2027 call for papers is open: ${BASE_URL}/cfp?utm_source=linkedin&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Alinkedin`,
              link: `${BASE_URL}/cfp?utm_source=linkedin&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Alinkedin`,
            }),
            // The site the body links to must be OURS for the warning to
            // fire; the default fixture lists a different host.
            conferenceDomains: [new URL(BASE_URL).hostname],
          },
        ),
      ),
    },
  },
  play: async ({ canvas }) => {
    // ON THE VALUE: the warning names the URL still in the text. Without
    // `conferenceDomains` reaching this view, no alert renders at all.
    const alert = await canvas.findByRole('alert', undefined, { timeout: 5000 })
    await expect(alert).toHaveTextContent('The text below still contains')
    await expect(alert).toHaveTextContent(`${BASE_URL}/cfp`)
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
const pendingGalleryHandlers = [
  http.post('/api/trpc/marketing.task.attachAsset', () =>
    HttpResponse.json({
      result: { data: { success: true, handoffFailures: [] } },
    }),
  ),
  ...handlers(
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
        handoffPending: false,
        galleryPending: true,
        assetId: 'image-saved',
        assetUrl: '/og/base.png',
        date: '2027-01-08T08:00:00.000Z',
      },
      null,
    ),
  ),
]

/**
 * The render reached every post but not the asset gallery (#1165): the
 * attach never fails over it, and the retry completes the save.
 */
export const PendingGallerySave: Story = {
  args: { taskId: 'task-render' },
  parameters: { msw: { handlers: pendingGalleryHandlers } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'The render is saved and attached to this Task, but it has not been saved to the asset gallery yet.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Save to the gallery' }),
    ).toBeEnabled()
  },
}

export const PendingGallerySaveDark: Story = {
  ...PendingGallerySave,
  parameters: {
    ...PendingGallerySave.parameters,
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
}

/** One of the organization's gallery assets, as `marketingAsset.list` returns it. */
function galleryRow(
  title: string,
  hash: string,
  overrides: Partial<MarketingAssetRow> = {},
): MarketingAssetRow {
  return {
    _id: `asset-${hash}`,
    title,
    alt: `Alt of ${title}`,
    kind: 'image',
    scope: 'organization',
    conferenceId: null,
    edition: null,
    subject: null,
    tags: [],
    credit: null,
    imageUrl: null,
    assetId: `image-${hash.repeat(40).slice(0, 40)}-1080x1080-png`,
    width: 1080,
    height: 1080,
    createdAt: '2026-09-01T10:00:00Z',
    softOnSocial: false,
    audioUrl: null,
    durationSeconds: null,
    rights: null,
    studio: null,
    usedInPosts: null,
    attachable: true,
    ...overrides,
  }
}

const GALLERY_COLORS: Record<string, [string, string]> = {
  a: ['#1d4ed8', '#7c3aed'],
  b: ['#0f766e', '#84cc16'],
  c: ['#b91c1c', '#f59e0b'],
  d: ['#be185d', '#f472b6'],
}

/** The Sanity CDN, answered with a gradient per asset (the hash's letter). */
const galleryImages = http.get(
  'https://cdn.sanity.io/images/*',
  ({ request }) => {
    const letter = new URL(request.url).pathname.split('/').pop()?.[0]
    const [from, to] = GALLERY_COLORS[letter ?? 'a'] ?? GALLERY_COLORS.a
    return HttpResponse.text(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#g)"/></svg>`,
      { headers: { 'Content-Type': 'image/svg+xml' } },
    )
  },
)

const galleryRows: MarketingAssetRow[] = [
  galleryRow('Logo on dark', 'a', { alt: 'The Cloud Native Bergen logo' }),
  galleryRow('CFP card', 'b', {
    scope: 'edition',
    conferenceId: 'conf-2027',
    edition: 'Cloud Native Bergen 2027',
  }),
  galleryRow('Venue at dusk', 'c', {
    subject: { _id: 'sp-ada', _type: 'speaker', name: 'Ada Lovelace' },
  }),
  // A GIF: listed, but it cannot finish a render Task.
  galleryRow('Countdown loop', 'd', { attachable: false }),
]

const renderTaskOpen: Partial<TaskEditorTask> = {
  _id: 'task-render',
  key: 'cfpOpenRender',
  title: 'Render the CFP card',
  kind: 'studioRender',
  channel: null,
  status: 'open',
  complete: false,
  variantId: null,
  prerequisiteIds: [],
  date: '2027-01-08T08:00:00.000Z',
}

/** What the picker sent, so a play can assert only the asset id travelled. */
const galleryAttachBodies: unknown[] = []

const galleryPickHandlers = [
  galleryImages,
  http.get('/api/trpc/marketingAsset.list', ({ request }) => {
    const input = JSON.parse(
      new URL(request.url).searchParams.get('input') ?? '{}',
    ) as { kind?: string }
    // The Task asks for images only.
    return HttpResponse.json({
      result: { data: input.kind === 'image' ? galleryRows : [] },
    })
  }),
  http.post('/api/trpc/marketing.task.attachAsset', async ({ request }) => {
    galleryAttachBodies.push(await request.json())
    return HttpResponse.json({
      result: { data: { success: true, handoffFailures: [] } },
    })
  }),
  ...handlers(fixture(renderTaskOpen, null)),
]

/**
 * A render Task finished without rendering (#1166): "Use an asset from the
 * gallery" lists this organization's images; a GIF is shown but cannot be
 * picked; picking an image sends only its id.
 */
export const StudioRenderFromGallery: Story = {
  args: { taskId: 'task-render' },
  parameters: { msw: { handlers: galleryPickHandlers } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    galleryAttachBodies.length = 0
    const open = await canvas.findByRole('button', {
      name: 'Use an asset from the gallery',
    })
    await userEvent.click(open)
    await expect(open).toHaveAttribute('aria-expanded', 'true')
    await expect(
      await canvas.findByRole('button', {
        name: "Countdown loop (Whole organization): can't be used yet",
      }),
    ).toBeDisabled()
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Finish this Task with Logo on dark (Whole organization)',
      }),
    )
    await expect(
      await canvas.findByText(
        'Logo on dark from the asset gallery is attached to this Task. Publishing Tasks waiting for an image have it.',
      ),
    ).toBeVisible()
    await expect(galleryAttachBodies).toEqual([
      expect.objectContaining({
        taskId: 'task-render',
        taskRev: 'rev-1',
        marketingAssetId: 'asset-a',
      }),
    ])
    await expect(JSON.stringify(galleryAttachBodies[0])).not.toContain(
      'assetId"',
    )
  },
}

/** The picker open, for looking at: light, dark and a phone. */
export const StudioRenderGalleryPickerOpen: Story = {
  args: { taskId: 'task-render' },
  parameters: { msw: { handlers: galleryPickHandlers } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Use an asset from the gallery',
      }),
    )
    await expect(
      await canvas.findByRole('button', {
        name: 'Finish this Task with CFP card (Cloud Native Bergen 2027)',
      }),
    ).toBeEnabled()
  },
}

export const StudioRenderGalleryPickerOpenDark: Story = {
  ...StudioRenderGalleryPickerOpen,
  parameters: {
    ...StudioRenderGalleryPickerOpen.parameters,
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
}

export const StudioRenderGalleryPickerOpenMobile: Story = {
  ...StudioRenderGalleryPickerOpen,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  parameters: {
    ...StudioRenderGalleryPickerOpen.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
  play: async (ctx) => {
    await expect(
      ctx.canvasElement.ownerDocument.documentElement.clientWidth,
    ).toBeLessThan(500)
    await StudioRenderGalleryPickerOpen.play!(ctx)
  },
}

/** A refusal from the server is said beside the picker; nothing changes. */
export const StudioRenderGalleryRefused: Story = {
  args: { taskId: 'task-render' },
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/marketing.task.attachAsset', () =>
          HttpResponse.json(
            {
              error: {
                message:
                  'The Task changed while you were editing. Reload and retry.',
                code: -32009,
                data: { code: 'CONFLICT', httpStatus: 409 },
              },
            },
            { status: 409 },
          ),
        ),
        ...galleryPickHandlers,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Use an asset from the gallery',
      }),
    )
    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Finish this Task with Logo on dark (Whole organization)',
      }),
    )
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'The Task changed while you were editing. Reload and retry.',
    )
  },
}

/** Finished from the gallery: the page says where the image came from. */
export const StudioRenderDoneFromGallery: Story = {
  args: { taskId: 'task-render' },
  parameters: {
    msw: {
      handlers: [
        galleryImages,
        ...handlers(
          fixture(
            {
              ...renderTaskOpen,
              complete: true,
              assetId: `image-${'a'.repeat(40)}-1080x1080-png`,
              assetUrl: `https://cdn.sanity.io/images/test/test/${'a'.repeat(40)}-1080x1080.png`,
              fromGallery: { title: 'Logo on dark' },
            },
            null,
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText(
        'From the asset gallery: Logo on dark; the image is attached to this task.',
      ),
    ).toBeVisible()
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
      shortCode: OUTREACH_CODE,
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The message carries the short link; the destination shows under it.
    const message = await canvas.findByLabelText<HTMLTextAreaElement>('Message')
    await expect(message.value).toContain(`${BASE_URL}/go/${OUTREACH_CODE}`)
    await expect(message.value).not.toContain('utm_')
    await expect(canvas.getByTestId('tagged-link')).toHaveTextContent(
      `${BASE_URL}/go/${OUTREACH_CODE}`,
    )
    await expect(canvas.getByTestId('link-destination')).toHaveTextContent(
      `${BASE_URL}/tickets?utm_source=outreach`,
    )
  },
}

export const SpeakerOutreachMobileDark: Story = {
  ...SpeakerOutreach,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  parameters: {
    ...SpeakerOutreach.parameters,
    theme: 'dark',
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'mobile1' },
  },
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

/**
 * Deleting a sent outreach Task (short-links spec §2.1's known hole, §2.7):
 * the preview warns that its link falls back to the home page, and the delete
 * stays available.
 */
export const OutreachSentDeleteWarning: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/marketing.task.deletionPreview', () =>
          HttpResponse.json({ result: { data: { liveLinks: 1 } } }),
        ),
        ...handlers(outreach({ messageId: 'message-1', complete: true })),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole(
        'button',
        { name: 'Delete task' },
        { timeout: 5000 },
      ),
    )
    const dialog = within(canvasElement.ownerDocument.body)
    // The dialog fades in: wait for the end of the transition, not only the node.
    await waitFor(
      () =>
        expect(
          dialog.getByText('1 short link may already be shared'),
        ).toBeVisible(),
      { timeout: 5000 },
    )
    await waitFor(() =>
      expect(
        dialog.getAllByRole('button', { name: 'Delete task' }).at(-1),
      ).toBeEnabled(),
    )
  },
}

export const OutreachSentDeleteWarningDark: Story = {
  ...OutreachSentDeleteWarning,
  parameters: {
    ...OutreachSentDeleteWarning.parameters,
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
}

export const OutreachSentDeleteWarningMobile: Story = {
  ...OutreachSentDeleteWarning,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  parameters: {
    ...OutreachSentDeleteWarning.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
  play: async (ctx) => {
    await expect(
      ctx.canvasElement.ownerDocument.documentElement.clientWidth,
    ).toBeLessThan(500)
    await OutreachSentDeleteWarning.play!(ctx)
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
      `${BASE_URL}/go/${OUTREACH_CODE}`,
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

// ---------------------------------------------------------------------------
// Bluesky tags (#1151, tagging spec §2, §4.4)
// ---------------------------------------------------------------------------

const TAG_BODY =
  '🎙️ @olga.dev and Alice Anderson on running Kubernetes at the edge. Catch them at Cloud Native Bergen 2027!'

const taggingFixture = fixture(
  {
    title: 'Talk teaser',
    key: 'talk-edge:bluesky',
    subject: {
      _id: 'talk-edge',
      type: 'talk',
      name: 'Kubernetes at the edge',
      slug: 'kubernetes-at-the-edge',
    },
  },
  variant({ body: TAG_BODY }),
  [],
  {
    tagPeople: [
      {
        speakerId: 'spk-alice',
        name: 'Alice Anderson',
        handle: 'alice.dev',
        optedOut: false,
      },
      {
        speakerId: 'spk-olga',
        name: 'Olga Nordmann',
        handle: null,
        optedOut: true,
      },
    ],
    tagMentions: [],
  },
)

/**
 * Approval refused because a speaker opted out since the tag was written:
 * the issue lands beside the tag buttons, and "Use the plain name" rewrites
 * the post in the form and clears it.
 */
export const TagApprovalRefusedAndFixed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/marketing.task.approve', () =>
          HttpResponse.json(
            {
              error: {
                message: 'Olga Nordmann has asked not to be tagged.',
                code: -32600,
                data: {
                  code: 'BAD_REQUEST',
                  httpStatus: 400,
                  tagIssues: [
                    {
                      code: 'opted-out',
                      mentionKey: 'spk-olga',
                      handle: 'olga.dev',
                      name: 'Olga Nordmann',
                      message:
                        'Olga Nordmann has asked not to be tagged in social posts. Use the plain name instead of @olga.dev.',
                    },
                  ],
                },
              },
            },
            { status: 400 },
          ),
        ),
        http.post('/api/trpc/marketing.task.resolveTag', () =>
          HttpResponse.json({
            result: { data: { handle: 'alice.dev', result: 'resolved' } },
          }),
        ),
        ...handlers(taggingFixture),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: /Approve/ }),
    )
    const alert = await canvas.findByText(/asked not to be tagged in social/)
    await expect(alert).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Use the plain name' }),
    )
    const body = canvas.getByLabelText<HTMLTextAreaElement>('Body')
    await expect(body.value).toContain('🎙️ Olga Nordmann and Alice Anderson')
    await expect(
      canvas.queryByText(/asked not to be tagged in social/),
    ).toBeNull()
    // The tag button on the same form: Alice's name becomes her handle.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Tag Alice Anderson' }),
    )
    // The swap waits for Bluesky's answer (the lookup is a request).
    await waitFor(() =>
      expect(body.value).toContain('Olga Nordmann and @alice.dev on'),
    )
  },
}
export const TagApprovalRefusedAndFixedMobileDark: Story = {
  ...TagApprovalRefusedAndFixed,
  // The refused state on a phone: the issue stacks its fix under the text
  // (TagPanel's narrow branch) instead of beside it.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: /Approve/ }),
    )
    const issue = (
      await canvas.findByText(/asked not to be tagged in social/)
    ).closest('li')!
    await expect(getComputedStyle(issue).flexDirection).toBe('column')
    await expect(
      within(issue).getByRole('button', { name: 'Use the plain name' }),
    ).toBeVisible()
  },
  parameters: {
    ...TagApprovalRefusedAndFixed.parameters,
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
}

/**
 * A tag lookup in flight on an approved post: it is about to edit the body,
 * so Move and "Pull back to draft" wait for it — neither may race the
 * revision the lookup's edit will be saved against.
 */
export const TagLookupHoldsHeaderActions: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/marketing.task.resolveTag', async () => {
          await delay('infinite')
          return HttpResponse.json({})
        }),
        ...handlers(
          fixture(
            {
              ...taggingFixture.task,
              status: 'scheduled',
              approvedAt: '2026-09-14T09:12:00.000Z',
              approvedByName: 'Bob Builder',
            },
            variant({ body: TAG_BODY, status: 'scheduled' }),
            [],
            {
              tagPeople: taggingFixture.tagPeople,
              tagMentions: [],
            },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pullBack = await canvas.findByRole('button', {
      name: 'Pull back to draft',
    })
    // Move is enabled by a date change; its date field is what the gate
    // disables, and it disables Move with it.
    const date = canvas.getByLabelText('Scheduled for')
    await expect(pullBack).toBeEnabled()
    await expect(date).toBeEnabled()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Tag Alice Anderson' }),
    )
    await waitFor(() => expect(pullBack).toBeDisabled())
    await expect(date).toBeDisabled()
    await expect(
      canvas.getByText('Save the post first; moving it re-times the post.'),
    ).toBeVisible()
  },
}

/**
 * A refused SAVE: the editor says "Not saved…" beside Save; fixing the last
 * issue with one click clears that too, since the refusal no longer stands.
 */
export const TagSaveRefusedAndFixed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/social.updateVariant', () =>
          HttpResponse.json(
            {
              error: {
                message: 'Olga Nordmann has asked not to be tagged.',
                code: -32600,
                data: {
                  code: 'BAD_REQUEST',
                  httpStatus: 400,
                  tagIssues: [
                    {
                      code: 'opted-out',
                      mentionKey: 'spk-olga',
                      handle: 'olga.dev',
                      name: 'Olga Nordmann',
                      message:
                        'Olga Nordmann has asked not to be tagged in social posts. Use the plain name instead of @olga.dev.',
                    },
                  ],
                },
              },
            },
            { status: 400 },
          ),
        ),
        ...handlers(taggingFixture),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = await canvas.findByLabelText<HTMLTextAreaElement>('Body')
    await userEvent.type(body, ' See you there.')
    await userEvent.click(canvas.getByRole('button', { name: 'Save variant' }))
    await expect(
      await canvas.findByText('Not saved. Fix the tag problems above first.'),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Use the plain name' }),
    )
    await expect(body.value).toContain('🎙️ Olga Nordmann and Alice Anderson')
    await expect(
      canvas.queryByText('Not saved. Fix the tag problems above first.'),
    ).toBeNull()
  },
}

/** "Pull back to draft" in flight: the tag buttons wait for it. */
export const UnscheduleHoldsTagButtons: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/social.unscheduleVariant', async () => {
          await delay('infinite')
          return HttpResponse.json({})
        }),
        ...handlers(
          fixture(
            {
              ...taggingFixture.task,
              status: 'scheduled',
              approvedAt: '2026-09-14T09:12:00.000Z',
              approvedByName: 'Bob Builder',
            },
            variant({ body: TAG_BODY, status: 'scheduled' }),
            [],
            { tagPeople: taggingFixture.tagPeople, tagMentions: [] },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tag = await canvas.findByRole('button', {
      name: 'Tag Alice Anderson',
    })
    await expect(tag).toBeEnabled()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Pull back to draft' }),
    )
    await waitFor(() => expect(tag).toBeDisabled())
  },
}

// ---------------------------------------------------------------------------
// Generated copy for a two-speaker talk (#1153, tagging spec §4.2)
// ---------------------------------------------------------------------------

/**
 * The Bluesky video post exactly as generation writes it: a real
 * `buildSubjectBeat` run on the built-in videoDrip recipes, so `{speakers}`
 * is each speaker's handle (or name) with their title, in the talk's order.
 */
const twoSpeakerBeat = (() => {
  const campaign = BUILTIN_TEMPLATE.campaigns.find((c) =>
    c.recipes.some((r) => r.beat === 'videoDrip'),
  )!
  const recipes = beatRecipes(campaign, 'videoDrip')
    .filter((r) => r.channel === 'bluesky')
    .map((r) => ({ ...r, tagSubject: true }))
  let n = 0
  const beat = buildSubjectBeat({
    recipes,
    subject: talkSubject({
      _id: 'talk-edge',
      title: 'Kubernetes at the edge',
      speakers: [
        { _id: 'spk-alice', name: 'Alice Anderson', title: 'SRE, Acme' },
        { _id: 'spk-bob', name: 'Bob Berg', title: 'CTO, Initech' },
      ],
    }),
    tags: new Map([
      [
        'spk-alice',
        { status: 'tagged', handle: 'alice.dev', did: 'did:plc:alice' },
      ],
      [
        'spk-bob',
        {
          status: 'tagged',
          handle: 'bob.bsky.social',
          did: 'did:plc:bob',
        },
      ],
    ]),
    dates: new Map(
      recipes.map((r) => [
        r.key,
        { at: '2027-06-08T16:00:00.000Z', anchor: null, provisional: false },
      ]),
    ),
    campaign: { _id: 'camp-cfp', key: 'postEvent' },
    planId: 'plan-1',
    conference: { _id: 'conf-1', baseUrl: BASE_URL, shortLinkOrigin: BASE_URL },
    values: { event: 'Cloud Native Bergen 2027' },
    assigneeId: 'sp-1',
    origin: 'expansion',
    taskId: (key) => `task:${key}`,
    newShortCode: () => `code${++n}`,
    newId: (type) => `${type}.${++n}`,
  })
  const v = beat.variants.find((x) => x.platform === 'bluesky')!
  return { body: v.body, mentions: v.mentions ?? [] }
})()

const twoSpeakerFixture = fixture(
  {
    title: 'Recording: Kubernetes at the edge',
    key: 'videoDrip:bluesky',
    subject: {
      _id: 'talk-edge',
      type: 'talk',
      name: 'Kubernetes at the edge',
      slug: 'kubernetes-at-the-edge',
    },
  },
  variant({ body: twoSpeakerBeat.body }),
  [],
  {
    tagPeople: [
      {
        speakerId: 'spk-alice',
        name: 'Alice Anderson',
        handle: 'alice.dev',
        optedOut: false,
      },
      {
        speakerId: 'spk-bob',
        name: 'Bob Berg',
        handle: 'bob.bsky.social',
        optedOut: false,
      },
    ],
    tagMentions: twoSpeakerBeat.mentions,
  },
)

/** Generated copy naming and tagging both of a talk's speakers. */
export const TwoSpeakerGeneratedCopy: Story = {
  parameters: { msw: { handlers: handlers(twoSpeakerFixture) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = await canvas.findByLabelText<HTMLTextAreaElement>('Body')
    await expect(body.value).toContain(
      '@alice.dev (SRE, Acme) and @bob.bsky.social (CTO, Initech)',
    )
  },
}

export const TwoSpeakerGeneratedCopyDark: Story = {
  ...TwoSpeakerGeneratedCopy,
  parameters: {
    ...TwoSpeakerGeneratedCopy.parameters,
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
}

export const TwoSpeakerGeneratedCopyMobile: Story = {
  ...TwoSpeakerGeneratedCopy,
  // `globals` sizes it in the Storybook UI (Storybook 10 ignores the
  // parameter there); the test-runner's preVisit reads the parameter.
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async (ctx) => {
    // The mobile branch is only exercised if the page really is narrow.
    await expect(
      ctx.canvasElement.ownerDocument.documentElement.clientWidth,
    ).toBeLessThan(500)
    await TwoSpeakerGeneratedCopy.play!(ctx)
  },
  parameters: {
    ...TwoSpeakerGeneratedCopy.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}
