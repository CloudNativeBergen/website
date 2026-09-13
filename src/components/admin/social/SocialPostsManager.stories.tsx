import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { SocialPostsManager } from './SocialPostsManager'
import { NotificationProvider } from '../NotificationProvider'
import type { SocialPostVariantListItem } from '@/lib/social/types'

const base = {
  _rev: 'rev-1',
  claimedAt: null,
  postId: 'post-1',
  conferenceId: 'conf-1',
  orgId: 'org-1',
  postDefaultScheduledAt: '2026-09-13T09:00:00.000Z',
  usesCustomTime: false,
  link: null,
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
]

const handlers = (rows: SocialPostVariantListItem[]) => [
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

export const Table: Story = {}

export const TableDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

export const Empty: Story = {
  parameters: { msw: { handlers: handlers([]) } },
}

export const NewPostForm: Story = {
  args: { defaultOpen: true },
}
