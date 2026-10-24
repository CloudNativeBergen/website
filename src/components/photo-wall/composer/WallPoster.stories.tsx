import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { MyPost } from '@/lib/photo-wall/my-posts'
import type { WallPostAttempt, WallPostRequest } from '@/lib/photo-wall/post'
import { ComposerClosed } from './ComposerClosed'
import { MyPostsPanel } from './MyPostsPanel'
import { WallPoster, type WallPosterProps } from './WallPoster'

type Post = NonNullable<WallPosterProps['post']>

/**
 * The stand-in server's list: each post `post` took, newest first, as
 * `getMyPosts` lists it (the photo from the JPEG that went up), until
 * `deleteMyPost` removes it. Emptied before each story. The first read
 * after a post is the authority on its card (`WallPoster`), so a server
 * that never listed it would make the card leave at once.
 */
let served: MyPost[] = []
const servedPost = (request: WallPostRequest): MyPost => ({
  _id: `wallPost-${request.uploadId}`,
  status: 'pending',
  src: URL.createObjectURL(request.photo),
  caption: request.caption || null,
  name: request.name || null,
  marketingConsent: request.marketingConsent,
  submittedAt: null,
})

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

/**
 * `/wall/post` wired to Submit (Photo Wall spec §6.3, §6.5, §12), with the
 * server stood in for: `ensureDevice`, `post` and the My posts actions are
 * mocks answering as the server would. The photo is the drawn fjord
 * fixture, picked through the real file input, so the real decode, filter
 * and bake run. Dark mode follows the global `theme` toolbar (story-level
 * `globals`), the mechanism `.storybook/preview.tsx` reads; this file has
 * no decorator of its own.
 */
const meta = {
  title: 'Systems/PhotoWall/Poster',
  component: WallPoster,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'phone' },
  },
  beforeEach: () => {
    served = []
  },
  args: {
    logo: { title: 'Cloud Native Days Norway' },
    deletesOn: '2026-11-26',
    ensureDevice: fn(async () => true),
    post: fn<Post>(async (request) => {
      served = [servedPost(request), ...served]
      return { ok: true }
    }),
    getMyPosts: fn<WallPosterProps['getMyPosts']>(async () => served),
    deleteMyPost: fn<WallPosterProps['deleteMyPost']>(async (postId) => {
      served = served.filter((p) => p._id !== postId)
      return { status: 'deleted' }
    }),
    setMyPostMarketing: fn<WallPosterProps['setMyPostMarketing']>(async () => ({
      status: 'done',
    })),
  },
} satisfies Meta<typeof WallPoster>

export default meta
type Story = StoryObj<typeof meta>

async function pickFixture(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const response = await fetch('/storybook-fixtures/wall-photo.jpg')
  const file = new File([await response.blob()], 'IMG_0042.jpg', {
    type: 'image/jpeg',
  })
  await userEvent.upload(canvas.getByLabelText('Choose from your photos'), file)
  await waitFor(
    () =>
      expect(canvas.getByRole('heading', { name: 'Your photo' })).toHaveFocus(),
    { timeout: 10_000 },
  )
  return canvas
}

/** Picks the fixture, writes a caption and a name, and presses Post. */
async function postFixture(canvasElement: HTMLElement) {
  const canvas = await pickFixture(canvasElement)
  await userEvent.type(canvas.getByLabelText('Caption'), 'Coffee #3 and k8s')
  await userEvent.type(canvas.getByLabelText('Your name (optional)'), 'Kari')
  await userEvent.click(
    canvas.getByRole('button', { name: 'Post to the wall' }),
  )
  return canvas
}

/** The post went in: My posts, with the new card Waiting for approval. */
export const Posted: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = await postFixture(canvasElement)
    await waitFor(
      () =>
        expect(canvas.getByRole('heading', { name: 'My posts' })).toHaveFocus(),
      { timeout: 10_000 },
    )
    const [[request]] = (
      args.post as ReturnType<typeof fn<(r: WallPostRequest) => unknown>>
    ).mock.calls
    await expect(request.uploadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    await expect(canvas.getByText('Waiting for approval')).toBeVisible()
    await expect(canvas.getByText('Coffee #3 and k8s')).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: 'See the wall' }),
    ).toHaveAttribute('href', '/wall')
  },
}

export const PostedDark: Story = {
  ...Posted,
  globals: { theme: 'dark' },
}

/** Two posts: the newest on top. */
export const PostedTwice: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await postFixture(canvasElement)
    await userEvent.click(
      await canvas.findByRole(
        'button',
        { name: 'Post another photo' },
        { timeout: 10_000 },
      ),
    )
    const again = await pickFixture(canvasElement)
    await userEvent.type(again.getByLabelText('Caption'), 'Second one')
    await userEvent.click(
      again.getByRole('button', { name: 'Post to the wall' }),
    )
    await waitFor(
      () => expect(canvas.getAllByText('Waiting for approval')).toHaveLength(2),
      { timeout: 10_000 },
    )
    const captions = canvas
      .getAllByRole('img', { name: /^Your photo/ })
      .map((img) => img.getAttribute('alt'))
    await expect(captions).toEqual([
      'Your photo: Second one',
      'Your photo: Coffee #3 and k8s',
    ])
  },
}

/** A device limit: its message, and the photo and fields stay. */
export const RefusedPendingDevice: Story = {
  args: {
    post: fn<Post>(async () => ({
      ok: false,
      refusal: 'pendingDevice',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = await postFixture(canvasElement)
    await waitFor(
      () =>
        expect(canvas.getByRole('alert')).toHaveTextContent(
          'You have 3 photos waiting for approval. You can post again once an organizer has looked at one.',
        ),
      { timeout: 10_000 },
    )
    await expect(canvas.getByLabelText('Caption')).toHaveValue(
      'Coffee #3 and k8s',
    )
  },
}

export const RefusedPendingDeviceDark: Story = {
  ...RefusedPendingDevice,
  globals: { theme: 'dark' },
}

/** Posting closed meanwhile: the message with See the wall. */
export const RefusedClosed: Story = {
  args: {
    post: fn<Post>(async () => ({
      ok: false,
      refusal: 'closed',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = await postFixture(canvasElement)
    const alert = await canvas.findByRole('alert', {}, { timeout: 10_000 })
    await expect(alert).toHaveTextContent(
      'The wall isn’t open for photos right now.',
    )
    await expect(
      within(alert).getByRole('link', { name: 'See the wall' }),
    ).toHaveAttribute('href', '/wall')
  },
}

export const RefusedClosedDark: Story = {
  ...RefusedClosed,
  globals: { theme: 'dark' },
}

/** Every attempt lost: the generic message; the next press retries. */
export const Lost: Story = {
  args: {
    post: fn<Post>(async () => ({ ok: false, lost: true })),
  },
  play: async ({ canvasElement }) => {
    const canvas = await postFixture(canvasElement)
    await waitFor(
      () =>
        expect(canvas.getByRole('alert')).toHaveTextContent(
          'Something went wrong. Your photo wasn’t posted. Try again.',
        ),
      { timeout: 10_000 },
    )
  },
}

/** The post going up: Posting… keeps focus, the bar under it says how far. */
export const Uploading: Story = {
  args: {
    post: fn<Post>(
      (...[, { onProgress }]) =>
        new Promise<WallPostAttempt>(() => onProgress?.(0.42)),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = await postFixture(canvasElement)
    const bar = await canvas.findByRole(
      'progressbar',
      { name: 'Uploading your photo' },
      { timeout: 10_000 },
    )
    await expect(bar).toHaveAttribute('aria-valuenow', '42')
    await expect(canvas.getByRole('button', { name: 'Posting…' })).toHaveFocus()
  },
}

export const UploadingDark: Story = {
  ...Uploading,
  globals: { theme: 'dark' },
}

/** `ensureDevice` has not answered yet: Post to the wall waits. */
export const GettingReady: Story = {
  args: {
    ensureDevice: fn(() => new Promise<boolean>(() => {})),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = await pickFixture(canvasElement)
    const button = canvas.getByRole('button', { name: 'Post to the wall' })
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(button)
    await expect(args.post).not.toHaveBeenCalled()
  },
}

/** This phone posted before (§6.5): My posts sits under the landing. */
export const LandingWithMyPosts: Story = {
  args: {
    getMyPosts: fn<WallPosterProps['getMyPosts']>(async () => EARLIER),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('heading', { level: 2, name: 'My posts' }),
    ).toBeVisible()
    await expect(canvas.getByText('On the wall')).toBeVisible()
    await expect(canvas.getByText('Not shown')).toBeVisible()
    await expect(canvas.getByLabelText('Take a photo')).toBeVisible()
  },
}

export const LandingWithMyPostsDark: Story = {
  ...LandingWithMyPosts,
  globals: { theme: 'dark' },
}

/** Outside the Posting Window (§6.5): only the closed line and See the wall. */
export const Closed: Story = {
  render: (args) => <ComposerClosed logo={args.logo} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('The wall isn’t open for photos right now.'),
    ).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: 'See the wall' }),
    ).toHaveAttribute('href', '/wall')
  },
}

export const ClosedDark: Story = {
  ...Closed,
  globals: { theme: 'dark' },
}

/** Closed, with this phone's posts under See the wall: Delete still works (§12). */
export const ClosedWithMyPosts: Story = {
  args: {
    getMyPosts: fn<WallPosterProps['getMyPosts']>(async () => EARLIER),
  },
  render: (args) => (
    <ComposerClosed logo={args.logo}>
      <MyPostsPanel
        getMyPosts={args.getMyPosts}
        deleteMyPost={args.deleteMyPost}
        setMyPostMarketing={args.setMyPostMarketing}
      />
    </ComposerClosed>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('heading', { level: 2, name: 'My posts' }),
    ).toBeVisible()
    await expect(
      canvas.getAllByRole('button', { name: 'Delete' }),
    ).toHaveLength(2)
  },
}

export const ClosedWithMyPostsDark: Story = {
  ...ClosedWithMyPosts,
  globals: { theme: 'dark' },
}

/** Closed by the retention cron (§11.1): "This wall has closed." */
export const WallClosed: Story = {
  render: (args) => <ComposerClosed logo={args.logo} wallClosed />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('This wall has closed.')).toBeVisible()
    await expect(
      canvas.queryByText('The wall isn’t open for photos right now.'),
    ).not.toBeInTheDocument()
    await expect(
      canvas.getByRole('link', { name: 'See the wall' }),
    ).toHaveAttribute('href', '/wall')
  },
}

export const WallClosedDark: Story = {
  ...WallClosed,
  globals: { theme: 'dark' },
}
