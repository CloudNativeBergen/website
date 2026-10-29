import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import {
  countByTab,
  type ModerationPost,
  type ModerationQueueData,
  type PhotoWallAdminView,
} from '@/lib/photo-wall'
import { ModerationQueue, ModerationQueueView } from './ModerationQueue'
import { PendingSummaryView } from './PendingSummary'
import { PhotoWallAdmin } from './PhotoWallAdmin'
import type { PostActionOutcome } from './WallPostCard'

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
/** The extremes a phone can send: 1:6.4 and 6.4:1. */
const TALL = {
  url: '/storybook-fixtures/wall-tall.jpg',
  width: 320,
  height: 2048,
}
const PANORAMA = {
  url: '/storybook-fixtures/wall-panorama.jpg',
  width: 2048,
  height: 320,
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
  incarnation: { createdAt: null, assetId: null },
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

/** This conference's talks, for the tag picker (Talk photos spec §6.3). */
const TALKS = [
  {
    _id: 'talk-1',
    title: 'Opening keynote: ten years of cloud native',
    speakers: ['Ada Lovelace'],
  },
  {
    _id: 'talk-2',
    title: 'Kubernetes at scale',
    speakers: ['Bo Ek', 'Cy Dahl'],
  },
  { _id: 'talk-3', title: 'Platform engineering in practice', speakers: [] },
]
/** One tagged and one untagged card (Talk photos spec §6.3). */
const TAGGED: ModerationQueueData = {
  posts: [
    post({
      caption: 'Keynote crowd, first morning',
      name: 'Ada',
      talk: TALKS[0],
      submittedAt: '2026-10-26T07:31:00Z',
    }),
    post({
      photo: PORTRAIT,
      caption: 'Hallway track',
      submittedAt: '2026-10-26T07:34:00Z',
    }),
  ],
}
const EMPTY: ModerationQueueData = { posts: [] }

const meta = {
  title: 'Systems/PhotoWall/ModerationQueue',
  component: ModerationQueueView,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The moderation queue on `/admin/photo-wall` (Photo Wall spec §8, §10), slices M4a and M4b: the tabs **Pending**, **On the wall** and **Not shown**, and a card per Wall Post with the whole photo, the square crop the wall shows outlined, caption, name, submitted time and the Marketing OK mark. Each card offers the actions of its status: Pending **Approve**, **Reject**; On the wall **Remove**; Not shown **Approve**; a card with the Marketing OK mark **Withdraw marketing OK** (unticks it only, never ticks: for a contributor who lost the phone’s cookie, §12); every tab **Delete now**; both with an inline confirm, and in the card’s ⋯ menu with the talk tag. A `deleting` post sits in Not shown with no image, "Couldn’t delete. Try again." and only **Try again** (§12). The Pending tab has **Approve all pending (N)** with an inline confirm. What an action did is said once, politely, above the tabs. Photos are plain `<img>` elements of their Sanity URLs, never `next/image` (§5.1). Cards show a square thumbnail (click to enlarge), two columns on a phone, up to five on a wide screen. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  args: {
    queue: QUEUE,
    onAction: fn(async (): Promise<PostActionOutcome> => 'done'),
    onApproveAll: fn(async () => ({ approved: 3, pending: 3 })),
  },
} satisfies Meta<typeof ModerationQueueView>

export default meta
type Story = StoryObj<typeof meta>

const PHONE = { viewport: { defaultViewport: 'mobile1' } }

/** The ⋯ menu's items render in a portal, outside the card. */
const page = () => within(document.body)
const openMenu = (card: HTMLElement) =>
  userEvent.click(within(card).getByRole('button', { name: 'More actions' }))
const choose = async (card: HTMLElement, name: string) => {
  await openMenu(card)
  await userEvent.click(page().getByRole('menuitem', { name }))
}

/**
 * The ⋯ menu: the talk tag, Withdraw marketing OK (only with the mark) and
 * Delete now. Approve and Reject stay on the card.
 */
export const MoreActions: Story = {
  play: async ({ canvasElement }) => {
    const [first] = within(canvasElement).getAllByRole('article')
    await openMenu(first)
    await expect(
      page()
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Withdraw marketing OK', 'Delete now'])
  },
}
export const MoreActionsDark: Story = {
  ...MoreActions,
  globals: { theme: 'dark' },
}
export const MoreActionsPhone: Story = { ...MoreActions, parameters: PHONE }
export const MoreActionsPhoneDark: Story = {
  ...MoreActions,
  parameters: PHONE,
  globals: { theme: 'dark' },
}

/**
 * Undo (§10): after Approve, Reject or Remove a toast says what Undo does,
 * for 8 s (held while focused). Only the latest action can be undone.
 */
export const UndoToast: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const [first] = canvas.getAllByRole('article')
    await userEvent.click(within(first).getByRole('button', { name: 'Reject' }))
    await expect(
      await canvas.findByText('Rejected · Undo puts it on the wall'),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(args.onAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          caption: 'Keynote crowd, first morning',
          status: 'notShown',
        }),
        'approve',
      ),
    )
    await expect(canvas.queryByRole('button', { name: 'Undo' })).toBeNull()
    // Again, for the picture.
    await userEvent.click(within(first).getByRole('button', { name: 'Reject' }))
    await canvas.findByText('Rejected · Undo puts it on the wall')
  },
}
export const UndoToastDark: Story = {
  ...UndoToast,
  globals: { theme: 'dark' },
}
export const UndoToastPhone: Story = { ...UndoToast, parameters: PHONE }
export const UndoToastPhoneDark: Story = {
  ...UndoToast,
  parameters: PHONE,
  globals: { theme: 'dark' },
}

/** A thumbnail opens the whole photo, its crop outlined, in a dialog. */
export const Enlarged: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getAllByRole('button', { name: /^Enlarge/ })[0],
    )
    const dialog = await page().findByRole('dialog')
    await waitFor(() =>
      expect(within(dialog).getByTestId('crop-outline')).toBeVisible(),
    )
  },
}
export const EnlargedDark: Story = { ...Enlarged, globals: { theme: 'dark' } }
export const EnlargedPhone: Story = { ...Enlarged, parameters: PHONE }

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

/** A trusted poster's post, approved at Submit (§6.6): the label, and Remove as for any other. */
const AUTO_APPROVED: ModerationQueueData = {
  posts: [
    post({
      status: 'approved',
      caption: 'Speaker selfie before the talk',
      name: 'Ingrid',
      autoApprovedBy: 'Ingrid Hansen',
      submittedAt: '2026-10-26T08:00:00Z',
      approvedAt: '2026-10-26T08:00:00Z',
      decidedAt: '2026-10-26T08:00:00Z',
    }),
  ],
}
export const AutoApproved: Story = {
  args: { queue: AUTO_APPROVED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: 'On the wall (1)' }))
    const [card] = canvas.getAllByRole('article')
    await expect(
      within(card).getByText('Auto-approved · Ingrid Hansen'),
    ).toBeVisible()
    await expect(
      within(card).getByRole('button', { name: 'Remove' }),
    ).toBeVisible()
  },
}
export const AutoApprovedDark: Story = {
  ...AutoApproved,
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

/**
 * The tabs are keyboard tabs (WAI-ARIA): arrow keys, Home and End move and
 * select; only the selected tab is in the Tab order, and it labels the panel.
 */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = canvas.getByRole('tabpanel')
    const expectSelected = async (name: string) => {
      const selected = canvas.getByRole('tab', { name })
      await expect(selected).toHaveFocus()
      for (const t of canvas.getAllByRole('tab')) {
        await expect(t).toHaveAttribute('aria-controls', panel.id)
        await expect(t).toHaveAttribute('aria-selected', String(t === selected))
        await expect(t.tabIndex).toBe(t === selected ? 0 : -1)
      }
      await expect(panel).toHaveAttribute('aria-labelledby', selected.id)
    }
    canvas.getByRole('tab', { name: 'Pending (3)' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    await expectSelected('On the wall (2)')
    await expect(canvas.getAllByRole('article')).toHaveLength(2)
    await userEvent.keyboard('{End}')
    await expectSelected('Not shown (2)')
    await userEvent.keyboard('{ArrowLeft}')
    await expectSelected('On the wall (2)')
    await userEvent.keyboard('{Home}')
    await expectSelected('Pending (3)')
    await userEvent.keyboard('{ArrowLeft}')
    await expectSelected('Not shown (2)')
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

/**
 * A 320×2048 photo stays within 70 % of the viewport's height, and a
 * 2048×320 panorama sits centred in its frame; each outline stays on its
 * photo.
 */
export const ExtremeShapes: Story = {
  args: {
    queue: {
      posts: [
        post({
          photo: TALL,
          crop: { x: 0.5, y: 0.2 },
          caption: 'Tall one',
          submittedAt: '2026-10-26T07:31:00Z',
        }),
        post({
          photo: PANORAMA,
          crop: { x: 0.8, y: 0.5 },
          caption: 'Panorama',
          submittedAt: '2026-10-26T07:32:00Z',
        }),
      ],
    },
  },
  parameters: PHONE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tallCard = canvas.getByRole('article', { name: 'Tall one' })
    // The thumbnail is square, the photo fitted into it.
    const thumb = within(tallCard).getByTestId('thumb-box')
    const frame = thumb.parentElement!.getBoundingClientRect()
    await expect(Math.abs(frame.width - frame.height)).toBeLessThan(1)
    await expect(
      Math.abs(thumb.getBoundingClientRect().height - frame.height),
    ).toBeLessThan(1)
    await userEvent.click(
      within(tallCard).getByRole('button', { name: /^Enlarge/ }),
    )
    const tall = within(await page().findByRole('dialog'))
    const box = tall.getByTestId('photo-box').getBoundingClientRect()
    await expect(box.height).toBeLessThanOrEqual(window.innerHeight * 0.7 + 1)
    // The rendered photo is the box: the outline is placed on the photo.
    const img = tall.getByRole('img').getBoundingClientRect()
    await expect(Math.abs(img.width - box.width)).toBeLessThan(1)
    await expect(Math.abs(img.height - box.height)).toBeLessThan(1)
    const outline = tall.getByTestId('crop-outline').getBoundingClientRect()
    await expect(Math.abs(outline.width - box.width)).toBeLessThan(1)
    await expect(Math.abs(outline.height - box.width)).toBeLessThan(1)
  },
}
export const ExtremeShapesDark: Story = {
  ...ExtremeShapes,
  globals: { theme: 'dark' },
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
    look: 'pinboard',
    trustedPostersSkipApproval: false,
    closedAt: null,
  },
  posting: 'open',
  links: LINKS,
}

/** The whole admin page: the queue straight under the header, the live pending count beside its heading. */
export const InThePage: StoryObj<typeof PhotoWallAdmin> = {
  render: (args) => <PhotoWallAdmin {...args} />,
  args: {
    view: VIEW,
    conferenceTitle: 'Cloud Native Days Norway 2026',
    onSetUp: fn(),
    onChange: fn(),
    queue: (
      <ModerationQueueView
        summary={<PendingSummaryView pending={countByTab(POSTS).pending} />}
        queue={QUEUE}
        onAction={async () => 'done'}
        onApproveAll={async () => ({ approved: 3, pending: 3 })}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('region', { name: 'Settings' })).toBeNull()
    await expect(canvas.getByRole('region', { name: 'Posts' })).toBeVisible()
    await expect(canvas.getByText('Posting: Open')).toBeVisible()
    await expect(canvas.getByTestId('pending-summary')).toHaveTextContent(
      '3 photos waiting',
    )
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
/** Nothing waiting: the count says so quietly. */
export const InThePageNothingWaiting: StoryObj<typeof PhotoWallAdmin> = {
  ...InThePage,
  args: {
    ...InThePage.args!,
    queue: (
      <ModerationQueueView
        queue={EMPTY}
        summary={<PendingSummaryView pending={0} />}
      />
    ),
  },
  parameters: PHONE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('pending-summary')).toHaveTextContent(
      'Nothing waiting for approval',
    )
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
      <ModerationQueue />
    </div>
  ),
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/photoWall.moderationQueue', () =>
          HttpResponse.json({ result: { data: QUEUE } }),
        ),
        ...['approve', 'reject', 'remove'].map((name) =>
          http.post(`/api/trpc/photoWall.${name}`, () =>
            HttpResponse.json({ result: { data: { status: 'done' } } }),
          ),
        ),
        http.post('/api/trpc/photoWall.withdrawMarketing', () =>
          HttpResponse.json({ result: { data: { status: 'done' } } }),
        ),
        http.post('/api/trpc/photoWall.deletePost', () =>
          HttpResponse.json({ result: { data: { status: 'deleted' } } }),
        ),
        http.post('/api/trpc/photoWall.approveAllPending', () =>
          HttpResponse.json({ result: { data: { approved: 3, pending: 3 } } }),
        ),
        http.get('/api/trpc/photoWall.talks', () =>
          HttpResponse.json({ result: { data: TALKS } }),
        ),
        http.post('/api/trpc/photoWall.setTalkTag', () =>
          HttpResponse.json({ result: { data: { status: 'done' } } }),
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
    // An action goes through the real client to the mocked mutation.
    const first = canvas.getAllByRole('article')[0]
    await userEvent.click(
      within(first).getByRole('button', { name: 'Approve' }),
    )
    await expect(
      await canvas.findByText('Approved · Undo takes it off the wall'),
    ).toBeVisible()
  },
}

/** The last read failed or the phone is offline: the count says since when. */
export const InThePageNotCurrent: StoryObj<typeof PhotoWallAdmin> = {
  render: (args) => <PhotoWallAdmin {...args} />,
  args: {
    view: VIEW,
    conferenceTitle: 'Cloud Native Days Norway 2026',
    onSetUp: fn(),
    onChange: fn(),
    queue: (
      <ModerationQueueView
        queue={EMPTY}
        failed
        summary={
          <PendingSummaryView pending={0} staleSince="2026-10-26T09:42:00Z" />
        }
      />
    ),
  },
  parameters: PHONE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('pending-summary')).toHaveTextContent(
      'Nothing waiting for approvalNot updated since 10:42',
    )
  },
}
export const InThePageNotCurrentDark: StoryObj<typeof PhotoWallAdmin> = {
  ...InThePageNotCurrent,
  globals: { theme: 'dark' },
}
/** The first read failed: no count, and no zeros in the tabs. */
export const InThePageFirstLoadFailed: StoryObj<typeof PhotoWallAdmin> = {
  ...InThePageNotCurrent,
  args: {
    ...InThePageNotCurrent.args!,
    queue: (
      <ModerationQueueView failed summary={<PendingSummaryView failed />} />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('pending-summary')).toHaveTextContent(
      'Couldn’t load the count. Trying again…',
    )
    await expect(canvas.getByRole('tab', { name: 'Pending' })).toBeVisible()
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent(/^$/)
  },
}

/** Delete now asks first, inline (§10); focus goes to Cancel. */
export const DeleteConfirm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = canvas.getAllByRole('article')[0]
    await choose(first, 'Delete now')
    const confirm = within(first).getByRole('group', {
      name: 'Delete this photo for good? It can’t be undone.',
    })
    await expect(confirm).toBeVisible()
    await expect(
      within(confirm).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus()
  },
}
export const DeleteConfirmDark: Story = {
  ...DeleteConfirm,
  globals: { theme: 'dark' },
}
export const DeleteConfirmPhone: Story = {
  ...DeleteConfirm,
  parameters: PHONE,
}
export const DeleteConfirmPhoneDark: Story = {
  ...DeleteConfirm,
  parameters: PHONE,
  globals: { theme: 'dark' },
}

/**
 * Withdraw marketing OK asks first, inline (§12): only on a card with the
 * mark, and it can only untick; focus goes to Cancel.
 */
export const WithdrawMarketingConfirm: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const [first, second] = canvas.getAllByRole('article')
    // Only the first Pending card has the mark.
    await openMenu(second)
    await expect(
      page().queryByRole('menuitem', { name: 'Withdraw marketing OK' }),
    ).toBeNull()
    await userEvent.keyboard('{Escape}')
    await choose(first, 'Withdraw marketing OK')
    const confirm = within(first).getByRole('group', {
      name: 'Withdraw marketing OK? The photo leaves the marketing export. Only the contributor can give it again.',
    })
    await expect(confirm).toBeVisible()
    await expect(
      within(confirm).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus()
    await expect(args.onAction).not.toHaveBeenCalled()
  },
}
export const WithdrawMarketingConfirmDark: Story = {
  ...WithdrawMarketingConfirm,
  globals: { theme: 'dark' },
}
export const WithdrawMarketingConfirmPhone: Story = {
  ...WithdrawMarketingConfirm,
  parameters: PHONE,
}

/** Approve all pending (3), confirmed, then the count it reports. */
export const ApproveAll: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Approve all pending (3)' }),
    )
    await expect(
      canvas.getByRole('group', {
        name: 'Approve all 3 pending photos? They go on the wall.',
      }),
    ).toBeVisible()
    await expect(args.onApproveAll).not.toHaveBeenCalled()
  },
}
export const ApproveAllDark: Story = {
  ...ApproveAll,
  globals: { theme: 'dark' },
}
export const ApproveAllPhoneDark: Story = {
  ...ApproveAll,
  parameters: PHONE,
  globals: { theme: 'dark' },
}
/** Some posts changed meanwhile: it says how many of how many. */
export const ApproveAllPartly: Story = {
  args: { onApproveAll: fn(async () => ({ approved: 2, pending: 3 })) },
  parameters: PHONE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Approve all pending (3)' }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Approve all' }))
    await expect(canvas.getByRole('status')).toHaveTextContent(
      /^Approved 2 of 3\./,
    )
  },
}

/** A press in flight: its label says so, every action of the card waits. */
export const Busy: Story = {
  args: { onAction: fn(() => new Promise<PostActionOutcome>(() => {})) },
  parameters: PHONE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = canvas.getAllByRole('article')[0]
    await userEvent.click(
      within(first).getByRole('button', { name: 'Approve' }),
    )
    await expect(
      within(first).getByRole('button', { name: 'Approving…' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await expect(
      within(first).getByRole('button', { name: 'Reject' }),
    ).toHaveAttribute('aria-disabled', 'true')
  },
}

/** The action did not go through: the card says so. */
export const ActionFailed: Story = {
  args: { onAction: fn(async (): Promise<PostActionOutcome> => 'failed') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = canvas.getAllByRole('article')[0]
    await userEvent.click(within(first).getByRole('button', { name: 'Reject' }))
    await expect(within(first).getByRole('alert')).toHaveTextContent(
      'Couldn’t reject. Try again.',
    )
  },
}
export const ActionFailedPhoneDark: Story = {
  ...ActionFailed,
  parameters: PHONE,
  globals: { theme: 'dark' },
}

/** Another organizer decided first: nothing written, and the queue says so. */
export const ChangedMeanwhile: Story = {
  args: { onAction: fn(async (): Promise<PostActionOutcome> => 'changed') },
  parameters: PHONE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = canvas.getAllByRole('article')[0]
    await userEvent.click(
      within(first).getByRole('button', { name: 'Approve' }),
    )
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Another organizer changed this photo first. Showing it as it is now.',
    )
  },
}
export const ChangedMeanwhileDark: Story = {
  ...ChangedMeanwhile,
  globals: { theme: 'dark' },
}

/**
 * Approve all still running after a tab switch: the queue holds the run, so
 * back on Pending the row says so and a press sends nothing.
 */
export const ApproveAllInFlight: Story = {
  args: { onApproveAll: fn(() => new Promise<{ approved: number }>(() => {})) },
  parameters: PHONE,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Approve all pending (3)' }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Approve all' }))
    await userEvent.click(canvas.getByRole('tab', { name: 'On the wall (2)' }))
    await userEvent.click(canvas.getByRole('tab', { name: 'Pending (3)' }))
    const busy = canvas.getByRole('button', { name: 'Approving all…' })
    await expect(busy).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(busy)
    await expect(args.onApproveAll).toHaveBeenCalledTimes(1)
  },
}
export const ApproveAllInFlightDark: Story = {
  ...ApproveAllInFlight,
  globals: { theme: 'dark' },
}

/**
 * The talk tag (Talk photos spec §6.3): the tagged talk and its speakers, or
 * "No talk tagged.", with **Change** / **Clear tag** or **Add talk**.
 */
export const TalkTag: Story = {
  args: {
    queue: TAGGED,
    talks: TALKS,
    onSetTalk: fn(async (): Promise<PostActionOutcome> => 'done'),
  },
  play: async ({ canvasElement }) => {
    const [tagged, untagged] = within(canvasElement).getAllByRole('article')
    await expect(within(tagged).getByTestId('talk-tag')).toHaveTextContent(
      'Talk: Opening keynote: ten years of cloud native · Ada Lovelace',
    )
    await openMenu(tagged)
    await expect(
      page().getByRole('menuitem', { name: 'Clear tag' }),
    ).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await openMenu(untagged)
    await expect(
      page().getByRole('menuitem', { name: 'Add talk' }),
    ).toBeVisible()
  },
}
export const TalkTagDark: Story = { ...TalkTag, globals: { theme: 'dark' } }

/** Change opens a searchable list of this conference's talks. */
export const TalkTagPicker: Story = {
  args: TalkTag.args,
  play: async ({ canvasElement, args }) => {
    const second = within(canvasElement).getAllByRole('article')[1]
    await choose(second, 'Add talk')
    await userEvent.type(within(second).getByRole('searchbox'), 'k')
    await userEvent.click(
      within(second).getByRole('button', { name: /Kubernetes at scale/ }),
    )
    await expect(args.onSetTalk).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'Hallway track' }),
      'talk-2',
    )
    await choose(second, 'Add talk')
  },
}
export const TalkTagPickerDark: Story = {
  ...TalkTagPicker,
  globals: { theme: 'dark' },
}
