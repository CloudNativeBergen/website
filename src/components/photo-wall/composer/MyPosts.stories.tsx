import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { MyPost } from '@/lib/photo-wall/my-posts'
import { WallChrome } from '../WallPage'
import { MyPosts, type MyPostsProps } from './MyPosts'

/** Local fixture photos (`.storybook/main.ts` staticDirs): no network. */
const LANDSCAPE = '/storybook-fixtures/wall-landscape.jpg'
const PORTRAIT = '/storybook-fixtures/wall-portrait.jpg'
const PHOTO = '/storybook-fixtures/wall-photo.jpg'

let n = 0
const post = (fields: Partial<MyPost>): MyPost => ({
  _id: `wallPost-${++n}`,
  status: 'pending',
  src: LANDSCAPE,
  caption: null,
  name: null,
  marketingConsent: false,
  submittedAt: '2026-10-26T09:00:00Z',
  incarnation: { createdAt: '2026-10-26T09:00:00.000Z', assetId: 'image-1' },
  ...fields,
})

const POSTS: MyPost[] = [
  post({ src: PHOTO, caption: 'Coffee #3 and k8s', name: 'Kari' }),
  post({
    status: 'approved',
    caption: 'Keynote crowd, first morning',
    name: 'Ada',
    marketingConsent: true,
  }),
  post({ status: 'notShown', src: PORTRAIT, caption: 'Waffles > YAML' }),
  post({ status: 'deleting', src: null, caption: 'Hallway track', name: 'Cy' }),
]

/**
 * My posts (Photo Wall spec §6.5, §12): each of this phone's posts with its
 * status, the Marketing switch and Delete behind an inline confirm, in the
 * composer's chrome at phone width. Photos are plain `<img>` elements (§5.1).
 * Dark mode follows the global `theme` toolbar (story-level `globals`), the
 * mechanism `.storybook/preview.tsx` reads; this file has no decorator of
 * its own.
 */
const meta = {
  title: 'Systems/PhotoWall/MyPosts',
  component: MyPosts,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'phone' },
  },
  args: {
    posts: POSTS,
    onDelete: fn<MyPostsProps['onDelete']>(async () => 'deleted'),
    onMarketing: fn<MyPostsProps['onMarketing']>(async () => 'done'),
  },
  render: (args) => (
    <WallChrome logo={{ title: 'Cloud Native Days Norway' }}>
      <h1 className="font-display text-2xl font-semibold">My posts</h1>
      <div className="mt-8">
        <MyPosts {...args} />
      </div>
    </WallChrome>
  ),
} satisfies Meta<typeof MyPosts>

export default meta
type Story = StoryObj<typeof meta>

/** Every status: Waiting for approval, On the wall, Not shown, and a Delete that did not finish. */
export const Statuses: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Waiting for approval')).toBeVisible()
    await expect(canvas.getByText('On the wall')).toBeVisible()
    await expect(canvas.getByText('Not shown')).toBeVisible()
    await expect(canvas.getByText('Couldn’t delete. Try again.')).toBeVisible()
    await expect(
      canvas.getAllByRole('switch', { name: 'Marketing' }),
    ).toHaveLength(3)
  },
}

export const StatusesDark: Story = {
  ...Statuses,
  globals: { theme: 'dark' },
}

/** Delete pressed: the inline confirm, with Cancel focused. */
export const DeleteConfirm: Story = {
  args: { posts: POSTS.slice(0, 1) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }))
    await expect(
      canvas.getByText(
        'Delete this photo? It’s removed from the wall and can’t be undone.',
      ),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await expect(args.onDelete).not.toHaveBeenCalled()
  },
}

export const DeleteConfirmDark: Story = {
  ...DeleteConfirm,
  globals: { theme: 'dark' },
}

/** The delete did not go through: the card says so, Delete is offered again. */
export const DeleteFailed: Story = {
  args: {
    posts: POSTS.slice(0, 1),
    onDelete: fn<MyPostsProps['onDelete']>(async () => 'failed'),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete this photo' }),
    )
    await expect(
      await canvas.findByText('Couldn’t delete. Try again.'),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Delete' })).toBeVisible()
  },
}

/** The Marketing switch flips on a press and stays flipped once the change went through. */
export const MarketingSwitch: Story = {
  args: { posts: POSTS.slice(1, 2) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('switch', { name: 'Marketing' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(toggle)
    await expect(args.onMarketing).toHaveBeenCalledWith(
      expect.objectContaining({ _id: POSTS[1]._id }),
      false,
    )
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
  },
}
