import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  countByTab,
  type ModerationPost,
  type ModerationQueueData,
  type PhotoWallAdminView,
} from '@/lib/photo-wall'
import { ModerationQueue, ModerationQueueView } from './ModerationQueue'
import { PendingSummary, PendingSummaryView } from './PendingSummary'
import { PhotoWallAdmin } from './PhotoWallAdmin'

/** Local fixture photos (`.storybook/main.ts` staticDirs): no network. */
const LANDSCAPE = {
  url: '/storybook-fixtures/wall-landscape.jpg',
  width: 1600,
  height: 1000,
}
const PORTRAIT = {
  url: '/storybook-fixtures/wall-portrait.jpg',
  width: 1200,
  height: 1600,
}

let n = 0
const post = (fields: Partial<ModerationPost>): ModerationPost => ({
  _id: `wallPost-${++n}`,
  status: 'pending',
  photo: LANDSCAPE,
  crop: { x: 0.5, y: 0.5 },
  caption: null,
  name: null,
  marketingConsent: false,
  submittedAt: '2026-10-26T07:30:00Z',
  approvedAt: null,
  decidedAt: null,
  ...fields,
})

const POSTS: ModerationPost[] = [
  // Pending: a landscape cropped to its left edge, with everything filled in.
  post({
    caption: 'Keynote crowd, first morning',
    name: 'Ada',
    marketingConsent: true,
    crop: { x: 0, y: 0.5 },
    submittedAt: '2026-10-26T07:31:00Z',
  }),
  // Pending: a portrait cropped to its bottom edge, no caption, no name.
  post({
    photo: PORTRAIT,
    crop: { x: 0.5, y: 1 },
    submittedAt: '2026-10-26T07:34:00Z',
  }),
  // Pending: a landscape cropped to its right edge, no marketing consent.
  post({
    caption: 'Hallway track',
    name: 'Bo',
    crop: { x: 1, y: 0.5 },
    submittedAt: '2026-10-26T07:40:00Z',
  }),
  // On the wall: newest approval first.
  post({
    status: 'approved',
    photo: PORTRAIT,
    crop: { x: 0.5, y: 0 },
    caption: 'Doors open',
    name: 'Cy',
    marketingConsent: true,
    submittedAt: '2026-10-26T06:50:00Z',
    approvedAt: '2026-10-26T07:00:00Z',
    decidedAt: '2026-10-26T07:00:00Z',
  }),
  post({
    status: 'approved',
    caption: 'Registration desk',
    submittedAt: '2026-10-26T06:40:00Z',
    approvedAt: '2026-10-26T07:10:00Z',
    decidedAt: '2026-10-26T07:10:00Z',
  }),
  // Not shown: a rejected post, and a delete that did not finish.
  post({
    status: 'notShown',
    caption: 'Blurry',
    name: 'Di',
    submittedAt: '2026-10-26T07:00:00Z',
    decidedAt: '2026-10-26T07:05:00Z',
  }),
  post({
    status: 'deleting',
    photo: null,
    caption: 'Gone soon',
    name: 'Ed',
    submittedAt: '2026-10-26T07:20:00Z',
  }),
]
const QUEUE: ModerationQueueData = { posts: POSTS }
const EMPTY: ModerationQueueData = { posts: [] }

const meta = {
  title: 'Systems/PhotoWall/ModerationQueue',
  component: ModerationQueueView,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The moderation queue on `/admin/photo-wall` (Photo Wall spec §8, §10), slice M4a: the tabs **Pending**, **On the wall** and **Not shown**, and a card per Wall Post with the whole photo, the square crop the wall shows outlined, caption, name, submitted time and the Marketing OK mark. A `deleting` post sits in Not shown with no image and "Couldn’t delete. Try again." (§12). No actions yet (M4b). Photos are plain `<img>` elements of their Sanity URLs, never `next/image` (§5.1). One column on a phone, a grid on desktop. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  args: { queue: QUEUE },
} satisfies Meta<typeof ModerationQueueView>

export default meta
type Story = StoryObj<typeof meta>

const PHONE = { viewport: { defaultViewport: 'mobile1' } }

export const Pending: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('tab', { name: 'Pending (3)' }),
    ).toHaveAttribute('aria-selected', 'true')
    const cards = canvas.getAllByRole('article')
    await expect(cards).toHaveLength(3)
    // Oldest first.
    await expect(cards[0]).toHaveAccessibleName('Keynote crowd, first morning')
    await expect(within(cards[0]).getByText('Marketing OK')).toBeVisible()
    // Every photo is a plain <img> of its own URL.
    for (const img of canvas.getAllByRole('img')) {
      await expect(img.getAttribute('src')).toMatch(/^\/storybook-fixtures\//)
    }
  },
}
export const PendingDark: Story = { globals: { theme: 'dark' } }
export const PendingPhone: Story = { parameters: PHONE }
export const PendingPhoneDark: Story = {
  parameters: PHONE,
  globals: { theme: 'dark' },
}

export const OnTheWall: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: 'On the wall (2)' }))
    const cards = canvas.getAllByRole('article')
    await expect(cards).toHaveLength(2)
    // Newest approval first.
    await expect(cards[0]).toHaveAccessibleName('Registration desk')
  },
}
export const OnTheWallPhoneDark: Story = {
  ...OnTheWall,
  parameters: PHONE,
  globals: { theme: 'dark' },
}

/** Not shown holds the rejected post and a delete that did not finish (§12). */
export const NotShownWithDeleting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: 'Not shown (2)' }))
    const cards = canvas.getAllByRole('article')
    await expect(cards).toHaveLength(2)
    const deleting = cards.find((c) => within(c).queryByText('Gone soon'))!
    await expect(
      within(deleting).getByText('Couldn’t delete. Try again.'),
    ).toBeVisible()
    await expect(within(deleting).queryByRole('img')).toBeNull()
  },
}
export const NotShownWithDeletingPhone: Story = {
  ...NotShownWithDeleting,
  parameters: PHONE,
}
export const NotShownWithDeletingDark: Story = {
  ...NotShownWithDeleting,
  globals: { theme: 'dark' },
}

/** The tabs are keyboard tabs: arrow keys move and select. */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('tab', { name: 'Pending (3)' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(
      canvas.getByRole('tab', { name: 'On the wall (2)' }),
    ).toHaveFocus()
    await expect(canvas.getAllByRole('article')).toHaveLength(2)
    await userEvent.keyboard('{End}')
    await expect(
      canvas.getByRole('tab', { name: 'Not shown (2)' }),
    ).toHaveFocus()
  },
}

/** A caption at its 80-character limit and a name at its 40, on a phone. */
export const LongText: Story = {
  args: {
    queue: {
      posts: [
        post({
          caption:
            'Thirtyfourcharacterswithoutasinglespace_and_then_the_rest_of_the_eighty_chars!!',
          name: 'Maximiliana-Wilhelmina Oluwaseunfunmi Ng',
          marketingConsent: true,
          photo: PORTRAIT,
          crop: { x: 0.5, y: 0.3 },
        }),
      ],
    },
  },
  parameters: PHONE,
}

export const Empty: Story = {
  args: { queue: EMPTY },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent(
      /Nothing waiting/,
    )
    await userEvent.click(canvas.getByRole('tab', { name: 'On the wall (0)' }))
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent(
      /Nothing on the wall yet/,
    )
    await userEvent.click(canvas.getByRole('tab', { name: 'Not shown (0)' }))
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent(
      /Rejected and removed posts/,
    )
  },
}
export const EmptyPhoneDark: Story = {
  args: { queue: EMPTY },
  parameters: PHONE,
  globals: { theme: 'dark' },
}

export const Loading: Story = { args: { queue: undefined, loading: true } }
export const LoadFailed: Story = { args: { queue: undefined, failed: true } }
/** The last poll failed: the posts read before stay, with a note. */
export const RefreshFailed: Story = {
  args: { failed: true },
  parameters: PHONE,
}

const LINKS = {
  post: 'https://2026.cloudnativedays.no/wall/post',
  wall: 'https://2026.cloudnativedays.no/wall',
  screen: 'https://2026.cloudnativedays.no/wall/screen',
}
const VIEW: PhotoWallAdminView = {
  wall: {
    _id: 'photoWall-conf-A',
    postingMode: 'open',
    sponsorStrip: false,
    closedAt: null,
  },
  posting: 'open',
  links: LINKS,
}

/**
 * The whole admin page: the live pending count under the header, the queue
 * under the settings and links. Review selects the Pending tab and moves
 * focus to it.
 */
export const InThePage: StoryObj<typeof PhotoWallAdmin> = {
  render: (args) => <PhotoWallAdmin {...args} />,
  args: {
    view: VIEW,
    conferenceTitle: 'Cloud Native Days Norway 2026',
    onSetUp: fn(),
    onChange: fn(),
    summary: <PendingSummaryView pending={countByTab(POSTS).pending} />,
    queue: <ModerationQueueView queue={QUEUE} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('region', { name: 'Settings' })).toBeVisible()
    await expect(canvas.getByRole('region', { name: 'Posts' })).toBeVisible()
    const summary = canvas.getByTestId('pending-summary')
    await expect(summary).toHaveTextContent('3 photos waiting')
    await userEvent.click(canvas.getByRole('tab', { name: 'Not shown (2)' }))
    await userEvent.click(within(summary).getByRole('link', { name: 'Review' }))
    const pending = canvas.getByRole('tab', { name: 'Pending (3)' })
    await expect(pending).toHaveAttribute('aria-selected', 'true')
    await expect(pending).toHaveFocus()
  },
}
export const InThePageDark: StoryObj<typeof PhotoWallAdmin> = {
  ...InThePage,
  globals: { theme: 'dark' },
}
export const InThePagePhone: StoryObj<typeof PhotoWallAdmin> = {
  ...InThePage,
  parameters: PHONE,
}
export const InThePagePhoneDark: StoryObj<typeof PhotoWallAdmin> = {
  ...InThePage,
  parameters: PHONE,
  globals: { theme: 'dark' },
}
/** Nothing waiting: the count says so quietly, with no Review link. */
export const InThePageNothingWaiting: StoryObj<typeof PhotoWallAdmin> = {
  ...InThePage,
  args: {
    ...InThePage.args!,
    summary: <PendingSummaryView pending={0} />,
    queue: <ModerationQueueView queue={EMPTY} />,
  },
  parameters: PHONE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('pending-summary')).toHaveTextContent(
      'Nothing waiting for approval',
    )
    await expect(canvas.queryByRole('link', { name: 'Review' })).toBeNull()
  },
}
/** Before Set up there is no queue to show. */
export const InThePageNotSetUp: StoryObj<typeof PhotoWallAdmin> = {
  ...InThePage,
  args: { ...InThePage.args!, view: { ...VIEW, wall: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('region', { name: 'Posts' })).toBeNull()
    await expect(canvas.queryByRole('tablist')).toBeNull()
    await expect(canvas.queryByTestId('pending-summary')).toBeNull()
  },
}

/**
 * Connected: `photoWall.moderationQueue` mocked, polled by the real client;
 * the count and the queue read the one query.
 */
export const Polled: StoryObj<typeof ModerationQueue> = {
  render: () => (
    <div className="space-y-6">
      <PendingSummary />
      <ModerationQueue />
    </div>
  ),
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/photoWall.moderationQueue', () =>
          HttpResponse.json({ result: { data: QUEUE } }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Loading posts…')).toBeVisible()
    await expect(
      await canvas.findByText('3 photos waiting', {}, { timeout: 5000 }),
    ).toBeVisible()
    await expect(canvas.getAllByRole('article')).toHaveLength(3)
  },
}
