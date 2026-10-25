import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { WallPagePost, WallPageView } from '@/lib/photo-wall/wall'
import { STORY_PHOTOS, storyPhoto } from '../story-photos'
import { WallBoardView } from './WallBoard'

const { landscape, portrait, photo, panorama, tall } = STORY_PHOTOS

let n = 0
const post = (fields: Partial<WallPagePost>): WallPagePost => {
  n += 1
  return {
    _id: `wallPost-${n}`,
    ...storyPhoto(landscape),
    caption: null,
    name: null,
    // Approved a few minutes apart on the first morning, newest first.
    approvedAt: new Date(
      Date.parse('2026-10-26T09:00:00Z') - n * 4 * 60_000,
    ).toISOString(),
    ...fields,
  }
}

const POSTS: WallPagePost[] = [
  post({ caption: 'Keynote crowd, first morning', name: 'Ada' }),
  post({ ...storyPhoto(portrait), caption: 'Doors open' }),
  post({ ...storyPhoto(photo), name: 'Platform team' }),
  post({}),
  post({
    ...storyPhoto(panorama),
    caption:
      'Fjord views between talks, and the longest caption a phone allows',
    name: 'Bo',
  }),
  post({ ...storyPhoto(portrait), caption: 'Waffles > YAML' }),
  post({ ...storyPhoto(tall), caption: 'Up the stairs to room 3' }),
  post({ ...storyPhoto(photo), caption: 'Hallway track', name: 'Cy' }),
  post({ name: 'Di' }),
]

const view = (fields: Partial<WallPageView> = {}): WallPageView => ({
  closed: false,
  postingOpen: true,
  look: 'pinboard',
  posts: POSTS,
  ...fields,
})

const meta = {
  title: 'Systems/PhotoWall/WallBoard',
  component: WallBoardView,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        component:
          "The public Wall page `/wall` (Photo Wall spec §9.1), slices M5a, P3 and P4: the conference on top, the approved Wall Posts in the wall's look, newest approval first: **Pinboard**, tilted polaroids in two columns on a phone (three and four on wider screens) with the handwritten caption and name; **Mosaic**, a masonry of whole photos with the caption over a gradient; **Spotlight**, a single-column feed with the name, time and caption. **Add your photo** while posting is open; the removal-contact footer; the empty and closed states. The page polls `photoWallPublic.get` every 10 s while visible (§8). Photos are plain `<img>` elements of their Sanity URLs, never `next/image` (§5.1). Dark mode follows the global `theme` toolbar (story-level `globals`).",
      },
    },
  },
  args: {
    view: view(),
    conference: {
      logo: { title: 'Cloud Native Days Norway' },
      title: 'Cloud Native Days Norway 2026',
      contactEmail: 'hello@cloudnativedays.no',
    },
  },
} satisfies Meta<typeof WallBoardView>

export default meta
type Story = StoryObj<typeof meta>

export const Wall: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('figure')).toHaveLength(POSTS.length)
    await expect(
      canvas.getByRole('link', { name: /Add your photo/ }),
    ).toHaveAttribute('href', '/wall/post')
    // Every photo is a plain <img> of its own URL.
    const srcs = canvas
      .getAllByRole('img', { name: /Photo/ })
      .map((img) => img.getAttribute('src'))
    await expect(srcs).toEqual(POSTS.map((p) => p.src))
    await expect(canvas.queryByRole('navigation')).toBeNull()
  },
}
export const WallDark: Story = { globals: { theme: 'dark' } }

/** Mosaic (P3): whole photos edge to edge, each spanning its own shape. */
export const Mosaic: Story = {
  args: { view: view({ look: 'mosaic' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const srcs = canvas
      .getAllByRole('img', { name: /Photo/ })
      .map((img) => img.getAttribute('src'))
    await expect(srcs).toEqual(POSTS.map((p) => p.whole.src))
    await expect(canvas.getByText('Keynote crowd, first morning')).toBeVisible()
  },
}
export const MosaicDark: Story = {
  args: { view: view({ look: 'mosaic' }) },
  globals: { theme: 'dark' },
}

/** Spotlight (P4): a feed, one whole photo after another. */
export const Spotlight: Story = {
  args: { view: view({ look: 'spotlight' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(POSTS.length)
    await expect(canvas.getByText('Mon 26 Oct, 09:56')).toBeVisible()
  },
}
export const SpotlightDark: Story = {
  args: { view: view({ look: 'spotlight' }) },
  globals: { theme: 'dark' },
}

/** Paused, or outside the Posting Window: the wall without the button. */
export const PostingNotOpen: Story = {
  args: { view: view({ postingOpen: false }) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('link', { name: /Add your photo/ }),
    ).toBeNull()
  },
}

export const Empty: Story = {
  args: { view: view({ posts: [] }) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('No photos yet.'),
    ).toBeVisible()
  },
}
export const EmptyDark: Story = {
  args: { view: view({ posts: [] }) },
  globals: { theme: 'dark' },
}

/** The cap: the 200 newest approvals, said at the end. */
export const TwoHundred: Story = {
  args: {
    view: view({
      posts: Array.from({ length: 200 }, (_, i) =>
        post({ ...POSTS[i % POSTS.length], _id: `wallPost-cap-${i}` }),
      ),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('The 200 newest photos.'),
    ).toBeInTheDocument()
  },
}

/** After the retention cron closed it (§11.1). */
export const Closed: Story = {
  args: { view: view({ closed: true, posts: [] }) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('This wall has closed.'),
    ).toBeVisible()
  },
}
export const ClosedDark: Story = {
  args: { view: view({ closed: true, posts: [] }) },
  globals: { theme: 'dark' },
}
