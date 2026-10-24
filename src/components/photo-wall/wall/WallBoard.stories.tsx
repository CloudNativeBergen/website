import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { WallPagePost, WallPageView } from '@/lib/photo-wall/wall'
import { WallBoardView } from './WallBoard'

/**
 * Local fixture photos (`.storybook/main.ts` staticDirs): no network. On the
 * site `src` is already Sanity's `rect=` square; here it is the whole photo,
 * which the polaroid's `object-cover` shows centred.
 */
const LANDSCAPE = '/storybook-fixtures/wall-landscape.jpg'
const PORTRAIT = '/storybook-fixtures/wall-portrait.jpg'
const PHOTO = '/storybook-fixtures/wall-photo.jpg'
const PANORAMA = '/storybook-fixtures/wall-panorama.jpg'

let n = 0
const post = (fields: Partial<WallPagePost>): WallPagePost => ({
  _id: `wallPost-${++n}`,
  src: LANDSCAPE,
  caption: null,
  name: null,
  ...fields,
})

const POSTS: WallPagePost[] = [
  post({ caption: 'Keynote crowd, first morning', name: 'Ada' }),
  post({ src: PORTRAIT, caption: 'Doors open' }),
  post({ src: PHOTO, name: 'Platform team' }),
  post({}),
  post({
    src: PANORAMA,
    caption:
      'Fjord views between talks, and the longest caption a phone allows',
    name: 'Bo',
  }),
  post({ src: PORTRAIT, caption: 'Waffles > YAML' }),
  post({ src: PHOTO, caption: 'Hallway track', name: 'Cy' }),
  post({ name: 'Di' }),
]

const view = (fields: Partial<WallPageView> = {}): WallPageView => ({
  closed: false,
  postingOpen: true,
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
          'The public Wall page `/wall` (Photo Wall spec §9.1), slice M5a: the conference on top, the approved Wall Posts as tilted Pinboard polaroids in two columns on a phone (three and four on wider screens), newest approval first, with the handwritten caption and name; **Add your photo** while posting is open; the removal-contact footer; the empty and closed states. The page polls `photoWallPublic.get` every 10 s while visible (§8). Photos are plain `<img>` elements of their Sanity URLs, never `next/image` (§5.1). Dark mode follows the global `theme` toolbar (story-level `globals`).',
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
