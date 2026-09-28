import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { SocialPostsManager } from './SocialPostsManager'
import { NotificationProvider } from '../NotificationProvider'
import type { SocialPostVariantListItem } from '@/lib/social/types'
import type { SocialConnection } from '@/lib/social/provider'

const base = {
  _rev: 'rev-1',
  claimedAt: null,
  shortCode: null,
  postId: 'post-1',
  conferenceId: 'conf-1',
  orgId: 'org-1',
  postDefaultScheduledAt: '2026-09-13T09:00:00.000Z',
  usesCustomTime: false,
  link: null,
  attachments: [],
  submission: null,
  publishResult: null,
  attempts: [],
  attemptCount: 0,
  updatedAt: '2026-09-13T10:00:00.000Z',
}

const variants: SocialPostVariantListItem[] = [
  {
    ...base,
    _id: 'v-1',
    platform: 'linkedin',
    body: 'Early-bird tickets for Cloud Native Bergen 2027 are live. Grab yours before the price goes up on 1 December.',
    status: 'awaiting-manual',
    scheduledAt: '2026-09-13T09:00:00.000Z',
    attemptCount: 1,
    attempts: [
      {
        _key: 'a1',
        at: '2026-09-13T09:00:07.000Z',
        outcome: 'awaiting-manual',
      },
    ],
  },
  {
    ...base,
    _id: 'v-2',
    platform: 'bluesky',
    body: 'Early-bird tickets for #CloudNativeBergen 2027 are live 🎟️',
    status: 'scheduled',
    scheduledAt: '2026-09-14T07:30:00.000Z',
    usesCustomTime: true,
  },
  {
    ...base,
    _id: 'v-3',
    postId: 'post-2',
    platform: 'linkedin',
    body: 'The call for papers closes on Friday. Submit your talk!',
    status: 'draft',
    scheduledAt: null,
  },
  {
    ...base,
    _id: 'v-4',
    postId: 'post-3',
    platform: 'bluesky',
    body: 'Keynote announced: platform engineering at scale.',
    status: 'published',
    scheduledAt: '2026-09-10T08:00:00.000Z',
    publishResult: {
      externalId: 'at://did:plc:abc/app.bsky.feed.post/3k',
      url: 'https://bsky.app/profile/cloudnativebergen.dev/post/3k',
    },
    attempts: [
      { _key: 'a1', at: '2026-09-10T08:00:12.000Z', outcome: 'published' },
    ],
  },
  {
    ...base,
    _id: 'v-5',
    postId: 'post-3',
    platform: 'mastodon',
    body: 'Keynote announced: platform engineering at scale.',
    status: 'failed',
    scheduledAt: '2026-09-10T08:00:00.000Z',
    attempts: [
      {
        _key: 'a1',
        at: '2026-09-10T08:00:12.000Z',
        outcome: 'stale-claim',
        error:
          'Publishing claim from 2026-09-10T08:00:12.000Z never completed. Check the platform before retrying.',
      },
    ],
  },
  // #1128: accepted by an asynchronous publisher and waiting for the confirm
  // sweep. In flight — no actions, and the post cannot be deleted.
  {
    ...base,
    _id: 'v-6',
    postId: 'post-4',
    platform: 'linkedin',
    body: 'Programme is out: three tracks, 42 talks, one hallway.',
    status: 'submitted',
    scheduledAt: '2026-09-13T08:00:00.000Z',
    attemptCount: 1,
    submission: {
      vendorPostId: 'buffer-6f2a',
      submittedAt: '2026-09-13T08:00:11.000Z',
      lastCheckedAt: '2026-09-13T08:00:41.000Z',
    },
    attempts: [
      { _key: 'a1', at: '2026-09-13T08:00:11.000Z', outcome: 'submitted' },
    ],
  },
  // #1130: Buffer accepted it, then reported an error during the confirm
  // sweep. Terminal, never retried automatically: retry or post by hand.
  {
    ...base,
    _id: 'v-7',
    postId: 'post-5',
    platform: 'linkedin',
    body: 'Workshop day sold out in four hours. Thank you! The waiting list is open.',
    status: 'failed',
    scheduledAt: '2026-09-12T08:00:00.000Z',
    attemptCount: 1,
    submission: {
      vendorPostId: 'buffer-9c1d',
      submittedAt: '2026-09-12T08:00:11.000Z',
      lastCheckedAt: '2026-09-12T08:01:41.000Z',
    },
    attempts: [
      { _key: 'a1', at: '2026-09-12T08:00:11.000Z', outcome: 'submitted' },
      {
        _key: 'a2',
        at: '2026-09-12T08:01:41.000Z',
        outcome: 'rejected',
        error:
          'Your LinkedIn connection needs to be refreshed. Reconnect the channel in Buffer and try again.',
      },
    ],
  },
]

/** LinkedIn connected through Buffer, Bluesky not connected (#1130). */
const viaBuffer: SocialConnection[] = [
  { platform: 'linkedin', mode: 'automatic', via: 'buffer' },
  { platform: 'bluesky', mode: 'manual', via: null },
]
const allManual: SocialConnection[] = [
  { platform: 'linkedin', mode: 'manual', via: null },
  { platform: 'bluesky', mode: 'manual', via: null },
]

const handlers = (
  rows: SocialPostVariantListItem[],
  connections: SocialConnection[] = viaBuffer,
) => [
  http.get('/api/trpc/social.connections', () =>
    HttpResponse.json({ result: { data: connections } }),
  ),
  http.get('/api/trpc/social.listVariants', () =>
    HttpResponse.json({ result: { data: rows } }),
  ),
  http.post('/api/trpc/social.createPost', () =>
    HttpResponse.json({
      result: { data: { postId: 'post-new', variantIds: ['v-new'] } },
    }),
  ),
  http.post('/api/trpc/social.scheduleVariant', () =>
    HttpResponse.json({
      result: { data: { success: true, status: 'scheduled' } },
    }),
  ),
  http.post('/api/trpc/social.unscheduleVariant', () =>
    HttpResponse.json({ result: { data: { success: true, status: 'draft' } } }),
  ),
  http.post('/api/trpc/social.deletePost', () =>
    HttpResponse.json({ result: { data: { deleted: true, variants: 2 } } }),
  ),
  http.post('/api/trpc/social.markPosted', () =>
    HttpResponse.json({
      result: { data: { success: true, status: 'published' } },
    }),
  ),
  http.get('/api/trpc/social.getVariantEditor', ({ request }) => {
    const input = new URL(request.url).searchParams.get('input')
    const variantId = input
      ? (JSON.parse(input) as { variantId?: string }).variantId
      : undefined
    const variant = rows.find((v) => v._id === variantId)
    if (!variant) {
      return HttpResponse.json(
        { error: { message: 'Variant not found', code: -32004 } },
        { status: 404 },
      )
    }
    return HttpResponse.json({
      result: {
        data: {
          variant,
          post: {
            attachments: [],
            defaultScheduledAt: variant.postDefaultScheduledAt,
          },
        },
      },
    })
  }),
  http.post('/api/trpc/social.updateVariant', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
  http.post('/api/trpc/social.addPostAttachment', () =>
    HttpResponse.json({ result: { data: { key: 'att-new' } } }),
  ),
  http.get('/api/trpc/gallery.admin.list', () =>
    HttpResponse.json({ result: { data: [] } }),
  ),
]

const meta = {
  title: 'Systems/Marketing/Admin/SocialPostsManager',
  component: SocialPostsManager,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: handlers(variants) },
    docs: {
      description: {
        component:
          'The posting core’s minimal organizer surface (#1004): every variant of the conference with its status and the organizer actions per state: schedule, unschedule, retry, mark as posted.',
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
} satisfies Meta<typeof SocialPostsManager>

export default meta
type Story = StoryObj<typeof meta>

/**
 * LinkedIn publishes through Buffer (#1130): the connection strip says so, a
 * submitted variant reads as with Buffer, and a variant Buffer failed shows
 * Buffer's message with Retry and Post by hand.
 */
export const Table: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const strip = await canvas.findByRole('region', {
      name: /how posts are published/i,
    })
    await expect(strip).toHaveTextContent(/LinkedIn\s*Automatic via Buffer/)
    await expect(strip).toHaveTextContent(/Bluesky\s*Manual/)
    await expect(
      await canvas.findByText('Sent to Buffer, confirming…'),
    ).toBeVisible()
    const failedRow = (
      await canvas.findByText(/Workshop day sold out/)
    ).closest('tr')!
    await expect(failedRow).toHaveTextContent(/Reconnect the channel in Buffer/)
    await expect(
      within(failedRow).getByRole('button', { name: 'Retry' }),
    ).toBeVisible()
    await expect(
      within(failedRow).getByRole('button', { name: 'Post by hand' }),
    ).toBeVisible()
  },
}

export const TableDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** Phone width: the strip stacks, the table scrolls inside its own box. */
export const TableMobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/** An organization with no Buffer connection: LinkedIn is posted by hand. */
export const ManualOrganization: Story = {
  parameters: { msw: { handlers: handlers(variants, allManual) } },
  play: async ({ canvasElement }) => {
    const strip = await within(canvasElement).findByRole('region', {
      name: /how posts are published/i,
    })
    await expect(strip).toHaveTextContent(/LinkedIn\s*Manual/)
    await expect(strip).not.toHaveTextContent(/Buffer/)
  },
}

/**
 * The failure notification's deep link (`?variant=`) on a variant Buffer
 * failed: the copy-ready view says why, in Buffer's words, and offers the
 * manual fallback (`failed → published`, spec §5).
 */
export const FailedAtBuffer: Story = {
  args: { defaultManualId: 'v-7' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(
      await body.findByText(/did not go out on LinkedIn/i),
    ).toBeVisible()
    await expect(
      body.getByText(/Reconnect the channel in Buffer/),
    ).toBeVisible()
    await expect(
      body.getByLabelText(/address of the published post/i),
    ).toBeVisible()
  },
}

export const FailedAtBufferDark: Story = {
  args: { defaultManualId: 'v-7' },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** The copy-ready view opened from a row or the notification deep link. */
export const PostByHand: Story = {
  args: { defaultManualId: 'v-1' },
}

export const Empty: Story = {
  parameters: { msw: { handlers: handlers([]) } },
}

export const NewPostForm: Story = {
  args: { defaultOpen: true },
}

export const EditorOpen: Story = {
  args: { defaultEditId: 'v-2' },
  parameters: {
    docs: {
      description: {
        story:
          'The Edit action on a draft, scheduled or failed row opens the single-variant editor in a modal.',
      },
    },
  },
}
