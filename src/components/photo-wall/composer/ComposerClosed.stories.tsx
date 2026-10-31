import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import type { MyPost } from '@/lib/photo-wall/my-posts'
import { REFUSAL_MESSAGES } from '@/lib/photo-wall/post'
import { ComposerClosed, WALL_CLOSED_MESSAGE } from './ComposerClosed'
import { MyPostsPanel, type MyPostsPanelProps } from './MyPostsPanel'

/** Posts this phone made earlier, as `getMyPosts` would list them. */
const EARLIER: MyPost[] = [
  {
    _id: 'wallPost-earlier-1',
    status: 'approved',
    src: '/storybook-fixtures/wall-landscape.jpg',
    caption: 'Keynote crowd, first morning',
    name: 'Ada',
    marketingConsent: true,
    submittedAt: '2026-10-26T08:00:00Z',
  },
  {
    _id: 'wallPost-earlier-2',
    status: 'notShown',
    src: '/storybook-fixtures/wall-portrait.jpg',
    caption: null,
    name: null,
    marketingConsent: false,
    submittedAt: '2026-10-26T07:30:00Z',
  },
]

const actions: MyPostsPanelProps = {
  getMyPosts: fn<MyPostsPanelProps['getMyPosts']>(async () => EARLIER),
  deleteMyPost: fn<MyPostsPanelProps['deleteMyPost']>(async () => ({
    status: 'deleted',
  })),
  setMyPostMarketing: fn<MyPostsPanelProps['setMyPostMarketing']>(async () => ({
    status: 'done',
  })),
}

/**
 * `/wall/post` outside the Posting Window (Photo Wall spec §6.5, §7). The
 * component has two lines: the closed line (paused, not yet open and ended
 * all render it, with no date) and, after the retention cron, "This wall has
 * closed." (§11.1). The page always passes My posts as children. Each play
 * checks See the wall's class, which once rendered an error string (#1701).
 * Dark mode follows the global `theme` toolbar (story-level `globals`).
 */
const meta = {
  title: 'Systems/PhotoWall/ComposerClosed',
  component: ComposerClosed,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'phone' },
  },
  args: { logo: { title: 'Cloud Native Days Norway' } },
} satisfies Meta<typeof ComposerClosed>

export default meta
type Story = StoryObj<typeof meta>

async function expectClosedPage(canvasElement: HTMLElement, line: string) {
  const canvas = within(canvasElement)
  await expect(
    canvas.getByRole('heading', {
      level: 1,
      name: 'Add your photo to the wall',
    }),
  ).toBeVisible()
  await expect(canvas.getByText(line)).toBeVisible()
  const link = canvas.getByRole('link', { name: 'See the wall' })
  await expect(link).toHaveAttribute('href', '/wall')
  await expect(link.className.trim()).not.toBe('')
  await expect(link.className).not.toMatch(/Error|Attempted/)
}

/** Paused, not yet open or ended: the closed line and See the wall. */
export const Closed: Story = {
  play: ({ canvasElement }) =>
    expectClosedPage(canvasElement, REFUSAL_MESSAGES.closed),
}

export const ClosedDark: Story = { ...Closed, globals: { theme: 'dark' } }

/** Closed, with My posts under See the wall, as the page renders it (§12). */
export const ClosedWithMyPosts: Story = {
  render: (args) => (
    <ComposerClosed {...args}>
      <MyPostsPanel {...actions} />
    </ComposerClosed>
  ),
  play: async ({ canvasElement }) => {
    await expectClosedPage(canvasElement, REFUSAL_MESSAGES.closed)
    await expect(
      await within(canvasElement).findByRole('heading', {
        level: 2,
        name: 'My posts',
      }),
    ).toBeVisible()
  },
}

export const ClosedWithMyPostsDark: Story = {
  ...ClosedWithMyPosts,
  globals: { theme: 'dark' },
}

/** Closed by the retention cron (§11.1). */
export const WallClosed: Story = {
  args: { wallClosed: true },
  play: async ({ canvasElement }) => {
    await expectClosedPage(canvasElement, WALL_CLOSED_MESSAGE)
    await expect(
      within(canvasElement).queryByText(REFUSAL_MESSAGES.closed),
    ).not.toBeInTheDocument()
  },
}

export const WallClosedDark: Story = {
  ...WallClosed,
  globals: { theme: 'dark' },
}

/** Wall closed, My posts still there: Delete stays allowed (§12). */
export const WallClosedWithMyPosts: Story = {
  ...ClosedWithMyPosts,
  args: { wallClosed: true },
  play: async ({ canvasElement }) => {
    await expectClosedPage(canvasElement, WALL_CLOSED_MESSAGE)
    await expect(
      await within(canvasElement).findByRole('heading', {
        level: 2,
        name: 'My posts',
      }),
    ).toBeVisible()
  },
}

export const WallClosedWithMyPostsDark: Story = {
  ...WallClosedWithMyPosts,
  globals: { theme: 'dark' },
}
